# Architecture — MCP Vetting Agent

## Reality check (verified against TrueForge docs, Aug 26)

The original design below predates verification. Corrections that supersede anything conflicting underneath:

1. **No `trueforge-project/` scaffold and no `agent.py` hooks exist.** The agent is a saved
   TrueForge *agent spec* (`deploy/agent-manifest.json`) created via UI or `POST /api/v1/agents`.
   The Python class sketches (`MCPVetterAgent`, `GitHubMCP`, probe tool classes) are conceptual only.
2. **Approval gate is native harness behavior.** Tools annotated write/destructive pause automatically
   with Allow/Deny; per-server override is `require_approval_for_tools` in the spec. Delete any
   hand-rolled `wait_for_approval` polling loop.
3. **Subagents are native** (`dynamic_sub_agents` capability, default on). No `asyncio.gather` orchestration needed.
4. **TrueForge connectors take remote URLs only** — our probes run as one local HTTP MCP server
   (`probe_server/server.py`, uvicorn on `127.0.0.1:8000`, registered at `/mcp`).
5. **Real commands**: `npx @truefoundry/trueforge@latest` → UI at `http://localhost:8790`.
   No `init`/`dev`. Sandbox provider is Daytona. GitHub access uses the catalog connector (OAuth),
   not a custom API wrapper or personal token.
6. **Scanning engine** is an internal security scanner driven via its CLI;
   dynamic probes self-isolate in Docker containers independent of TrueForge's sandbox.

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      TrueForge Harness                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Main Agent (Claude/LLM)                               │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  1. Receive target MCP repo URL                        │   │
│  │  2. Clone & analyze repo (GitHub MCP)                 │   │
│  │  3. Spawn Subagent 1 (Static Analysis)                │   │
│  │  4. Spawn Subagent 2 (Injection Probe)                │   │
│  │  5. Spawn Subagent 3 (Scope Escape Probe)             │   │
│  │  6. Collect findings, synthesize verdict              │   │
│  │  7. Draft GitHub security issue                       │   │
│  │  8. ⏸️  APPROVAL PAUSE (wait for human)               │   │
│  │  9. File issue on target MCP repo (on approval)       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            ▲                                    │
│  ┌──────────────┬──────────┼──────────┬────────────────────┐  │
│  │              │          │          │                    │  │
└──┼──────────────┼──────────┼──────────┼────────────────────┘──┘
   │              │          │          │
   ▼              ▼          ▼          ▼
┌─────────────────────────────────────────────┐  ┌──────────────┐
│         Probe MCPs                          │  │ GitHub API   │
│ ────────────────────────────────────────    │  │ ────────────  │
│ • Static Analysis                           │  │ • Clone repo │
│   (AST rules + pattern matching)            │  │ • Read schema│
│ • Injection Probe                           │  │ • File issue │
│   (SQL/command injection test)              │  │              │
│ • Scope Escape Probe                        │  └──────────────┘
│   (process/env access test)                 │
│ • Schema Probe (malformed input)            │  ┌──────────────┐
│                                             │  │ TrueForge    │
│ (All run in TrueForge sandbox)              │  │ Sandbox      │
│                                             │  │ ────────────  │
└─────────────────────────────────────────────┘  │ • Isolates   │
   ▲              ▲          ▲          ▲       │   probes     │
   │              │          │          │       │ • No network │
   └──────┬───────┴──────────┴──────────┘       │ • No host    │
          │                                     │   access     │
          ▼                                     └──────────────┘
   ┌──────────────────────┐
   │   Security Scanner   │
   │ ─────────────────    │
   │ • Static rules       │
   │ • Probe templates    │
   │ • OWASP mappings     │
   │                      │
   │ (Internal tool,      │
   │  not public)         │
   └──────────────────────┘

   ┌──────────────────────┐
   │  Target MCP Repos    │
   │ ─────────────────    │
   │ • Fixture servers    │
   │ • Real community     │
   │   servers (demo)     │
   └──────────────────────┘
