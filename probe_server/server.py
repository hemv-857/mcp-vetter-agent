"""MCP Vetting probe server.

Exposes security scans as tools a TrueForge agent can call over HTTP.
Every tool always returns a JSON dict - errors are structured values, never raises.

Run:
    .venv/bin/uvicorn probe_server.server:mcp_app --host 127.0.0.1 --port 8000
    # or: .venv/bin/python -m probe_server.server

Then register http://127.0.0.1:8000/mcp in TrueForge under Settings -> Connectors.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from contextlib import suppress
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from mcp.server.fastmcp import FastMCP
from starlette.middleware.cors import CORSMiddleware

STATIC_TIMEOUT_SECONDS = 30
FULL_TIMEOUT_SECONDS = 300
CLONE_TIMEOUT_SECONDS = 120
_REPORT_EXIT_CODES = (0, 1)  # 0 = clean, 1 = findings at/over fail threshold

# Dev-only replay. When the security_scanner engine is not installed on this host,
# VETTING_DEV_FIXTURES=1 makes the audit tools return a captured report so the
# review/approval flow stays exercisable. Every replayed report carries
# sample_data=true so no consumer can mistake it for a live scan. Off by default.
_SAMPLE_REPORT = Path(__file__).parent / "sample_report.json"


def dev_fixtures_enabled() -> bool:
    """Read at call time, not import time, so it is togglable and testable."""
    return os.environ.get("VETTING_DEV_FIXTURES") == "1"


def _looks_like_the_vulnerable_fixture(target: str) -> bool:
    """Cheap content check so replay does not depend on the directory's name.

    A clone lands in /tmp/vetted-*/repo, so the path tells us nothing. The
    captured findings describe specific defects, so only replay them for a
    target that actually contains those defects.

    NOTE: requires at least 2 of the 4 distinctive markers in the vulnerable
    fixture to avoid attributing false findings to unrelated repos. This exists
    only to keep the demo honest while the real engine is unavailable, and dies
    with it.
    """
    markers = {
        "unsafe_calculator": re.compile(r"unsafe_calculator"),
        "eval_call": re.compile(r"(?<![\w.])eval\("),
        "hardcoded_token": re.compile(r"ghp_[A-Za-z0-9]{16}"),
        "admin_route": re.compile(r'@app\.post\("/admin"\)'),
    }
    found = set()
    try:
        for path in list(Path(target).glob("*.py"))[:20]:
            text = path.read_text(encoding="utf-8", errors="replace")
            for name, pattern in markers.items():
                if name in found:
                    continue
                if pattern.search(text):
                    found.add(name)
    except OSError:
        return False
    return len(found) >= 2


def _sample_report(target: str, scan_type: str) -> dict[str, Any]:
    """Replay the captured report, tagged so the UI must label it as sample data.

    The captured findings describe the vulnerable fixture specifically, so they
    are only replayed for a target that actually looks like it. Anything else
    replays a clean report rather than attributing someone else's defects to it.
    """
    report: dict[str, Any] = json.loads(_SAMPLE_REPORT.read_text(encoding="utf-8"))
    dynamic = report.pop("dynamic_findings", [])
    if not _looks_like_the_vulnerable_fixture(target):
        report["findings"] = []
        report["sample_reason"] = (
            "security_scanner engine not installed; replaying a clean report because the "
            "captured findings only describe the vulnerable fixture"
        )
    elif scan_type == "full":
        report["findings"] = report["findings"] + dynamic
    report["scan_type"] = scan_type
    report["target"] = target
    return report

mcp = FastMCP("mcp-vetting", host="0.0.0.0", port=8000)


async def _docker_available() -> bool:
    """True when a Docker daemon answers. Async so a hung daemon can't stall the loop."""
    if shutil.which("docker") is None:
        return False

    def _probe() -> bool:
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

    return await asyncio.to_thread(_probe)


def _resolve_target(target_dir: str) -> Path:
    target = Path(target_dir).expanduser().resolve()
    if not target.is_dir():
        raise ValueError(f"target directory does not exist: {target}")
    return target


async def _run_scan(
    target_dir: str,
    *extra_flags: str,
    timeout: int = FULL_TIMEOUT_SECONDS,
    scan_type: str = "full",
) -> dict[str, Any]:
    """Run the scanner CLI and return the parsed JSON report."""
    try:
        target = _resolve_target(target_dir)
    except ValueError as error:
        return {"error": str(error)}

    if dev_fixtures_enabled():
        return _sample_report(str(target), scan_type)

    # Try external scanner first; fall back to inline scanner if not installed.
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "security_scanner",
            "scan",
            str(target),
            "--format",
            "json",
            *extra_flags,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
    except OSError:
        from probe_server.inline_scanner import scan as inline_scan
        return await asyncio.to_thread(inline_scan, str(target))

    async def _reap() -> None:
        with suppress(ProcessLookupError):
            os.killpg(proc.pid, signal.SIGKILL)
        await proc.wait()

    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        await _reap()
        return {
            "error": f"scan timed out after {timeout}s",
            "timeout": True,
            "timed_out_after_seconds": timeout,
        }

    # If scanner failed to launch or module not found, fall back to inline.
    stderr_text = stderr.decode(errors="replace")
    if proc.returncode != 0 and ("No module named" in stderr_text or proc.returncode == 1):
        from probe_server.inline_scanner import scan as inline_scan
        return await asyncio.to_thread(inline_scan, str(target))

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


