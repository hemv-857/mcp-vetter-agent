# API Reference — MCP Vetting Probe Server

The probe server is an MCP (Model Context Protocol) server running on
`http://127.0.0.1:8000`. It exposes tools via the streamable-HTTP transport
at the `/mcp` path. There is also a REST health endpoint at `/health`.

---

## Transport

MCP over streamable HTTP. The UI connects using the official MCP TypeScript
client:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("http://127.0.0.1:8000/mcp")
);
const client = new Client({ name: "mcp-vetting-ui", version: "1.0.0" });
await client.connect(transport);
```

After connecting, call tools via `client.callTool({ name, arguments })`.

---

## REST Endpoint

### GET /health

Returns server status and Docker availability.

**Response** (`application/json`):
```json
{
  "status": "ok",
  "docker_available": true
}
```

---

## MCP Tools

All tools return a JSON object. Errors are structured values inside the object,
never exceptions. Every tool has an `error` key on failure.

---

### clone_target

Clones a public GitHub repository onto the probe host for scanning.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `repo_url` | string | yes | HTTPS GitHub URL (e.g., `https://github.com/owner/repo`) |

**Success response:**
```json
{
  "target": "/tmp/vetted-abc123/repo"
}
```

The `target` path is passed to all subsequent tools.

**Error responses:**
```json
{ "error": "only https git repository URLs are accepted", "url": "http://..." }
{ "error": "refusing to clone from a private or local network address", "url": "..." }
{ "error": "URL must point at a repository (owner/repo)", "url": "..." }
{ "error": "malformed URL", "url": "..." }
{ "error": "git clone failed", "git_stderr_tail": "..." }
{ "error": "clone timed out after 120s", "timeout": true }
{ "error": "failed to launch git: ..." }
```

**Notes:**
- Shallow clone (`--depth 1`)
- 120-second timeout
- Fresh temp directory per call (prefix `vetted-`)
- Private/local network addresses refused (SSRF protection)
- Stale clones older than 24h are swept before cloning

---

### static_audit

Runs fast static security analysis (AST rules + pattern matching). No Docker,
no model calls. Budget: 30 seconds.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `target_dir` | string | yes | Path returned by `clone_target` |

**Response:** A JSON report. Shape (simplified):
```json
{
  "scan_type": "static",
  "target": "/tmp/vetted-abc123/repo",
  "findings": [
    {
      "id": "VULN-001",
      "title": "Unsafe execution in tool handler",
      "severity": "HIGH",
      "owasp_category": "A3: Injection",
      "file": "server.py",
      "line": 42,
      "evidence": "eval(user_input)",
      "remediation": "Use ast.literal_eval() or a safelist"
    },
    {
      "id": "VULN-004",
      "title": "Unrestricted file access",
      "severity": "HIGH",
      "owasp_category": "A1: Broken Access Control",
      "file": "tools.py",
      "line": 15,
      "evidence": "open(path)",
      "remediation": "Validate path against an allowlist"
    }
  ],
  "summary": {
    "total": 7,
    "high": 3,
    "medium": 2,
    "low": 2
  }
}
```

**Error responses:**
```json
{ "error": "target directory does not exist: /tmp/..." }
{ "error": "scanner exited with code 2", "exit_code": 2, "stderr_tail": "..." }
{ "error": "invalid scanner output", "parse_failed": true }
{ "error": "scan timed out after 30s", "timeout": true, "timed_out_after_seconds": 30 }
```

**Notes:**
- When `allow_degraded` is implicitly true (default for static), unreviewed
  candidates are parked as `needs_review` instead of failing.
- Rule IDs: VULN-001 through VULN-007 (static rules)

---

### full_audit

Full security audit: static rules + AI semantic review + Docker-sandboxed
dynamic probes. Budget: 5 minutes.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `target_dir` | string | yes | Path returned by `clone_target` |
| `allow_degraded` | boolean | no | If true, runs without OPENAI_API_KEY (findings become `needs_review`) |

