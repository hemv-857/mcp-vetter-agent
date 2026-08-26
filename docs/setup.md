# Setup & Development Guide — MCP Vetter Agent

## Prerequisites
- Node.js 22.14+ (for TrueForge)
- Python 3.10+ (for agent & probe tools)
- Docker (for sandboxing probes during dev)
- Git (for cloning repos)
- GitHub account (for repo + API access)

---

## Day 1: Initial Setup

### Step 1: Clone & initialize repo
```bash
git clone https://github.com/<YOUR_HANDLE>/mcp-vetter-agent.git
cd mcp-vetter-agent

# Create folder structure
mkdir -p agent probes test-fixtures trueforge-project docs

# Create Python virtual env
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

pip install -r requirements.txt
```

### Step 2: Set up Qodo
No config file exists or is needed — Qodo is a GitHub App installation.
1. One teammate with repo admin signs in at https://app.qodo.ai/signin
2. Integrations > SaaS > GitHub > Add installation — authorize Qodo for the hackathon repo
3. Open any PR; Qodo reviews automatically. If it does not, comment `/agentic_review` on the PR
4. One installation covers the whole team; teammates do not need accounts (14-day trial, no card)
5. Fix every valid High-severity finding; dismiss wrong ones in the Qodo thread with the reason, push, and let the follow-up review record it

### Step 3: Local TrueForge
There is no `init` or `dev` subcommand and nothing to scaffold — TrueForge is one process:
```bash
npx @truefoundry/trueforge@latest
# UI at http://localhost:8790 (Node 22.14+)
```
Agents are saved specs (model + instructions + connectors + capabilities), composed in the
UI or created via the HTTP API from `deploy/agent-manifest.json`. Configure once:
- Settings → Models: paste your provider API key
- Settings → Connectors: Add MCP Server → `http://127.0.0.1:8000/mcp` (our probe server),
  plus the GitHub connector from the catalog (OAuth, no token management)
- Settings → Sandbox providers: optional (Daytona, for skills/code mode). Target cloning
  happens on the probe host via the clone_target tool - no sandbox needed for audits.

### Step 4: Environment variables
Model API keys are entered in the TrueForge UI (Settings → Models), not in files.
`.env` only carries what the probe server itself needs:
```bash
# Optional: live GPT semantic review inside full_audit
# (omit it and pass allow_degraded=true instead)
OPENAI_API_KEY=sk-...
```
GitHub access uses the catalog connector's OAuth flow — no personal token required.
There is no `TRUEFORGE_API_KEY`; local mode has no auth by default.

### Step 5: Understand the scanning engine
The engine is the published `mcp-security-scanner` package (already in requirements.txt):
```bash
mcp-security-scanner scan fixtures/vulnerable_server --static-only --format json   # fast static pass
mcp-security-scanner scan fixtures/vulnerable_server --format json                 # full: GPT review + Docker probes
```

Key paths:
- `src/security_scanner/static/rules/vuln001..007.py` — static AST rules
- `src/security_scanner/dynamic/` — Docker-sandboxed probes VULN-008..011
- `tests/fixtures/{vulnerable,clean}_server` — copied into our `fixtures/`

### Step 6: First commit
```bash
git add -A
git commit -m "scaffold: project structure, Qodo setup, credit security scanner"
git push origin main

# Open PR; Qodo should review automatically
# Address any findings; merge once approved
```

**Checkpoint:** ✅ Repo set up, Qodo wired, first PR merged, scanning engine understood

---

## Day 2: MCP Tools & Probes Setup

### Step 1: GitHub MCP tool

