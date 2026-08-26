"""Sentinel Probes MCP server.

Exposes MCP Sentinel scans as tools a TrueForge agent can call over HTTP.

Run:
    uvicorn probe_server.server:mcp_app --host 127.0.0.1 --port 8000
    # or: python -m probe_server.server

Then register http://127.0.0.1:8000/mcp in TrueForge under Settings -> Connectors.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP

SCAN_TIMEOUT_SECONDS = 900
_REPORT_EXIT_CODES = (0, 1)  # 0 = clean, 1 = findings at/over fail threshold

mcp = FastMCP("sentinel-probes", host="127.0.0.1", port=8000)


async def _run_scan(target_dir: str, *extra_flags: str) -> dict:
    """Run the scanner CLI (`python -m sentinel`) and return the parsed JSON report."""
    target = Path(target_dir).expanduser().resolve()
    if not target.is_dir():
        raise ValueError(f"target directory does not exist: {target}")

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
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=SCAN_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError(f"sentinel scan timed out after {SCAN_TIMEOUT_SECONDS}s")

    if proc.returncode not in _REPORT_EXIT_CODES:
        raise RuntimeError(
            f"sentinel exited {proc.returncode}: {stderr.decode(errors='replace')[-2000:]}"
        )
    return json.loads(stdout.decode())


@mcp.tool(
    annotations={"readOnlyHint": True, "title": "Sentinel static analysis"},
)
async def static_audit(target_dir: str) -> dict:
    """Fast static security analysis of an MCP server directory.

    Runs Sentinel's AST rules and Semgrep (SENT-001..007): unsafe execution,
    hardcoded credentials, missing input validation, excessive permissions,
    insecure prompt construction, missing auth, unverified manifests.
    No Docker and no model calls, so it is cheap and safe to run freely.
    Maps every finding to the OWASP Agentic Top 10.
    """
    # Degraded mode parks unreviewed candidates as needs_review instead of
    # failing when no model key is configured - keeps this tool self-contained.
    return await _run_scan(target_dir, "--static-only", "--allow-degraded")


@mcp.tool(
    annotations={"readOnlyHint": True, "title": "Sentinel full audit (dynamic probes)"},
)
async def full_audit(target_dir: str, allow_degraded: bool = False) -> dict:
    """Full Sentinel audit of an MCP server directory.

    Static rules + GPT semantic review + Docker-sandboxed dynamic probes
    (SENT-008 out-of-scope execution, SENT-009 oversized args, SENT-010
    injection payloads, SENT-011 malformed schema input).

    Requires Docker running on this machine. Uses OPENAI_API_KEY for live
    review unless allow_degraded degrades to needs_review instead of failing.
    Slow: budget several minutes per scan.
    """
    flags = ["--allow-degraded"] if allow_degraded else []
    return await _run_scan(target_dir, *flags)


@mcp.tool(
    annotations={"readOnlyHint": True, "title": "Read target manifests"},
)
async def read_target_manifest(target_dir: str) -> dict:
    """Read an MCP server's declared manifests without running anything.

    Returns the contents of sentinel.target.yaml, tools.yaml,
    sentinel.permissions.yaml and similar YAML files so the agent can reason
    about declared tool schemas, scopes, and permission boundaries.
    """
    target = Path(target_dir).expanduser().resolve()
    if not target.is_dir():
        raise ValueError(f"target directory does not exist: {target}")

    manifests: dict[str, str] = {}
    for pattern in ("*.yaml", "*.yml"):
        for path in sorted(target.glob(pattern)):
            if path.is_file():
                manifests[path.name] = path.read_text(encoding="utf-8")[:20000]
    return {"target": str(target), "manifests": manifests}


def main() -> None:
    mcp.run(transport="streamable-http")


# WSGI-free ASGI app entry point for uvicorn.
mcp_app = mcp.streamable_http_app()

if __name__ == "__main__":
    main()