```

## Core Components

### 1. **Main Agent (TrueForge)**
**Spec:** `deploy/agent-manifest.json` — a declarative TrueForge agent spec.

**Responsibilities (encoded in instructions, not code):**
- Accept target MCP server GitHub URL or local path
- Clone via `clone_target`, read manifests via `read_target_manifest`
- Spawn subagents for `static_audit` and `full_audit` in parallel
- Collect all findings, synthesize verdict with risk level
- Draft GitHub security issue, **pause for human approval**
- File issue via `file_github_issue` on approval (the only write action)

**Key difference:** The agent is a TrueForge spec, not a Python class. The harness
runs the loop; the probe server provides the tools. No custom orchestration code.

---

### 2. **Subagent 1: Static Analysis**
**Purpose:** Analyze code structure and schemas without running anything.

**Responsibilities:**
- Query GitHub MCP: Clone target repo
- Parse tool schemas (JSON/YAML manifests)
- Run static analysis rules:
  - Check for overpermissioned scopes
  - Detect dangerous tool names
  - Look for missing auth boundaries
  - Identify risky argument patterns
- Return: List of static findings with severity + OWASP category

**Output example:**
```
Static findings:
- OWASP A1: Overpermissioned scope (file_access=*) [HIGH]
- OWASP A3: Dangerous tool "execute_command" [HIGH]
- OWASP A6: No input validation on path arg [MEDIUM]
```

---

### 3. **Subagent 2: Injection Probe**
**Purpose:** Test if tool can be exploited via injection attacks.

**Responsibilities:**
- Take target MCP repo path (from GitHub MCP)
- Run injection probe in sandbox:
  - Attempt SQL injection through tool args
  - Attempt command injection through tool args
  - Attempt LDAP/NoSQL injection
  - Check if injection reaches backend unsanitized
- Return: POC payloads that succeeded + severity

**Output example:**
```
Injection findings:
- SQL Injection: SELECT * WHERE id={PAYLOAD} [VULNERABLE]
  Proof: Payload "' OR '1'='1" bypasses auth
- Command Injection: Blocked by input validation [SAFE]
```

---

### 4. **Subagent 3: Scope Escape Probe**
**Purpose:** Test if tool can escape its sandbox.

**Responsibilities:**
- Take target MCP repo path
- Run scope-escape probe in sandbox:
  - Attempt to read /etc/passwd
  - Attempt to read parent process env vars
  - Attempt to make network calls outside allowed scope
  - Check if tool can access host filesystem
- Return: What it successfully accessed + severity

**Output example:**
```
Scope findings:
- File Escape: Can read ../../etc/passwd [HIGH BREAKOUT]
- Env Escape: Can access process env vars [MEDIUM]
- Network: Restricted to localhost (safe) [LOW]
```

---

### 5. **MCP Tools**

All tools live on the probe server (`probe_server/server.py`) and are called by the
TrueForge agent over MCP streamable-HTTP.

| Tool | Read/Write | What it does |
|------|-----------|--------------|
| `clone_target` | write (temp dirs) | Shallow-clones a GitHub URL onto the probe host |
| `read_target_manifest` | read-only | Returns declared YAML manifests from the target |
| `static_audit` | read-only | AST rules + pattern matching (VULN-001..007) |
| `full_audit` | read-only | Static + Docker-sandboxed dynamic probes (VULN-008..011) |
| `file_github_issue` | **write** | Files a security issue on GitHub (requires `GITHUB_TOKEN`) |

`file_github_issue` is the only tool that leaves the probe host. It reads
`GITHUB_TOKEN` from the server's environment — the browser never handles a
credential. TrueForge's native approval gate pauses on this tool because it
is annotated `destructiveHint: true`.

---

### 6. **Sandbox Execution (TrueForge built-in)**
Agent runs all probes in isolated sandbox:
- Probe processes have no network access (except to target MCP's socket)
- No host filesystem access (mount read-only)
- Timeout (120s per probe)
- Kill on sandbox escape attempt
- All output captured to logs

---

### 7. **Approval Gate**
**Implementation:** TrueForge native HITL (no custom code).

When the agent calls `file_github_issue` (annotated `destructiveHint: true`),
TrueForge automatically pauses with Allow/Deny buttons in the chat UI. The
agent presents the draft issue before calling the tool, and files only on
explicit human approval.

The `require_approval_for_tools` field in the agent spec can override the
default per-tool. No custom polling loop is needed.

---

### 8. **Session Persistence**
TrueForge handles this out-of-the-box:
- Browser refresh → session reconnects automatically
- Probes keep running in background
- User sees audit results resume where they left off

**Demo differentiator:** During subagent probe execution (Day 4), refresh browser → probes keep running.

---

## Data Flow (Repo Audit → GitHub Issue)

```
1. User provides target MCP repo URL
   ↓