**Response:** Same shape as `static_audit`, plus dynamic findings:
```json
{
  "scan_type": "full",
  "target": "/tmp/vetted-abc123/repo",
  "findings": [
    {
      "id": "VULN-008",
      "title": "Out-of-scope tool execution",
      "severity": "CRITICAL",
      "owasp_category": "A7: Breakout",
      "status": "confirmed",
      "probe": "docker_sandbox",
      "evidence": "Process spawned outside sandbox boundary",
      "remediation": "Restrict subprocess calls to sandboxed paths"
    }
  ],
  "summary": {
    "total": 8,
    "critical": 1,
    "high": 3,
    "medium": 2,
    "low": 2
  }
}
```

**Error responses:**
```json
{ "error": "Docker required for dynamic probes", "docker_available": false }
{ "error": "target directory does not exist: /tmp/..." }
{ "error": "scanner exited with code 2", "exit_code": 2, "stderr_tail": "..." }
{ "error": "scan timed out after 300s", "timeout": true, "timed_out_after_seconds": 300 }
```

**Notes:**
- Dynamic probes (VULN-008 through VULN-011) run inside throwaway Docker
  containers. They are the only findings marked `status: "confirmed"`.
- Without `OPENAI_API_KEY` and with `allow_degraded=true`, dynamic findings
  are parked as `needs_review` instead of confirmed.

---

### read_target_manifest

Reads an MCP server's declared YAML manifests without running anything.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `target_dir` | string | yes | Path returned by `clone_target` |

**Response:**
```json
{
  "target": "/tmp/vetted-abc123/repo",
  "manifests": {
    "target.yaml": "name: my-server\ntools:\n  - name: read_file\n    permissions:\n      filesystem: read",
    "tools.yaml": "tools:\n  - name: execute\n    description: Run a command"
  },
  "skipped": []
}
```

**Error responses:**
```json
{ "error": "target directory does not exist: /tmp/..." }
```

**Notes:**
- Only reads `*.yaml` and `*.yml` files in the target root
- Symlinks are ignored
- Files resolving outside the target directory are skipped (containment)
- Each file truncated to 20,000 bytes

---

## Typical Call Sequence

```
1. clone_target(repo_url="https://github.com/hemv-857/mcp-vulnerable-fixture")
   → { "target": "/tmp/vetted-abc123/repo" }

2. read_target_manifest(target_dir="/tmp/vetted-abc123/repo")
   → { "manifests": { ... } }

3. static_audit(target_dir="/tmp/vetted-abc123/repo")
   → { "findings": [ ... ], "summary": { ... } }

4. full_audit(target_dir="/tmp/vetted-abc123/repo", allow_degraded=true)
   → { "findings": [ ... ], "summary": { ... } }
```

Steps 3 and 4 can run in parallel (they are independent reads of the same
target directory).

---

## Rule IDs

| ID | Title | Severity | OWASP Category |
|----|-------|----------|----------------|
| VULN-001 | Unsafe execution in tool handler | HIGH | A3: Injection |
| VULN-002 | Hardcoded credentials | HIGH | A2: Cryptographic Failures |
| VULN-003 | Missing input validation | MEDIUM | A6: Vulnerable Components |
| VULN-004 | Unrestricted file access | HIGH | A1: Broken Access Control |
| VULN-005 | Excessive permissions | MEDIUM | A5: Security Misconfiguration |
| VULN-006 | Insecure prompt construction | MEDIUM | A3: Injection |
| VULN-007 | Missing authentication | HIGH | A7: Auth Failures |
| VULN-008 | Out-of-scope execution | CRITICAL | A7: Breakout |
| VULN-009 | Oversized arguments | MEDIUM | A4: Insecure Design |
| VULN-010 | Injection payloads | HIGH | A3: Injection |
| VULN-011 | Malformed schema input | MEDIUM | A4: Insecure Design |