Create `probes/github_mcp.py`:
```python
import httpx
from typing import Dict, List, Optional

class GitHubMCP:
    """Wrapper around GitHub API for repo analysis."""
    
    def __init__(self, token: str):
        self.token = token
        self.client = httpx.AsyncClient(
            headers={"Authorization": f"token {token}"}
        )
    
    async def clone_repo(self, url: str) -> str:
        # Extract owner/repo from URL
        # Clone to temp directory
        # Return path
        pass
    
    async def read_file(self, owner: str, repo: str, path: str) -> str:
        # GET /repos/{owner}/{repo}/contents/{path}
        # Return file content
        pass
    
    async def read_all_schemas(self, owner: str, repo: str) -> Dict[str, dict]:
        # Find all tool schema files (package.json, pyproject.toml, etc.)
        # Parse and return structured schemas
        pass
    
    async def create_issue(
        self, 
        owner: str, 
        repo: str, 
        title: str, 
        body: str, 
        labels: List[str]
    ) -> str:
        # POST /repos/{owner}/{repo}/issues
        # Return issue URL
        pass
```

### Step 2: Probe tool wrappers

Create `probes/static_probe.py`:
```python
# Wrapper around the internal static analyzer
from pathlib import Path
import sys

sys.path.insert(0, "../security-scanner-reference")
from security_scanner.rules import RulesEngine

class StaticProbeTool:
    """Runs static analysis rules on target MCP."""
    
    async def audit_static(self, repo_path: str) -> List[dict]:
        # Read schemas from repo
        # Apply scanning engine rules
        # Return findings: {"rule": "...", "severity": "HIGH", "file": "..."}
        pass
```

Create `probes/injection_probe.py`:
```python
# Wrapper around the internal injection probe
from security_scanner.probes import InjectionProbe

class InjectionProbeTool:
    """Tests target MCP for injection vulnerabilities."""
    
    async def test_injection(self, repo_path: str) -> List[dict]:
        # Start target MCP in sandbox
        # Send injection payloads
        # Return vulnerable payloads: {"payload": "...", "vulnerable": True}
        pass
```

Create `probes/scope_escape_probe.py`:
```python
# Wrapper around the internal scope escape probe
from security_scanner.probes import ScopeEscapeProbe

class ScopeEscapeProbeTool:
    """Tests if target MCP can escape sandbox."""
    
    async def test_scope_escape(self, repo_path: str) -> List[dict]:
        # Start target MCP in sandbox
        # Attempt breakout techniques
        # Return successes: {"technique": "env_read", "succeeded": True}
        pass
```

### Step 3: Fixture vulnerable MCP servers

Copy from the security scanner (or create minimal fixtures):
```bash
mkdir -p test-fixtures/{hardened,vulnerable}

# Vulnerable fixture: tool that accepts any path
# test-fixtures/vulnerable/overexposed_files.py

# Hardened fixture: tool with path validation
# test-fixtures/hardened/validated_files.py
```

### Step 4: Test probes locally

```bash
# Test static probe
python -m pytest tests/test_static_probe.py

# Test injection probe (sandboxed)
python -m pytest tests/test_injection_probe.py

# Test scope escape probe (sandboxed)
python -m pytest tests/test_scope_escape_probe.py
```

**Checkpoint:** ✅ Probes working locally against fixtures

---

## Day 3+: Agent Development

### Folder structure
```
mcp-vetter-agent/
├── probe_server/
│   ├── __init__.py
│   └── server.py               # HTTP MCP server: static_audit / full_audit / read_target_manifest
├── fixtures/
│   ├── vulnerable_server/      # deliberately unsafe reference MCP server
│   ├── clean_server/           # hardened reference MCP server
│   └── LICENSE                 # license notice for bundled reference code
├── deploy/
│   └── agent-manifest.json     # agent spec -> POST /api/v1/agents
├── docs/
├── tests/
├── .env                        # Secrets (not in repo)
├── .gitignore
├── requirements.txt
└── README.md
```

### Running locally

**Terminal 1: TrueForge agent**
```bash
cd trueforge-project
npx @truefoundry/trueforge dev
```

**Terminal 2: Test audit against fixture**
```bash
source venv/bin/activate
python -c "
import asyncio
from agent.main import MCPVetterAgent

async def test():
    agent = MCPVetterAgent()
    verdict = await agent.audit('file:///path/to/test-fixtures/vulnerable')
    print(verdict)

asyncio.run(test())
"
```

