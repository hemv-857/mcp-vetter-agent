import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


import os

import pytest


@pytest.fixture(autouse=True)
def _production_scan_path(monkeypatch):
    """The suite asserts the real scanner path; dev replay must never leak in."""
    monkeypatch.delenv("VETTING_DEV_FIXTURES", raising=False)


def scanner_installed() -> bool:
    import importlib.util

    return importlib.util.find_spec("security_scanner") is not None


requires_scanner = pytest.mark.skipif(
    not scanner_installed(),
    reason="security_scanner engine is not installed on this host",
)
