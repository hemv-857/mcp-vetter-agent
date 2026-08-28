"""Tests for the probe server. Plain pytest; async tools are wrapped with asyncio.run."""

import asyncio
from pathlib import Path

from conftest import requires_scanner

from probe_server.server import (
    _looks_like_the_vulnerable_fixture,
    _run_scan,
    read_target_manifest,
    static_audit,
)

ROOT = Path(__file__).resolve().parent.parent
VULNERABLE = str(ROOT / "fixtures" / "vulnerable_server")
CLEAN = str(ROOT / "fixtures" / "clean_server")


@requires_scanner
def test_static_audit_flags_vulnerable_fixture():
    report = asyncio.run(static_audit(VULNERABLE))
    assert report["analysisComplete"] is True
    rule_ids = {f["rule_id"] for f in report["findings"]}
    assert {"VULN-001", "VULN-002", "VULN-003", "VULN-004", "VULN-005"} <= rule_ids


@requires_scanner
def test_static_audit_passes_clean_fixture():
    report = asyncio.run(static_audit(CLEAN))
    assert report["analysisComplete"] is True
    assert len(report["findings"]) == 0


def test_scan_rejects_missing_directory():
    result = asyncio.run(_run_scan("/nonexistent/path/xyz"))
    assert "error" in result


def test_read_target_manifest_returns_yaml_files():
    result = asyncio.run(read_target_manifest(VULNERABLE))
    assert result["target"] == str(Path(VULNERABLE).resolve())
    assert "tools.yaml" in result["manifests"]
    assert any("target" in name or "tools" in name or "permissions" in name for name in result["manifests"])
    assert all(len(body) <= 20000 for body in result["manifests"].values())


def test_read_target_manifest_rejects_missing_directory():
    result = asyncio.run(read_target_manifest("/nonexistent/path/xyz"))
    assert "error" in result


def test_dev_fixture_replay_is_labelled_as_sample_data(monkeypatch):
    """Replayed reports must be impossible to mistake for a live scan."""
    monkeypatch.setenv("VETTING_DEV_FIXTURES", "1")
    report = asyncio.run(static_audit(VULNERABLE))
    assert report["sample_data"] is True
    assert report["scan_type"] == "static"
    assert all(f["source"] == "static" for f in report["findings"])


def test_dev_replay_tells_the_fixtures_apart(monkeypatch):
    """ast.literal_eval() in the hardened fixture must not read as eval()."""
    assert _looks_like_the_vulnerable_fixture(VULNERABLE) is True
    assert _looks_like_the_vulnerable_fixture(CLEAN) is False

    monkeypatch.setenv("VETTING_DEV_FIXTURES", "1")
    assert asyncio.run(static_audit(CLEAN))["findings"] == []
    assert len(asyncio.run(static_audit(VULNERABLE))["findings"]) == 7