def _sweep_old_clones(max_age_seconds: int = 86400) -> None:
    """Best-effort disk reclamation for clones abandoned by earlier audits.

    NOTE: mtime-based sweep, not refcounting - per-target cleanup hooks
    only if tempdir growth ever becomes measurable.
    """
    now = time.time()
    for path in Path(tempfile.gettempdir()).glob("vetted-*"):
        try:
            if now - path.stat().st_mtime > max_age_seconds:
                shutil.rmtree(path, ignore_errors=True)
        except OSError:
            continue


def _validate_clone_url(repo_url: str) -> str | None:
    """Return an error string for disallowed URLs, else None (URL is acceptable)."""
    try:
        parts = urlsplit(repo_url.strip())
        host = (parts.hostname or "").lower()
    except ValueError:
        return "malformed URL"
    if parts.scheme != "https" or not host:
        return "only https git repository URLs are accepted"
    private = host in ("localhost", "metadata", "metadata.google.internal") or (
        host.endswith((".local", ".internal", ".lan", ".home", ".corp"))
    )
    if not private and re.match(r"^(\d{1,3}\.){3}\d{1,3}$", host):
        # raw IPv4: reject RFC1918/loopback/link-local; public IPs are fine
        octets = [int(o) for o in host.split(".")]
        private = (
            octets[0] == 127
            or octets[0] == 10
            or (octets[0] == 192 and octets[1] == 168)
            or (octets[0] == 172 and 16 <= octets[1] <= 31)
            or (octets[0] == 169 and octets[1] == 254)
            or octets[0] == 0
        )
    if private:
        return "refusing to clone from a private or local network address"
    segments = [s for s in parts.path.split("/") if s]
    if len(segments) < 2:
        return "URL must point at a repository (owner/repo)"
    return None


@mcp.tool(
    annotations={"readOnlyHint": False, "title": "Clone audit target"},
)
async def clone_target(repo_url: str) -> dict[str, Any]:
    """Clone a public git repository onto this host so it can be scanned.

    Accepts standard https URLs with or without a .git suffix. Returns
    {"target": "<local path>"} - pass that path to static_audit,
    full_audit and read_target_manifest. Shallow clone, hard 120s limit,
    fresh temp directory per call, private-network addresses refused.
    """
    error = _validate_clone_url(repo_url)
    if error:
        return {"error": error, "url": repo_url}
    # NOTE: sweep in a thread - deleting big stale trees must not stall the loop
    await asyncio.to_thread(_sweep_old_clones)

    dest = tempfile.mkdtemp(prefix="vetted-")
    try:
        proc = await asyncio.create_subprocess_exec(
            "git",
            "clone",
            "--depth",
            "1",
            "--quiet",
            repo_url.strip(),
            dest + "/repo",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
    except OSError as error:
        shutil.rmtree(dest, ignore_errors=True)
        return {"error": f"failed to launch git: {error}"}

    async def _reap() -> None:
        with suppress(ProcessLookupError):
            os.killpg(proc.pid, signal.SIGKILL)
        await proc.wait()

    async def _cleanup() -> None:
        await asyncio.to_thread(shutil.rmtree, dest, ignore_errors=True)

    try:
        _, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=CLONE_TIMEOUT_SECONDS
        )
    except asyncio.CancelledError:
        await _reap()
        await _cleanup()
        raise
    except asyncio.TimeoutError:
        await _reap()
        await _cleanup()
        return {
            "error": f"clone timed out after {CLONE_TIMEOUT_SECONDS}s",
            "timeout": True,
        }

    if proc.returncode != 0:
        tail = stderr.decode(errors="replace")[-500:]
        await _cleanup()
        return {"error": "git clone failed", "git_stderr_tail": tail}
    return {"target": dest + "/repo"}


@mcp.tool(
    annotations={"readOnlyHint": True, "title": "Static security analysis"},
)
async def static_audit(target_dir: str) -> dict[str, Any]:
    """Fast static security analysis of an MCP server directory.

    Runs AST rules and pattern matching (VULN-001..007): unsafe execution,
    hardcoded credentials, missing input validation, excessive permissions,
    insecure prompt construction, missing auth, unverified manifests.
    No Docker and no model calls, so it is cheap and safe to run freely.
    Findings map to the OWASP Agentic Top 10. Budget up to 30 seconds.
    """
    # Degraded mode parks unreviewed candidates as needs_review instead of
    # failing when no model key is configured - keeps this tool self-contained.
    return await _run_scan(
        target_dir,
        "--static-only",
        "--allow-degraded",
        timeout=STATIC_TIMEOUT_SECONDS,
        scan_type="static",
    )