### Agent entry point (TrueForge)

Create `trueforge-project/agent.py`:
```python
from agent.main import MCPVetterAgent

# TrueForge hooks
async def handle_message(message: str, session):
    """Agent receives audit request."""
    agent = MCPVetterAgent()
    
    # Parse: "audit https://github.com/owner/repo"
    repo_url = message.split()[-1]
    
    verdict = await agent.audit(repo_url)
    
    return {
        "verdict": verdict,
        "session": session  # TrueForge maintains session
    }
```

---

## Qodo Workflow (every day)

1. **Create feature branch:**
   ```bash
   git checkout -b feat/static-probe
   ```

2. **Write code** (agent, probes, tests)

3. **Push to PR:**
   ```bash
   git push origin feat/static-probe
   # Open PR on GitHub
   ```

4. **Qodo reviews automatically** (or trigger with `/agentic_review` comment)

5. **Fix findings:**
   ```bash
   git add -A
   git commit -m "fix: improve error handling as per Qodo review"
   git push
   ```

6. **Merge once approved**

**Qodo review evidence:** Each merged PR will have a Qodo review comment. Link to one in your README's "Qodo Code Review Evidence" section.

---

## Testing Strategy

### Unit tests (probes)
```python
# tests/test_static_probe.py
@pytest.mark.asyncio
async def test_static_probe_detects_overpermissioned_scope():
    fixture_path = "test-fixtures/vulnerable"
    probe = StaticProbeTool()
    findings = await probe.audit_static(fixture_path)
    
    assert len(findings) > 0
    assert any(f["severity"] == "HIGH" for f in findings)
```

### Integration tests (agent)
```python
# tests/test_agent.py
@pytest.mark.asyncio
async def test_agent_audits_vulnerable_fixture():
    agent = MCPVetterAgent()
    verdict = await agent.audit("file:///path/to/vulnerable")
    
    assert verdict.risk_level == "HIGH"
    assert len(verdict.findings) >= 2
```

### Demo test (full flow)
```bash
# Test end-to-end with fixture + GitHub issue filing
python -m pytest tests/test_demo_flow.py -v
```

---

## GitHub Token Setup

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Scopes needed:
   - `repo` (full control of private repositories)
   - `read:org` (read organization data)
   - `gist` (read/write gists)
4. Copy token → add to `.env` as `GITHUB_TOKEN=ghp_...`

**For demo:** Use a private fixture repo so issues are filed safely.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| TrueForge won't start | `npm install -g @truefoundry/trueforge@latest` |
| Probe times out | Increase timeout; check if target MCP hangs |
| GitHub API rate limit | Use `GITHUB_TOKEN` (higher rate limit) |
| Qodo not reviewing | Check `.qodo.yml` exists; repo is public |
| Python import errors | `pip install -r requirements.txt` in venv |
| Fixture MCP won't start | Check Python path; verify dependencies |

---

## Key Files to Create (Day 1)
- [x] `requirements.txt` (mcp-security-scanner + uvicorn)
- [x] `.env` (secrets, not in repo)
- [x] `.gitignore` (ignores `.env`, `.venv/`, caches)
- [x] `probe_server/server.py` (three tools wrapping the scanner CLI)
- [x] `deploy/agent-manifest.json` (agent spec for the API)
- [x] `fixtures/` (vulnerable + clean reference servers)

Commit all of these in your first PR.

---

## Key Commands (Reference)

```bash
# Activate venv
source venv/bin/activate

# Run tests
pytest tests/ -v

# Run the probe server (tools the TrueForge agent calls)
uvicorn probe_server.server:mcp_app --host 127.0.0.1 --port 8000

# Scan a fixture directly (same engine the probe server wraps)
mcp-security-scanner scan fixtures/vulnerable_server --static-only --format json

# Start TrueForge
npx @truefoundry/trueforge@latest          # UI: http://localhost:8790

# Lint code (Qodo will also check)
ruff check probe_server/

# Run security checks (Bandit)
bandit -r probe_server/
```
