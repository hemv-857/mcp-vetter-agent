# OpenCode/Loop Engineering — Continuous Build Prompt

## Project: MCP Vetter Agent

You are building an **AI security auditor for AI tools** that runs on TrueForge. This project must win the Agent Harness Hackathon (Aug 24–30, 2026).

> **REALITY CHECK (verified Aug 26 against trueforge.dev) — supersedes anything conflicting below:**
> - Run TrueForge with `npx @truefoundry/trueforge@latest` → UI at **http://localhost:8790**. There is NO `init`, NO `dev`, no project scaffold, no agent.py hooks, no TRUEFORGE_API_KEY.
> - The agent is a **saved agent spec** (`deploy/agent-manifest.json` via `POST /api/v1/agents`) — model + instructions + connectors + capabilities. Do not hand-write orchestration classes.
> - Subagents are native (`dynamic_sub_agents`, on by default). Ignore any `asyncio.gather` pattern below.
> - Approval gates are native: write/destructive-annotated tools auto-pause with Allow/Deny; per-server override is `require_approval_for_tools`. Ignore any hand-rolled polling loop below.
> - Connectors take remote URLs only → probes run as ONE local HTTP MCP server: `probe_server/server.py` (uvicorn, `127.0.0.1:8000`, path `/mcp`), registered under Settings → Connectors.
> - GitHub = catalog connector (OAuth), not a custom httpx wrapper or personal token.
> - Qodo has no config file: one admin installs the GitHub App; PRs are reviewed automatically (fallback comment: `/agentic_review`).
> - Scanning engine = published `mcp-sentinel` pip package via its CLI; dynamic probes self-isolate in Docker.

---

## High-Level Brief

**What we're building:**
An agent running on TrueForge that audits third-party MCP (Model Context Protocol) servers for security vulnerabilities BEFORE you trust them with your agent. The agent:
1. Clones a target MCP server repo (via GitHub MCP)
2. Runs 3 parallel security probes (static analysis + 2 dynamic tests)
3. Synthesizes findings into a verdict (risk level: HIGH/MEDIUM/LOW)
4. Drafts a GitHub security issue
5. **Pauses** and waits for human approval
6. **Files the issue** on the target repo (irreversible public action)

**Why this wins:**
- **Originality:** "Supply-chain security FOR agents" is fresh; the field will be full of incident responders
- **Control/safety:** Filing a public GitHub issue is more irreversible than internal rollback
- **All six judging criteria:** Creativity (meta), technical excellence (probe orchestration), impact (security teams use this), control/safety (approval gate before public action), TrueForge showcase (real MCPs + sandbox + approval), presentation (dramatic moment when issue files)

**Demo moment:** Probe fires → vulnerability confirmed → agent drafts issue → "Ready to file?" → you click yes → issue is now public on maintainer's repo

---

## Architecture at a Glance

```
TrueForge Agent
  ├─ Clone & analyze target MCP repo (GitHub connector)
  ├─ Fan out to native subagents in parallel:
  │   ├─ static_audit (AST rules, no Docker)
  │   ├─ full_audit (GPT review + Docker probes)
  │   └─ manifest reasoning (read_target_manifest)
  ├─ Synthesize findings → Verdict
  ├─ Draft GitHub issue
  ├─ ⏸️ Native approval pause (Allow/Deny)
  └─ File issue on target repo (on Allow)
```

Full architecture in `architecture.md`.

---

## Week Timeline (4.5 days left)

### Day 1 (Today): Scaffold & Foundations
**Goal:** Repo ready, Qodo wired, TrueForge running, first PR merged.

**Tasks:**
- [x] Scaffold (done: `probe_server/`, `fixtures/`, `deploy/agent-manifest.json`, docs, README)
- [ ] Create public GitHub repo + install Qodo GitHub App (one admin) 
- [ ] First PR: project scaffold (reviewed by Qodo, merged)
- [ ] TrueForge running (`npx @truefoundry/trueforge@latest`, port 8790)
- [ ] Model provider configured in Settings → Models
- [ ] Probe server up (`uvicorn probe_server.server:mcp_app --port 8000`) and registered in Connectors

**Checkpoint:** Qodo-reviewed PR merged, TrueForge running with the probe connector attached

### Day 2: MCP Tools & Probes
**Goal:** GitHub MCP wired, probe tools scaffolded, fixtures ready.

**Tasks:**
- [x] `probe_server/server.py` implemented (static_audit / full_audit / read_target_manifest wrapping the scanner CLI)
- [x] Fixture vulnerable + hardened servers bundled (`fixtures/`)
- [ ] Unit tests for the probe server (subprocess wrapper, manifest reader)
- [ ] PR: Probe server + fixtures (reviewed by Qodo, merged)

**Checkpoint:** Probes working locally against fixtures

### Day 3: Agent Orchestration
**Goal:** Agent audits a target MCP server end-to-end.

**Tasks:**
- [ ] Refine agent instructions in `deploy/agent-manifest.json` (audit workflow, verdict format)
- [ ] Create the saved agent via `POST /api/v1/agents`; attach probe + GitHub connectors
- [ ] Verify subagent fan-out appears in the Agent-steps panel during an audit
- [ ] Integration test: chat "audit ./fixtures/vulnerable_server" → verdict in transcript
- [ ] PR: manifest + tests (reviewed by Qodo, merged)