@mcp.tool(
    annotations={"readOnlyHint": True, "title": "Full security audit (dynamic probes)"},
)
async def full_audit(target_dir: str, allow_degraded: bool = False) -> dict[str, Any]:
    """Full security audit of an MCP server directory.

    Static rules + GPT semantic review + Docker-sandboxed dynamic probes
    (VULN-008 out-of-scope execution, VULN-009 oversized args, VULN-010
    injection payloads, VULN-011 malformed schema input).

    Requires Docker running on this machine. Uses OPENAI_API_KEY for live
    review unless allow_degraded degrades to needs_review instead of failing.
    Slow: budget up to 5 minutes per scan.
    """
    if not dev_fixtures_enabled() and not await _docker_available():
        return {"error": "Docker required for dynamic probes", "docker_available": False}
    flags = ["--allow-degraded"] if allow_degraded else []
    return await _run_scan(
        target_dir, *flags, timeout=FULL_TIMEOUT_SECONDS, scan_type="full"
    )


@mcp.tool(
    annotations={"readOnlyHint": True, "title": "Read target manifests"},
)
async def read_target_manifest(target_dir: str) -> dict[str, Any]:
    """Read an MCP server's declared manifests without running anything.

    Returns the contents of target.yaml, tools.yaml,
    permissions.yaml and similar YAML files so the agent can reason
    about declared tool schemas, scopes, and permission boundaries.
    Symlinks are ignored; nothing outside the target directory is read.
    """
    try:
        target = _resolve_target(target_dir)
    except ValueError as error:
        return {"error": str(error)}

    manifests: dict[str, str] = {}
    skipped: list[str] = []
    for pattern in ("*.yaml", "*.yml"):
        for path in sorted(target.glob(pattern)):
            if path.is_symlink() or not path.is_file():
                continue
            real = Path(os.path.realpath(path))
            if not real.is_relative_to(target):
                continue  # never read anything that resolves outside the target
            try:
                manifests[path.name] = path.read_text(encoding="utf-8")[:20000]
            except (OSError, UnicodeDecodeError) as error:
                skipped.append(f"{path.name}: {type(error).__name__}")
    return {"target": str(target), "manifests": manifests, "skipped": skipped}


@mcp.tool(
    annotations={"readOnlyHint": False, "destructiveHint": True, "title": "File GitHub security issue"},
)
async def file_github_issue(
    repo_url: str,
    title: str,
    body: str,
    labels: list[str] | None = None,
) -> dict[str, Any]:
    """File a security issue on a public GitHub repository.

    This is the only write action in the server and the only step that leaves
    this host. It requires GITHUB_TOKEN (repo scope) in the environment; the
    token is never accepted from, or returned to, the caller.
    Returns {"url": ..., "number": ...} on success.
    """
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return {
            "error": "GITHUB_TOKEN not configured on the probe server",
            "github_configured": False,
        }
    if not title.strip():
        return {"error": "issue title must not be empty"}
    if not body.strip():
        return {"error": "issue body must not be empty"}

    try:
        parts = urlsplit(repo_url.strip())
    except ValueError:
        return {"error": "malformed repository URL", "url": repo_url}
    if (parts.hostname or "").lower() not in ("github.com", "www.github.com"):
        return {"error": "issues can only be filed on github.com", "url": repo_url}
    segments = [s for s in parts.path.split("/") if s]
    if len(segments) < 2:
        return {"error": "URL must point at a repository (owner/repo)", "url": repo_url}
    owner, repo = segments[0], segments[1].removesuffix(".git")

    import httpx

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"https://api.github.com/repos/{owner}/{repo}/issues",
                json={"title": title, "body": body, "labels": labels or []},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
    except httpx.HTTPError as error:
        return {"error": f"could not reach GitHub: {type(error).__name__}"}

    if response.status_code not in (200, 201):
        return {
            "error": f"GitHub API error {response.status_code}",
            "status_code": response.status_code,
            "detail": response.text[:500],
        }
    data = response.json()
    return {
        "url": data["html_url"],
        "number": data["number"],
        "repo": f"{owner}/{repo}",
    }


@mcp.custom_route("/health", methods=["GET"])
async def health(request: Any) -> Any:
    """Liveness plus the capability flags the UI needs to render honest state."""
    from starlette.responses import JSONResponse

    return JSONResponse(
        {
            "status": "ok",
            "docker_available": await _docker_available(),
            "dev_fixtures": dev_fixtures_enabled(),
            "github_configured": bool(os.environ.get("GITHUB_TOKEN")),
        }
    )


def main() -> None:
    mcp.run(transport="streamable-http")


# ASGI app entry point for uvicorn (serves the MCP streamable-HTTP transport at /mcp).
mcp_app = mcp.streamable_http_app()

# The console is a static SPA on a different origin, so the browser needs CORS.
# NOTE: origins come from an env var with dev defaults - lock it down with
# VETTING_ALLOWED_ORIGINS if this is ever served anywhere but a workstation.
_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "VETTING_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
    ).split(",")
    if origin.strip()
]
mcp_app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    # the MCP client reads the session id off the response to resume a session
    expose_headers=["mcp-session-id"],
)

if __name__ == "__main__":
    main()
