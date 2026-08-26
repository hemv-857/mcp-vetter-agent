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


def test_clone_target_rejects_bad_urls():
    for bad in (
        "http://github.com/a/b",
        "git@github.com:a/b.git",
        "file:///etc/passwd",
        "nonsense",
        "https://github.com/only-owner",
        "https://[::1/x/y",  # malformed - must return error dict, not raise
    ):
        result = asyncio.run(srv.clone_target(bad))
        assert "error" in result


def test_clone_target_blocks_private_networks():
    for ssrf in (
        "https://127.0.0.1/x/y",
        "https://localhost/x/y",
        "https://10.1.2.3/x/y",
        "https://192.168.1.5/x/y",
        "https://172.16.0.9/x/y",
        "https://169.254.169.254/latest/meta-data",
        "https://myhost.internal/x/y",
        "https://nas.local/x/y",
    ):
        result = asyncio.run(srv.clone_target(ssrf))
        assert "error" in result
        assert "private" in result["error"] or "https" in result["error"]


def test_clone_target_accepts_standard_github_urls(monkeypatch):
    calls = []

    class OkProc:
        pid = 1
        returncode = 0

        async def communicate(self):
            return b"", b""

        async def wait(self):
            return 0

    async def fake_exec(*args, **kwargs):
        calls.append(args)
        return OkProc()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_exec)
    # with and without .git suffix - both are standard
    for url in (
        "https://github.com/owner/repo.git",
        "https://github.com/owner/repo",
        "https://gitlab.com/group/sub/repo/",
    ):
        result = asyncio.run(srv.clone_target(url))
        assert "error" not in result, (url, result)
        assert result["target"].endswith("/repo")
    assert len(calls) == 3
    assert "--depth" in calls[0]


def test_clone_timeout_kills_process_group(monkeypatch):
    killed = []
    monkeypatch.setattr(srv.os, "killpg", lambda pgid, sig: killed.append((pgid, sig)))
    monkeypatch.setattr(srv, "CLONE_TIMEOUT_SECONDS", 0)

    class SlowProc:
        pid = 424242

        def __init__(self):
            self.event = asyncio.Event()

        async def communicate(self):
            await asyncio.sleep(30)
            return b"", b""

        async def wait(self):
            return 0

    proc = SlowProc()

    async def fake_exec(*args, **kwargs):
        return proc

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_exec)
    result = asyncio.run(srv.clone_target("https://github.com/owner/repo"))
    assert result.get("timeout") is True
    assert killed == [(proc.pid, signal.SIGKILL)]


def test_clone_sweeps_stale_temp_dirs(monkeypatch, tmp_path):
    stale = tmp_path / "vetted-old"
    fresh = tmp_path / "vetted-new"
    stale.mkdir()
    fresh.mkdir()
    old = __import__("time").time() - 172800  # two days ago
    import os as os_mod

    os_mod.utime(stale, (old, old))

    class OkProc:
        pid = 1
        returncode = 0

        async def communicate(self):
            return b"", b""

        async def wait(self):
            return 0

    async def fake_exec(*args, **kwargs):
        return OkProc()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_exec)
    monkeypatch.setattr(srv.tempfile, "tempdir", str(tmp_path))
    asyncio.run(srv.clone_target("https://github.com/owner/repo"))
    assert not stale.exists()  # swept
    assert fresh.exists()  # recent clones survive


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
