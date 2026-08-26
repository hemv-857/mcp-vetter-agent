"""Error-handling tests: timeouts, Docker preflight, bad output, health endpoint.

Subprocess interactions are faked so these run fast and deterministically.
"""

import asyncio
import json
import signal
from unittest.mock import patch

import httpx
import pytest

from probe_server import server as srv


class FakeProc:
    pid = 999_999_999  # killpg target; ProcessLookupError is suppressed in server

    def __init__(self, *, stdout=b"", stderr=b"", returncode=0, delay=0.0):
        self._stdout, self._stderr = stdout, stderr
        self._returncode, self._delay = returncode, delay
        self.killed = False

    async def communicate(self):
        await asyncio.sleep(self._delay)
        return self._stdout, self._stderr

    async def wait(self):
        return 0

    def kill(self):
        self.killed = True

    @property
    def returncode(self):
        return self._returncode


def test_full_audit_reports_missing_docker_without_spawning(monkeypatch):
    async def no_docker():
        return False

    monkeypatch.setattr(srv, "_docker_available", no_docker)
    spawned = []

    async def fail(*args, **kwargs):
        spawned.append(1)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fail)
    result = asyncio.run(srv.full_audit("fixtures/vulnerable_server"))
    assert result["docker_available"] is False
    assert "Docker" in result["error"]
    assert not spawned


def test_scan_timeout_kills_process_group_and_reaps(monkeypatch):
    killed_pgids = []
    monkeypatch.setattr(
        srv.os, "killpg", lambda pgid, sig: killed_pgids.append((pgid, sig))
    )
    proc = FakeProc(delay=5)

    async def fake_exec(*args, **kwargs):
        return proc

    with patch.object(asyncio, "create_subprocess_exec", fake_exec):
        result = asyncio.run(
            srv._run_scan("fixtures/clean_server", "--static-only", timeout=0.05)
        )
    assert result.get("timeout") is True
    assert killed_pgids == [(proc.pid, signal.SIGKILL)]  # group kill, then reaped


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


def test_clone_target_rejects_non_https_urls():
    for bad in ("http://github.com/a/b", "git@github.com:a/b.git", "file:///etc/passwd", "nonsense"):
        result = asyncio.run(srv.clone_target(bad))
        assert "error" in result
        assert "https" in result["error"]


def test_clone_target_accepts_valid_url_shape(monkeypatch):
    calls = []

    class OkProc:
        pid = 1
        returncode = 0

        async def communicate(self):
            return b"", b""

    async def fake_exec(*args, **kwargs):
        calls.append(args)
        return OkProc()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_exec)
    result = asyncio.run(srv.clone_target("https://github.com/owner/some-repo.git"))
    assert "error" not in result
    assert result["target"].endswith("/repo")
    assert "--depth" in calls[0]


def test_read_target_manifest_ignores_symlink_escapes(tmp_path):
    outside = tmp_path / "outside.yaml"
    outside.write_text("secret: value", encoding="utf-8")
    target = tmp_path / "target"
    target.mkdir()
    (target / "tools.yaml").write_text("tools: []", encoding="utf-8")
    (target / "evil.yaml").symlink_to(outside)

    result = asyncio.run(srv.read_target_manifest(str(target)))
    assert "tools.yaml" in result["manifests"]
    assert "evil.yaml" not in result["manifests"]
    assert "secret" not in json.dumps(result)


def test_read_target_manifest_survives_unreadable_files(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    (target / "bad.yaml").write_bytes(b"\xff\xfe\x00binary")

    result = asyncio.run(srv.read_target_manifest(str(target)))
    assert "error" not in result  # never raises - skips and reports instead
