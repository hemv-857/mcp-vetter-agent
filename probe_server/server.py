"""Sentinel Probes MCP server.

Exposes MCP Sentinel scans as tools a TrueForge agent can call over HTTP.
Every tool always returns a JSON dict - errors are structured values, never raises.

Run:
    .venv/bin/uvicorn probe_server.server:mcp_app --host 127.0.0.1 --port 8000
    # or: .venv/bin/python -m probe_server.server

Then register http://127.0.0.1:8000/mcp in TrueForge under Settings -> Connectors.
"""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

STATIC_TIMEOUT_SECONDS = 30
FULL_TIMEOUT_SECONDS = 300
_REPORT_EXIT_CODES = (0, 1)  # 0 = clean, 1 = findings at/over fail threshold

mcp = FastMCP("sentinel-probes", host="127.0.0.1", port=8000)


def _docker_available() -> bool:
    """True when a Docker daemon answers."""
    if shutil.which("docker") is None:
        return False
    try:
        result = subprocess.run(
            ["docker", "info", "--format", "{{.ServerVersion}}"],
            capture_output=True,
            timeout=10,
            check=False,
        )
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def _resolve_target(target_dir: str) -> Path:
    target = Path(target_dir).expanduser().resolve()
    if not target.is_dir():
        raise ValueError(f"target directory does not exist: {target}")
    return target


async def _run_scan(
    target_dir: str, *extra_flags: str, timeout: int = FULL_TIMEOUT_SECONDS
) -> dict[str, Any]:
    """Run the scanner CLI (`python -m sentinel`) and return the parsed JSON report."""
    try:
        target = _resolve_target(target_dir)
    except ValueError as error:
        return {"error": str(error)}

    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "sentinel",
        "scan",
        str(target),
        "--format",
        "json",
        *extra_flags,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return {
            "error": f"scan timed out after {timeout}s",
            "timeout": True,
            "timed_out_after_seconds": timeout,
        }

    if proc.returncode not in _REPORT_EXIT_CODES:
        return {
            "error": f"scanner exited with code {proc.returncode}",
            "exit_code": proc.returncode,
            "stderr_tail": stderr.decode(errors="replace")[-2000:],
        }
    try:
        report: dict[str, Any] = json.loads(stdout.decode())
    except json.JSONDecodeError:
        return {"error": "invalid scanner output", "parse_failed": True}
    return report


@mcp.tool(
    annotations={"readOnlyHint": True, "title": "Sentinel static analysis"},
)
async def static_audit(target_dir: str) -> dict[str, Any]:
    """Fast static security analysis of an MCP server directory.

    Runs Sentinel's AST rules and Semgrep (SENT-001..007): unsafe execution,
    hardcoded credentials, missing input validation, excessive permissions,
    insecure prompt construction, missing auth, unverified manifests.
    No Docker and no model calls, so it is cheap and safe to run freely.
    Findings map to the OWASP Agentic Top 10. Budget up to 30 seconds.
    """
    # Degraded mode parks unreviewed candidates as needs_review instead of
    # failing when no model key is configured - keeps this tool self-contained.
    return await _run_scan(
        target_dir, "--static-only", "--allow-degraded", timeout=STATIC_TIMEOUT_SECONDS
    )


@mcp.tool(
    annotations={"readOnlyHint": True, "title": "Sentinel full audit (dynamic probes)"},
)
async def full_audit(target_dir: str, allow_degraded: bool = False) -> dict[str, Any]:
    """Full security audit of an MCP server directory.

    Static rules + GPT semantic review + Docker-sandboxed dynamic probes
    (SENT-008 out-of-scope execution, SENT-009 oversized args, SENT-010
    injection payloads, SENT-011 malformed schema input).

    Requires Docker running on this machine. Uses OPENAI_API_KEY for live
    review unless allow_degraded degrades to needs_review instead of failing.
    Slow: budget up to 5 minutes per scan.
    """
    if not _docker_available():
        return {"error": "Docker required for dynamic probes", "docker_available": False}
    flags = ["--allow-degraded"] if allow_degraded else []
    return await _run_scan(target_dir, *flags, timeout=FULL_TIMEOUT_SECONDS)


@mcp.tool(
    annotations={"readOnlyHint": True, "title": "Read target manifests"},
)
async def read_target_manifest(target_dir: str) -> dict[str, Any]:
    """Read an MCP server's declared manifests without running anything.

    Returns the contents of sentinel.target.yaml, tools.yaml,
    sentinel.permissions.yaml and similar YAML files so the agent can reason
    about declared tool schemas, scopes, and permission boundaries.
    """
    try:
        target = _resolve_target(target_dir)
    except ValueError as error:
        return {"error": str(error)}

    manifests: dict[str, str] = {}
    for pattern in ("*.yaml", "*.yml"):
        for path in sorted(target.glob(pattern)):
            if path.is_file():
                manifests[path.name] = path.read_text(encoding="utf-8")[:20000]
    return {"target": str(target), "manifests": manifests}


@mcp.custom_route("/health", methods=["GET"])
async def health(request: Any) -> Any:
    """Liveness plus Docker availability (dynamic probes depend on it)."""
    from starlette.responses import JSONResponse

    return JSONResponse({"status": "ok", "docker_available": _docker_available()})


def main() -> None:
    mcp.run(transport="streamable-http")


# ASGI app entry point for uvicorn (serves the MCP streamable-HTTP transport at /mcp).
mcp_app = mcp.streamable_http_app()

if __name__ == "__main__":
    main()