2. Agent clones repo via GitHub MCP
   ↓
3. Agent extracts tool schemas + metadata
   ↓
4. Agent spawns Subagent 1 (Static analysis)
5. Agent spawns Subagent 2 (Injection probe)
6. Agent spawns Subagent 3 (Scope escape probe)
   ↓ (parallel)
7. Subagent 1: Parse schemas, apply security rules → "2 HIGH, 1 MEDIUM"
   ↓
8. Subagent 2: Send injection payloads in sandbox → "SQL injection confirmed"
   ↓
9. Subagent 3: Attempt escape in sandbox → "File access escape possible"
   ↓
10. All subagents complete; report findings to main agent
    ↓
11. Main agent synthesizes: "Verdict: HIGH RISK (3 findings)"
    ↓
12. Main agent drafts GitHub issue (title, description, POCs, remediations)
    ↓
13. Main agent PAUSES: "Ready to file? (yes/no)"
    ↓
14. Human reviews draft, clicks "yes"
    ↓
15. Main agent calls GitHub MCP: create_issue()
    ↓
16. GitHub issue filed on target MCP's repo
    ↓
17. Issue is public, irreversible, visible to maintainer
    ↓
18. Main agent reports: "Issue filed. Audit complete."
```

---

## Technology Stack

| Component | Tech | Rationale |
|-----------|------|-----------|
| **Main agent** | TrueForge agent spec (instructions + connectors + capabilities) | Declarative; the harness runs the loop |
| **Probe tools** | FastMCP HTTP server wrapping the scanner CLI | Reachable by any TrueForge agent via a URL |
| **Security scanner** | Internal tool (AST + pattern matching + Docker probes) | Proven security rules |
| **GitHub API** | Official GitHub API (https) | Native integration |
| **Sandbox** | TrueForge built-in | Guaranteed isolation |
| **Docker** | Optional (for local probe testing) | Reproducible environment |

---

## Deployment Model

### Local Development
```bash
# Terminal 1: probe server (tools the agent calls)
source venv/bin/activate
uvicorn probe_server.server:mcp_app --host 127.0.0.1 --port 8000

# Terminal 2: TrueForge
npx @truefoundry/trueforge@latest        # http://localhost:8790

# Then in the UI: register the connector URL, import deploy/agent-manifest.json
# via the API, and chat: "audit ./fixtures/vulnerable_server"
```

### Demo
```bash
# Point agent at fixture vulnerable MCP server
# Probes run in TrueForge sandbox
# Issue is filed on fixture repo (safe to demonstrate)
```

---

## Key Constraints & Mitigations

| Constraint | Risk | Mitigation |
|-----------|------|-----------|
| GitHub API rate limits | Agent throttled | Cache repo info; reuse across sessions |
| Probe hangs/timeout | Subagent blocks | Set 120s timeout; kill on timeout |
| Fixture repo breaks | Demo fails | Keep 2 backup fixture repos; version-lock |
| TrueForge sandbox leaks | Probe escapes | Probes are battle-tested; monitor output |
| No human approval (demo) | Can't test filing | Mock approval in demo script |
| Public GitHub issues on fixtures | Data privacy | Use private fixture repos for dev; public for demo |

---

## Success Criteria

✅ Agent audits target MCP without human intervention  
✅ Subagents run probes in parallel (static + 2 dynamic)  
✅ Approval pause is visible (demo shows draft, human clicks yes)  
✅ GitHub issue filed on real target repo (irreversible public action)  
✅ Session survives browser refresh during probes  
✅ Clean Qodo PR review trail (fresh code, not borrowed)  
✅ Demo shows the investigation & reasoning (not just alert → verdict)  
