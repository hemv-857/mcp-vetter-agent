"""Tests for the probe server. Plain pytest; async tools are wrapped with asyncio.run."""

import asyncio
from pathlib import Path

from probe_server.server import _run_scan, read_target_manifest, static_audit

ROOT = Path(__file__).resolve().parent.parent
VULNERABLE = str(ROOT / "fixtures" / "vulnerable_server")
CLEAN = str(ROOT / "fixtures" / "clean_server")


def test_static_audit_flags_vulnerable_fixture():
    report = asyncio.run(static_audit(VULNERABLE))
    assert report["analysisComplete"] is True
    rule_ids = {f["rule_id"] for f in report["findings"]}
    assert {"VULN-001", "VULN-002", "VULN-003", "VULN-004", "VULN-005"} <= rule_ids


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