**Checkpoint:** Agent audits a fixture MCP server, outputs verdict

### Day 4: Approval Gate & GitHub Filing
**Goal:** Full flow end-to-end (audit → findings → draft → approval → file).

**Tasks:**
- [ ] Encode judgment rules in agent instructions (HIGH/MEDIUM/LOW, OWASP mapping, static-vs-confirmed distinction)
- [ ] Issue drafting happens in-agent (markdown in transcript); no custom code needed
- [ ] Approval gate: verify the GitHub create-issue tool auto-pauses with Allow/Deny; tighten with `require_approval_for_tools` if needed
- [ ] End-to-end test: audit fixture → findings → draft → Allow → issue filed on fixture repo
- [ ] Session resilience test (refresh browser mid-probe; continues)
- [ ] PR: Full flow working (reviewed by Qodo, merged)

**Checkpoint:** Full audit → approval → GitHub filing working

### Day 5: Demo & Documentation
**Goal:** Demo video recorded, README complete, submitted.

**Tasks:**
- [ ] Script the demo flow (perfect takes, reliable)
- [ ] Record 3-minute video:
  - Agent receives target URL
  - Clones repo
  - Runs probes in parallel (show both static + dynamic)
  - Synthesizes verdict (HIGH RISK)
  - Drafts issue
  - **Approval moment** (click yes)
  - Issue filed on GitHub (irreversible, public)
  - Browser refresh (mid-probe; session survives)
- [ ] Edit video, upload to YouTube
- [ ] Polish README:
  - Problem statement
  - Solution overview
  - Architecture diagram
  - Quick start (how to run)
  - **Qodo Code Review Evidence** (link to merged reviewed PR)
  - Demo video link
  - How to trigger audit
  - How approval gate works
- [ ] Code cleanup (remove debug prints, add docstrings)
- [ ] Final PR: documentation + demo (reviewed by Qodo, merged)
- [ ] Submit to hackathon form

**Checkpoint:** Polished submission, video, code trail

---

## Core Requirements (Non-Negotiable)

### 1. **Qodo Review Trail** (Mandatory)
- Every substantive code change goes through a PR
- Qodo reviews before merge
- README has "Qodo Code Review Evidence" section linking to at least one reviewed merged PR
- Judges will check this

### 2. **TrueForge Integration** (Must be real)
- Agent runs ON TrueForge (not external script calling TrueForge)
- Real MCP tools used (GitHub MCP for repo access)
- Sandboxed probe execution (TrueForge sandbox runs the probes)
- Approval pause (agent waits for human before filing issue)
- Session resilience (survives browser refresh)
- Subagents (at least 2 running in parallel)

### 3. **Real GitHub Action** (Money shot)
- Agent does **file a real GitHub issue** on a real repo
- For demo: use a private fixture repo you control
- This is the **irreversible action** that makes the approval gate meaningful
- Judges will see this in the video

