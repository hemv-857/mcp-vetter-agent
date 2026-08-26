# Tasks & Week Plan — MCP Vetter Agent

## Day 1 (Today) — Scaffold & Foundations
**Goal:** Repo ready, Qodo wired, first PR reviewed, TrueForge running locally.

### 1.1 Repo setup & Qodo configuration [Critical]
- [ ] Register team at hackathon form
- [ ] Create public GitHub repo (`mcp-vetter-agent`)- [ ] Add Qodo to repo via https://app.qodo.ai/signin
- [ ] Install the Qodo GitHub App on the repo (one admin; no config file exists)
- [ ] README skeleton with structure (no content yet)
- [ ] Add "Qodo Code Review Evidence" section placeholder

**First PR:** Project scaffold (folder structure, requirements.txt, README)
- Commit message: `scaffold: initial project structure`
- Push, open PR, wait for Qodo review
- Address findings, merge once approved

### 1.2 Local TrueForge setup [Critical]
- [ ] `npx @truefoundry/trueforge@latest` (Node 22.14+; UI at http://localhost:8790 — no init/dev subcommands)
- [ ] Configure a model provider in Settings → Models (paste API key)
- [ ] Register the probe server URL `http://127.0.0.1:8000/mcp` under Settings → Connectors
- [ ] Test with a dummy chat turn

### 1.3 Model provider [Critical]
- [ ] Choose: Claude (Anthropic API) or open-source
- [ ] Paste API key in Settings → Models (TrueForge stores it; nothing in `.env`)
- [ ] Test model can be called from a TrueForge agent turn

### 1.4 Scanning engine setup [Critical]
- [ ] Install the security scanner (see team lead for package source)
- [ ] Smoke-test CLI against bundled fixtures (`--static-only`, then full with Docker up)
- [ ] Review rule IDs VULN-001..011 and the JSON report shape

**Deliverable:** Qodo-reviewed PR merged, TrueForge running, scanner understood.

---

## Day 2 — MCP Vetting Infra & Tools
**Goal:** GitHub MCP wired, probe tools scaffolded, sandbox ready.

### 2.1 GitHub connector [Critical]
- [ ] Enable the catalog GitHub connector in TrueForge (OAuth — no token management)
- [ ] Verify the agent can read a repo's files and create an issue on our fixture repo

### 2.2 Probe server [Critical]
- [x] `probe_server/server.py`: one HTTP MCP server exposing three tools:
  - `static_audit` (AST rules + pattern matching, no Docker, no model calls)
  - `full_audit` (AI review + Docker-sandboxed dynamic probes VULN-008..011)
  - `read_target_manifest` (declared tools / permissions for schema reasoning)
- [ ] Run with uvicorn on `127.0.0.1:8000`; register URL in TrueForge Connectors
- [ ] Call each tool from a TrueForge chat turn; inspect JSON output

### 2.3 Sandbox environment setup [Critical]
- [ ] Dynamic probes already self-isolate: the engine runs each probe inside throwaway Docker containers
- [ ] Configure TrueForge sandbox provider (Daytona) for cloning targets and ad-hoc scripts
- [ ] Test: `full_audit` runs with Docker up; fails loudly when Docker is down

### 2.4 Fixture vulnerable MCP servers [Critical]
- [ ] Use bundled fixtures (hardened + vulnerable-by-design servers)
  - Example 1: Tool with unrestricted file access
  - Example 2: Tool with SQL injection vector
  - Example 3: Tool that can escape sandbox
- [ ] Ensure repo has these fixtures for demo reliability

**Deliverable:** PR (Qodo reviewed), GitHub MCP works, probes wired, fixtures ready.

---

## Day 3 — Agent Orchestration & Reasoning
**Goal:** Agent audits a target MCP server end-to-end.

### 3.1 Agent initialization [Critical]
- [ ] Agent accepts: GitHub URL of target MCP server
- [ ] Agent logs: "Starting audit of {repo}..."
- [ ] Clone repo via GitHub MCP

### 3.2 Static analysis subagent [Critical]
- [ ] Subagent 1: runs `static_audit` on target
- [ ] Reads tool schema, rules engine checks for:
  - Overpermissioned scopes (can access everything?)
  - Missing auth boundaries
  - Dangerous tool names ("execute_command", "delete_file")
- [ ] Outputs: list of static findings + severity

### 3.3 Dynamic probe subagents [Critical]
- [ ] Subagent 2: runs `full_audit` (dynamic probes in Docker)
  - Attempts SQL injection, command injection through tool args
  - Sandbox prevents actual damage
  - Outputs: "VULNERABLE" or "SAFE" + proof-of-concept
  
- [ ] Subagent 3: scope/schema reasoning from `read_target_manifest` + findings
  - Attempts to escape sandbox (read parent, env vars, etc.)
  - Outputs: "BREAKOUT_POSSIBLE" or "CONTAINED"

### 3.4 Agent synthesis [Critical]
- [ ] Parent agent collects all findings
- [ ] Assigns risk level: HIGH / MEDIUM / LOW
- [ ] Reason: "3 findings detected: unrestricted file access (HIGH), injection vector (MEDIUM)"
- [ ] Confidence: 85% this tool is unsafe to use

**PR checkpoint:** Full audit flow tested, reasoning logic refined

**Deliverable:** Agent audits a fixture MCP end-to-end, outputs verdict.

---

## Day 4 — Approval Gate & GitHub Filing
**Goal:** Approval pause works, GitHub issue filing works, full flow end-to-end.

### 4.1 Approval gate + draft [Critical]
- [ ] Agent reaches: "VERDICT: HIGH RISK. Recommend blocking."
- [ ] Agent drafts GitHub security issue:
  - Title: "Security audit findings: {tool_name}"
  - Description: Summarize each finding with severity, POC, remediation hint
  - Labels: "security", "vulnerability"
- [ ] Agent pauses: "Ready to file? (yes/no)"
- [ ] Human reviews draft, clicks "yes" to proceed

### 4.2 Issue filing via GitHub connector [Critical]
- [ ] Agent files via the catalog GitHub connector's create-issue tool — no custom wrapper
- [ ] That tool is write/destructive-annotated: TrueForge pauses natively for Allow/Deny
- [ ] Optionally tighten per-server with `require_approval_for_tools` in the agent spec
- [ ] Verify: issue appears on fixture repo after clicking Allow

### 4.3 End-to-end test [Critical]
- [ ] Point agent at vulnerable fixture server
- [ ] Agent runs full audit (static + 3 dynamic probes)
- [ ] Probes detect vulnerabilities
- [ ] Agent drafts issue
- [ ] Approve
- [ ] Issue filed on fixture repo
- [ ] Confirm issue is public + visible

### 4.4 Session resilience test [Critical]
- [ ] During subagent probe execution (step 3.3):
  - Refresh browser (kill session)
  - Agent continues running probes in background
  - On reconnect, you see probe results resume
- [ ] This is a free demo differentiator

**PR checkpoint:** Full flow tested, Qodo review

**Deliverable:** Full audit → findings → draft → approval → filing working.

---

## Day 5 — Demo & Documentation
**Goal:** Demo video recorded, README complete, ready to submit.

### 5.1 Demo recording [Critical]
- [ ] Script the full audit flow (reliable takes)
- [ ] Record:
  - Agent receives target MCP URL
  - Agent clones repo (GitHub MCP at work)
  - Static probe fires (schema violation detected)
  - Subagents run dynamic tests in parallel (injection + scope escape)
  - Agent synthesizes findings (HIGH RISK: injection + escape vector detected)
  - Agent drafts GitHub issue (show title + description)
  - Approval moment (you click "yes" to file)
  - GitHub issue filed (irreversible, public on fixture repo)
  - Browser refresh (mid-probe execution to show persistence)
- [ ] Edit into 3-minute narrative
- [ ] Upload to YouTube (unlisted or public, link in README)

### 5.2 README [Critical]
- [ ] Problem statement (MCP supply-chain security)
- [ ] Solution (agent audits servers before connection)
- [ ] Architecture diagram (agent, GitHub MCP, probes, sandbox)
- [ ] Quick start: `git clone`, setup probes, run agent with target URL
- [ ] **Qodo Code Review Evidence:** Link to merged PR reviewed by Qodo
- [ ] Demo video link
- [ ] How to run against fixture (for judges/reproducers)
- [ ] What each probe detects
- [ ] How approval gate + GitHub filing works

### 5.3 Code cleanup [Critical]
- [ ] Remove debug prints
- [ ] Add docstrings to all agent methods
- [ ] Ensure `.env` is in `.gitignore`
- [ ] Verify no real GitHub tokens in repo
- [ ] Final PR through Qodo
- [ ] Merge

### 5.4 Submit [Critical]
- [ ] Fill hackathon submission form
- [ ] Link to repo
- [ ] Link to demo video
- [ ] Confirm README has Qodo evidence section
- [ ] Submit early (don't wait until 8 PM Aug 30)

**Deliverable:** Polished submission, video, code trail.

---

## Parallel Track: Blog & Social (Optional, separate prizes)
- [ ] Write blog post as you build (supply-chain security for agents)
- [ ] Clip the moment when GitHub issue is filed (dramatic moment)
- [ ] Tweet: "We built an AI security auditor for AI tools" + demo clip

---

## Risk Mitigations
- **Fixture server breaks:** Keep backup hardened + vulnerable servers; test early
- **GitHub API rate limits:** Use caching; don't hammer API in dev
- **Qodo review slow:** Start PRs early; don't block on review
- **TrueForge bugs:** Join Discord, ask for help early
- **Sandbox escape during probe:** Scanner handles isolation; test thoroughly

---

## Checkpoints (for Loop)
- [ ] Day 1 EOD: PR merged, TrueForge running, scanner understood
- [ ] Day 2 EOD: GitHub MCP works, probes wired, fixtures ready
- [ ] Day 3 EOD: Agent auditing, subagents working in parallel
- [ ] Day 4 EOD: Approval gate + GitHub filing working end-to-end
- [ ] Day 5 EOD: Demo recorded, README done, submitted
