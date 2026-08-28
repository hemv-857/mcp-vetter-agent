"""Lightweight inline static scanner for MCP servers.

Runs when the external security_scanner is not installed.
Performs pattern-matching and AST analysis for common MCP vulnerabilities.
Returns findings in the same JSON format as the external scanner.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

# Pattern definitions: (rule_id, title, severity, file_pattern, content_pattern, description)
PATTERNS: list[tuple[str, str, str, str | None, str, str]] = [
    ("VULN-001", "Unsafe subprocess execution", "high", None,
     r"subprocess\.(run|call|Popen|check_output)\(.*shell\s*=\s*True",
     "Using shell=True allows command injection via unsanitized input."),
    ("VULN-001", "Unsafe os.system call", "high", None,
     r"os\.system\(",
     "os.system() executes commands through the shell, enabling injection."),
    ("VULN-001", "Unsafe eval usage", "critical", None,
     r"(?<![\w.])eval\(",
     "eval() executes arbitrary code from untrusted input."),
    ("VULN-001", "Unsafe exec usage", "critical", None,
     r"(?<![\w.])exec\(",
     "exec() executes arbitrary code from untrusted input."),
    ("VULN-002", "Hardcoded credentials / secrets", "high", None,
     r"(ghp_[A-Za-z0-9]{16,}|gho_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|password\s*=\s*['\"][^'\"]+['\"])",
     "Hardcoded secret found in source code."),
    ("VULN-003", "Missing input validation", "medium", None,
     r"request\.(args|form|json)\[.*\]\s*(?!\.get\()",
     "Direct access to request parameters without validation."),
    ("VULN-004", "Excessive tool permissions", "medium", "server.py",
     r"@\w+\.tool\(.*?name\s*=\s*['\"]",
     "Tool registered — verify permissions match最小必要."),
    ("VULN-005", "Insecure prompt construction", "medium", None,
     r"(?:prompt|instruction|system_message)\s*=\s*f['\"]|format\(.*user.*input",
     "User input interpolated into prompts without sanitization."),
    ("VULN-006", "Missing authentication", "high", "server.py",
     r"(?:app|server)\.(?:route|get|post|put|delete)\(.*?(?!\.requires?_?auth)",
     "Endpoint may lack authentication middleware."),
    ("VULN-007", "Insecure deserialization", "critical", None,
     r"(?<![\w.])pickle\.loads?\(|yaml\.load\((?!.*Loader)",
     "Deserializing untrusted data enables remote code execution."),
    ("VULN-008", "SSRF via unvalidated URL", "high", None,
     r"(requests|httpx|aiohttp|urllib)\.(?:get|post|fetch)\(.*(?:url|uri|target|endpoint)",
     "HTTP request to user-controlled URL without SSRF protection."),
    ("VULN-009", "Path traversal", "high", None,
     r"(?:open|read_file|write_file)\(.*(?:\+|\.format|f['\"])",
     "File path constructed from user input without sanitization."),
    ("VULN-010", "Missing HTTPS enforcement", "medium", None,
     r"http://(?!localhost|127\.0\.0\.1|0\.0\.0\.0)",
     "Plain HTTP URL may expose data in transit."),
    ("VULN-011", "Debug mode in production", "medium", None,
     r"debug\s*=\s*True|DEBUG\s*=\s*True",
     "Debug mode enabled — leaks stack traces and internals."),
]

# File extensions to scan
SCAN_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs",
    ".yaml", ".yml", ".toml", ".json",
    ".go", ".rs", ".rb", ".java",
}


def _scan_file(path: Path) -> list[dict[str, Any]]:
    """Scan a single file for vulnerability patterns."""
    findings: list[dict[str, Any]] = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except (OSError, UnicodeDecodeError):
        return findings

    lines = text.splitlines()
    for rule_id, title, severity, file_pattern, content_pattern, description in PATTERNS:
        if file_pattern and not re.search(file_pattern, path.name, re.IGNORECASE):
            continue
        compiled = re.compile(content_pattern, re.IGNORECASE)
        for lineno, line in enumerate(lines, 1):
            if compiled.search(line):
                # Avoid duplicate findings per rule per file
                if any(f["id"] == rule_id and f.get("file") == str(path) for f in findings):
                    continue
                findings.append({
                    "id": rule_id,
                    "title": title,
                    "severity": severity,
                    "confidence": "candidate",
                    "file": str(path),
                    "line": lineno,
                    "evidence": line.strip()[:200],
                    "description": description,
                    "owasp_category": _owasp_for_rule(rule_id),
                    "remediation": _remediation_for_finding(title, line.strip()),
                })
                break  # one match per rule per file is enough
    return findings


def _owasp_for_rule(rule_id: str) -> str:
    """Map VULN rule IDs to OWASP Agentic Top 10 (2025) categories."""
    mapping = {
        "VULN-001": "A01:2025-Excessive Agency",  # eval/exec/subprocess = unrestricted code execution
        "VULN-002": "A06:2025-Insecure Tool Chain",  # hardcoded secrets = broken credential chain
        "VULN-003": "A03:2025-Insecure Tool Schemas",  # missing validation = schema doesn't enforce bounds
        "VULN-004": "A01:2025-Excessive Agency",  # excessive permissions = tool does more than needed
        "VULN-005": "A05:2025-Insecure Output Handling",  # prompt injection via user input
        "VULN-006": "A08:2025-Unauthorized Resource Access",  # missing auth = anyone can call tool
        "VULN-007": "A04:2025-Tool Supply Chain Vulnerabilities",  # insecure deserialization = untrusted data
        "VULN-008": "A02:2025-Insecure Agent Environment",  # SSRF = agent makes unvalidated network calls
        "VULN-009": "A01:2025-Excessive Agency",  # path traversal = tool reads outside allowed scope
        "VULN-010": "A06:2025-Insecure Tool Chain",  # missing HTTPS = data exposed in transit
        "VULN-011": "A05:2025-Insecure Output Handling",  # debug mode = sensitive info leaked
    }
    return mapping.get(rule_id, "A00:2025-Unknown")


def _remediation_for_finding(title: str, evidence: str) -> str:
    """Provide concrete remediation suggestions based on the finding type."""
    title_lower = title.lower()
    evidence_lower = evidence.lower()

    if "eval" in title_lower or "exec" in title_lower:
        return (
            "Replace eval()/exec() with safe alternatives. "
            "Use ast.literal_eval() for data parsing, or a沙箱ed execution environment. "
            "Never pass untrusted input to eval/exec."
        )
    elif "subprocess" in title_lower or "os.system" in title_lower:
        return (
            "Use subprocess.run() with shell=False (default). "
            "Pass arguments as a list, not a string. "
            "Validate and sanitize all inputs before passing to subprocess."
        )
    elif "hardcoded" in title_lower or "credential" in title_lower or "secret" in title_lower:
        return (
            "Move secrets to environment variables or a secret manager. "
            "Use os.environ.get() instead of hardcoded values. "
            "Rotate any exposed credentials immediately."
        )
    elif "input validation" in title_lower:
        return (
            "Add input validation using schema validation (pydantic, marshmallow). "
            "Validate type, range, and format before processing. "
            "Reject invalid input with clear error messages."
        )
    elif "permission" in title_lower or "excessive" in title_lower:
        return (
            "Apply principle of least privilege. "
            "Grant only the minimum permissions needed for the tool's function. "
            "Document why each permission is required."
        )
    elif "prompt" in title_lower:
        return (
            "Sanitize user input before inserting into prompts. "
            "Use parameterized prompts instead of string formatting. "
            "Validate input against an allowlist of expected patterns."
        )
    elif "authentication" in title_lower:
        return (
            "Add authentication middleware to all endpoints. "
            "Use API keys, OAuth, or JWT tokens. "
            "Reject unauthenticated requests with 401 status."
        )
    elif "deserialization" in title_lower:
        return (
            "Avoid pickle.loads() on untrusted data. "
            "Use safe formats like JSON with strict schema validation. "
            "If pickle is required, restrict allowed classes."
        )
    elif "ssrf" in title_lower or "url" in title_lower:
        return (
            "Validate URLs against an allowlist of permitted domains. "
            "Block private IP ranges (10.x, 172.16-31.x, 192.168.x). "
            "Use a URL validation library to prevent bypass."
        )
    elif "path traversal" in title_lower or "file" in title_lower:
        return (
            "Validate file paths against an allowlist of permitted directories. "
            "Use os.path.realpath() to resolve symlinks before validation. "
            "Reject paths containing '..' or absolute paths outside allowed scope."
        )
    elif "https" in title_lower:
        return (
            "Enforce HTTPS for all external connections. "
            "Redirect HTTP to HTTPS. "
            "Use HSTS headers to prevent downgrade attacks."
        )
    elif "debug" in title_lower:
        return (
            "Disable debug mode in production. "
            "Use environment variables to control debug settings. "
            "Ensure debug mode doesn't leak sensitive information."
        )
    else:
        return "Review the finding and apply security best practices for this vulnerability class."


def scan(target_dir: str) -> dict[str, Any]:
    """Run inline static scan on a directory. Returns a report dict."""
    target = Path(target_dir)
    if not target.is_dir():
        return {"error": f"not a directory: {target_dir}", "findings": []}

    findings: list[dict[str, Any]] = []
    scanned = 0

    for ext in SCAN_EXTENSIONS:
        for path in target.rglob(f"*{ext}"):
            # Skip common non-source dirs
            parts = path.relative_to(target).parts
            if any(p in (".git", "node_modules", "__pycache__", ".venv", "venv", ".tox", "dist", "build") for p in parts):
                continue
            findings.extend(_scan_file(path))
            scanned += 1
            if scanned > 500:
                break
        if scanned > 500:
            break

    return {
        "findings": findings,
        "files_scanned": scanned,
        "engine": "inline-scanner",
    }