### 4. **Proof of Fresh Work**
- Agent logic + orchestration code written this week (not pre-existing)
- Sentinel library can be reused (it's a "tool the agent calls"), but must be clearly separated
- Qodo review trail shows the fresh code being reviewed

### 5. **Clean Demo** (3 min, pre-recorded)
- Shows: audit → probe findings → synthesis → draft → approval → file
- Dramatic moment: GitHub issue is filed (visible public action)
- Browser refresh mid-flow (shows session persistence)
- No failures, no janky cuts (re-record until perfect)

---

## Continuous Development Instructions (for Loop/OpenCode)

**Your job:** Execute this plan end-to-end, day by day, with **no human intervention** except at decision points.

### Mode: Loop Engineering

Use **loop engineering** (continuous, iterative refinement):
- Write code
- Run tests
- Fix failures
- Commit (through Qodo review)
- Move to next feature
- No hand-off delays

### Strategy

1. **Start with the scaffold** (Day 1)
   - Repo structure first
   - Get TrueForge running ASAP
   - First PR through Qodo immediately (proves the pipeline works)

2. **Build probes next** (Day 2)
   - Reuse Sentinel templates (don't reinvent)
   - Wire each probe as a separate tool
   - Test locally against fixtures
   - All probes must work in TrueForge sandbox

3. **Build agent logic** (Day 3)
   - Agent orchestrates probes (not the other way around)
   - Agent must *reason* (not just invoke tools blindly)
   - Subagents run in parallel (use `asyncio.gather()` or TrueForge's subagent API)

4. **Approval gate** (Day 4)
   - This is the heart of the project
   - Agent pauses, shows draft, waits for human yes/no
   - On yes: file GitHub issue (the irreversible action)
   - Test this thoroughly

5. **Demo + docs** (Day 5)
   - Record clean video (multiple takes if needed)
   - Polish README (judges will read this first)
   - Submit early (don't wait until 8 PM)

### Quality Standards

- **Code:** Clean, documented, linted (Qodo will check)
- **Tests:** Unit tests for each probe, integration test for full flow
- **Probes:** All must run in TrueForge sandbox without escaping/crashing
- **Demo:** Perfect takes (no glitches, no timeouts, no failures)

### Risk Mitigation

- **If a probe fails:** Swap in mock result; continue building other parts
- **If GitHub API breaks:** Use local fixture repos instead
- **If TrueForge hangs:** Restart; check logs; ask Discord for help
- **If time is tight:** Drop "nice-to-have" features (e.g., multi-repo audit)

---

## Specific Code Patterns (Copy-paste friendly)

### Agent with subagents (asyncio)
```python
import asyncio

class MCPVetterAgent:
    async def run_probes(self, repo_path):
        # Spawn 3 subagents in parallel
        static_task = asyncio.create_task(
            self.static_probe.audit_static(repo_path)
        )
        injection_task = asyncio.create_task(
            self.injection_probe.test_injection(repo_path)
        )
        scope_task = asyncio.create_task(
            self.scope_probe.test_scope_escape(repo_path)
        )
        
        # Wait for all to complete
        static_findings, injection_findings, scope_findings = await asyncio.gather(
            static_task, injection_task, scope_task
        )
        
        return {
            "static": static_findings,
            "injection": injection_findings,
            "scope": scope_findings
        }
```

### GitHub MCP wrapper
```python
import httpx

class GitHubMCP:
    def __init__(self, token: str):
        self.client = httpx.AsyncClient(
            headers={"Authorization": f"token {token}"}
        )
    
    async def create_issue(self, owner, repo, title, body, labels):
        url = f"https://api.github.com/repos/{owner}/{repo}/issues"
        response = await self.client.post(url, json={
            "title": title,
            "body": body,
            "labels": labels
        })
        return response.json()["html_url"]
```

### Approval pause (TrueForge)
```python
async def wait_for_approval(self, issue_draft: str) -> bool:
    while True:
        # TrueForge API to get user input
        response = await self.trueforge_session.prompt(
            f"Approve filing this issue?\n\n{issue_draft}\n\nYes/No: "
        )
        if response.lower() == "yes":
            return True
        elif response.lower() == "no":
            return False
```

---

## Judging Criteria (Keep in Mind)

| Criterion | What it means | How we score HIGH |
|-----------|---------------|-------------------|
| **Impact** | Does someone use this? | Security teams audit tools before connection (yes) |
| **Creativity** | Is the idea fresh? | "Supply-chain security for agents" (yes, original) |
| **Tech excellence** | Is code clean/reliable? | Qodo review trail + working probes + agent logic |
| **Sponsor tools** | Is TrueForge central? | GitHub MCP + sandbox + approval gate + subagents (yes) |
| **Control/safety** | Pause before risky action? | GitHub issue filing is irreversible public action (yes) |
| **Presentation** | Is demo clear? | Audit → findings → draft → approve → file (yes) |

---

## What NOT to Do

❌ Don't reuse Sentinel *as the whole project* (it must be a tool the agent calls)  
❌ Don't auto-approve; approval gate must be visible and real  
❌ Don't use mock GitHub (file real issues for demo)  
❌ Don't skip Qodo reviews (judges will see the trail)  
❌ Don't make the demo fail (re-record until perfect)  
❌ Don't wait until day 5 to test the end-to-end flow  

---

## Success Metrics

By submission (Aug 30, 8 PM London):
- ✅ Public GitHub repo with clean README
- ✅ Qodo review evidence (at least 1 merged reviewed PR)
- ✅ 3-minute demo video showing full audit → approval → filing
- ✅ Agent runs on TrueForge (not external)
- ✅ Real GitHub issue filed (irreversible action)
- ✅ Session resilience demo (browser refresh mid-audit)
- ✅ All code Qodo-reviewed
- ✅ No secrets in repo

---

## Key Documentation Files

You'll create:
- `prd.md` — Product requirements
- `architecture.md` — System design
- `tasks.md` — Week breakdown
- `setup.md` — Dev setup instructions
- `README.md` — Public-facing (judges read this)
- `QODO.md` — Qodo evidence section (optional, can go in README)
- `API.md` — API reference (optional)

All files exist as stubs; fill them in as you go.

---

## Final Checklist

### Before Day 5 evening:
- [ ] Repo is public, README is complete
- [ ] At least 3 PRs merged (each Qodo-reviewed)
- [ ] Agent audits fixture MCP end-to-end
- [ ] Approval gate works (pauses, waits for yes/no)
- [ ] GitHub issue files on approval
- [ ] Session survives browser refresh
- [ ] Demo video recorded (3 min, perfect takes)
- [ ] All code is linted/documented

### Submission:
- [ ] Hackathon form filled out
- [ ] Repo link provided
- [ ] Demo video link provided
- [ ] README has Qodo evidence section
- [ ] Submitted before 8 PM Aug 30 London time

---

## Questions? 

If you hit a blocker:
1. Check Discord (#agent-harness-hackathon on WeMakeDevs)
2. Check TrueForge docs: https://trueforge.dev
3. Check Sentinel repo for probe examples
4. Try a different approach; don't get stuck

**Goal:** Build a winning submission. Go.
