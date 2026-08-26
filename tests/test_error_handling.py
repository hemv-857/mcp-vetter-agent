"""Error-handling tests: timeouts, Docker preflight, bad output, health endpoint.

Subprocess interactions are faked so these run fast and deterministically.
"""

import asyncio
import json
from unittest.mock import patch

import httpx
import pytest

from probe_server import server as srv


class FakeProc:
    def __init__(self, *, stdout=b"", stderr=b"", returncode=0, delay=0.0):
        self._stdout, self._stderr = stdout, stderr
        self._returncode, self._delay = returncode, delay
        self.killed = False

    async def communicate(self):
        await asyncio.sleep(self._delay)
        return self._stdout, self._stderr

    def kill(self):
        self.killed = True

    @property
    def returncode(self):
        return self._returncode


def test_full_audit_reports_missing_docker_without_spawning(monkeypatch):
    monkeypatch.setattr(srv, "_docker_available", lambda: False)
    spawned = []

    async def fail(*args, **kwargs):
        spawned.append(1)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fail)
    result = asyncio.run(srv.full_audit("fixtures/vulnerable_server"))
    assert result["docker_available"] is False
    assert "Docker" in result["error"]
    assert not spawned


def test_scan_timeout_kills_process_and_returns_flag():
    proc = FakeProc(delay=5)

    async def fake_exec(*args, **kwargs):
        return proc

    with patch.object(asyncio, "create_subprocess_exec", fake_exec):
        result = asyncio.run(
            srv._run_scan("fixtures/clean_server", "--static-only", timeout=0.05)
        )
    assert result.get("timeout") is True
    assert proc.killed


def test_invalid_scanner_output_is_reported_not_raised():
    proc = FakeProc(stdout=b"not json at all", returncode=0)

    async def fake_exec(*args, **kwargs):
        return proc

    with patch.object(asyncio, "create_subprocess_exec", fake_exec):
        result = asyncio.run(srv._run_scan("fixtures/clean_server"))
    assert result.get("parse_failed") is True


def test_bad_exit_code_includes_stderr_tail():
    proc = FakeProc(stdout=b"", stderr=b"boom", returncode=3)

    async def fake_exec(*args, **kwargs):
        return proc

    with patch.object(asyncio, "create_subprocess_exec", fake_exec):
        result = asyncio.run(srv._run_scan("fixtures/clean_server"))
    assert result["exit_code"] == 3
    assert "boom" in result["stderr_tail"]


@pytest.mark.parametrize("bad_path", ["/nonexistent/xyz", "/nonexistent/deeply/nested"])
def test_all_tools_reject_missing_directory(bad_path):
    for tool in (srv.static_audit, srv.full_audit, srv.read_target_manifest):
        result = asyncio.run(tool(bad_path))
        assert "error" in result


def test_health_endpoint_reports_docker_status():
    app = srv.mcp_app
    transport = httpx.ASGITransport(app=app)
    response = asyncio.run(httpx.AsyncClient(transport=transport, base_url="http://t").get("/health"))
    body = json.loads(response.content)
    assert response.status_code == 200
    assert body["status"] == "ok"
    assert isinstance(body["docker_available"], bool)
