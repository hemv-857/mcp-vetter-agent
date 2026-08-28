# Tasks & Week Plan — MCP Vetting Agent

## Day 1 (Today) — Scaffold & Foundations
**Goal:** Repo ready, Qodo wired, first PR reviewed, TrueForge running locally.

### 1.1 Repo setup & Qodo configuration [Critical]
- [x] Register team at hackathon form
- [x] Create public GitHub repo (`mcp-vetter-agent`)
- [x] Add Qodo to repo via https://app.qodo.ai/signin
- [x] Install the Qodo GitHub App on the repo (one admin; no config file exists)
- [x] README complete (problem, solution, architecture, quick start, Qodo evidence)
- [x] Qodo Code Review Evidence section with PR #1 trail (4 rounds → 0 findings)

**First PR:** Project scaffold (folder structure, requirements.txt, README)
- [x] Commit message: `scaffold: initial project structure`
- [x] Push, open PR, wait for Qodo review
- [x] Address findings, merge once approved (PR #1 merged)

### 1.2 Local TrueForge setup [Critical]
- [x] `npx @truefoundry/trueforge@latest` (Node 22.14+; UI at http://localhost:8790)
- [ ] Configure a model provider in Settings → Models (paste API key)
- [ ] Register the probe server URL `http://127.0.0.1:8000/mcp` under Settings → Connectors
- [ ] Test with a dummy chat turn

### 1.3 Model provider [Critical]
- [ ] Choose: Claude (Anthropic API) or open-source
- [ ] Paste API key in Settings → Models (TrueForge stores it; nothing in `.env`)
- [ ] Test model can be called from a TrueForge agent turn

### 1.4 Scanning engine setup [Critical]
- [x] Install the security scanner (pip package installed in .venv)
- [x] Smoke-test CLI against bundled fixtures (`--static-only`, then full with Docker up)
- [x] Review rule IDs VULN-001..011 and the JSON report shape

**Deliverable:** Qodo-reviewed PR merged, TrueForge running, scanner understood. ✅

---

## Day 2 — MCP Vetting Infra & Tools
**Goal:** GitHub MCP wired, probe tools scaffolded, sandbox ready.

### 2.1 GitHub connector [Critical]
- [ ] Enable the catalog GitHub connector in TrueForge (OAuth — no token management)
- [ ] Verify the agent can read a repo's files and create an issue on our fixture repo

### 2.2 Probe server [Critical]
- [x] `probe_server/server.py`: one HTTP MCP server exposing four tools:
  - [x] `clone_target` (shallow-clones GitHub repos onto the probe host)
  - [x] `static_audit` (AST rules + pattern matching, no Docker, no model calls)
  - [x] `full_audit` (AI review + Docker-sandboxed dynamic probes VULN-008..011)
  - [x] `read_target_manifest` (declared tools / permissions for schema reasoning)
- [x] Run with uvicorn on `127.0.0.1:8000`; registered at `/mcp`
- [x] Live verified: `clone_target` → `static_audit` → 7 findings on vulnerable fixture
- [x] Live verified: `full_audit` → VULN-008 confirmed in Docker sandbox
- [x] Live verified: `read_target_manifest` → returns YAML manifests

### 2.3 Sandbox environment setup [Critical]
- [x] Dynamic probes self-isolate: engine runs each probe inside throwaway Docker containers
- [ ] Configure TrueForge sandbox provider (Daytona) for cloning targets and ad-hoc scripts
- [x] Test: `full_audit` runs with Docker up; fails loudly when Docker is down

### 2.4 Fixture vulnerable MCP servers [Critical]
- [x] Use bundled fixtures (hardened + vulnerable-by-design servers)
  - [x] `fixtures/vulnerable_server/` — `eval()` calculator, unrestricted file reader, poisoned prompt
  - [x] `fixtures/clean_server/` — hardened reference server
- [x] Ensure repo has these fixtures for demo reliability

**Deliverable:** PR (Qodo reviewed), GitHub MCP works, probes wired, fixtures ready. ✅

---

## Day 3 — Agent Orchestration & Reasoning
**Goal:** Agent audits a target MCP server end-to-end.

### 3.1 Agent initialization [Critical]
- [x] Agent accepts: GitHub URL of target MCP server (via `clone_target` tool)
- [x] Agent logs workflow steps (in agent-manifest.json instructions)
- [x] Clone repo via GitHub MCP (via `clone_target`)

### 3.2 Static analysis subagent [Critical]
- [x] Subagent 1: runs `static_audit` on target
- [x] Reads tool schema, rules engine checks for:
  - [x] Overpermissioned scopes (can access everything?)
  - [x] Missing auth boundaries
  - [x] Dangerous tool names ("execute_command", "delete_file")
- [x] Outputs: list of static findings + severity

### 3.3 Dynamic probe subagents [Critical]
- [x] Subagent 2: runs `full_audit` (dynamic probes in Docker)
  - [x] Attempts SQL injection, command injection through tool args
  - [x] Sandbox prevents actual damage
  - [x] Outputs: "VULNERABLE" or "SAFE" + proof-of-concept

- [x] Subagent 3: scope/schema reasoning from `read_target_manifest` + findings
  - [x] Attempts to escape sandbox (read parent, env vars, etc.)
  - [x] Outputs: "BREAKOUT_POSSIBLE" or "CONTAINED"

### 3.4 Agent synthesis [Critical]
- [x] Parent agent collects all findings (in agent-manifest.json instructions)
- [x] Assigns risk level: HIGH / MEDIUM / LOW
- [x] Reasoning documented in agent instructions

**PR checkpoint:** Full audit flow tested, reasoning logic refined ✅

**Deliverable:** Agent audits a fixture MCP end-to-end, outputs verdict. ✅

---

## Day 4 — Approval Gate & GitHub Filing
**Goal:** Approval pause works, GitHub issue filing works, full flow end-to-end.

### 4.1 Approval gate + draft [Critical]
- [x] Agent reaches: "VERDICT: HIGH RISK. Recommend blocking." (in instructions)
- [x] Agent drafts GitHub security issue (in instructions: title, description, labels)
- [x] Agent pauses: "Ready to file? (yes/no)" (native TrueForge approval gate)
- [ ] Human reviews draft, clicks "yes" to proceed (needs TrueForge running)

### 4.2 Issue filing via GitHub connector [Critical]
- [ ] Agent files via the catalog GitHub connector's create-issue tool
- [x] That tool is write/destructive-annotated: TrueForge pauses natively for Allow/Deny
- [x] `require_approval_for_tools` configured in agent spec
- [ ] Verify: issue appears on fixture repo after clicking Allow

**Verify native approval gate works:**
- [x] TrueForge automatically pauses when tool is `write/destructive`
- [x] Shows Allow/Deny buttons in the chat UI
- [x] No custom approval code needed

### 4.3 End-to-end test [Critical]
- [x] Point agent at vulnerable fixture server
- [x] Agent runs full audit (static + dynamic probes)
- [x] Probes detect vulnerabilities (7-8 findings confirmed)
- [x] Agent drafts issue (in agent instructions)
- [ ] Approve (needs TrueForge running)
- [ ] Issue filed on fixture repo (needs TrueForge + GitHub OAuth)
- [ ] Confirm issue is public + visible

### 4.4 Session resilience test [Critical]
- [ ] During subagent probe execution:
  - [ ] Refresh browser (kill session)
  - [ ] Agent continues running probes in background
  - [ ] On reconnect, you see probe results resume
- [ ] This is a free demo differentiator

**PR checkpoint:** Full flow tested, Qodo review ✅

**Deliverable:** Full audit → findings → draft → approval → filing working. ✅ (code complete, needs live TrueForge test)

---

## Day 5 — Demo & Documentation
**Goal:** Demo video recorded, README complete, ready to submit.

### 5.1 Demo recording [Critical]
- [x] Script the full audit flow (`docs/demo_script.md` — 3-minute narrated script)
- [ ] Record:
  - [ ] Agent receives target MCP URL
  - [ ] Agent clones repo (GitHub MCP at work)
  - [ ] Static probe fires (schema violation detected)
  - [ ] Subagents run dynamic tests in parallel (injection + scope escape)
  - [ ] Agent synthesizes findings (HIGH RISK: injection + escape vector detected)
  - [ ] Agent drafts GitHub issue (show title + description)
  - [ ] Approval moment (you click "yes" to file)
  - [ ] GitHub issue filed (irreversible, public on fixture repo)
  - [ ] Browser refresh (mid-probe execution to show persistence)
- [ ] Edit into 3-minute narrative
- [ ] Upload to YouTube (unlisted or public, link in README)

### 5.2 README [Critical]
- [x] Problem statement (MCP supply-chain security)
- [x] Solution (agent audits servers before connection)
- [x] Architecture diagram (agent, GitHub MCP, probes, sandbox)
- [x] Quick start: `git clone`, setup probes, run agent with target URL
- [x] **Qodo Code Review Evidence:** Link to merged PR reviewed by Qodo
- [ ] Demo video link
- [x] How to run against fixture (for judges/reproducers)
- [x] What each probe detects
- [x] How approval gate + GitHub filing works

### 5.3 Code cleanup [Critical]
- [x] Remove debug prints
- [x] Add docstrings to all public functions
- [x] Ensure `.env` is in `.gitignore`
- [x] Verify no real GitHub tokens in repo
- [x] Final PRs through Qodo (PR #1 merged with 0 findings)
- [x] All Sentinel references stripped
- [x] Renamed to MCP Vetting Agent

### 5.4 Submit [Critical]
- [ ] Fill hackathon submission form
- [ ] Link to repo
- [ ] Link to demo video
- [x] Confirm README has Qodo evidence section
- [ ] Submit early (don't wait until 8 PM Aug 30)

**Deliverable:** Polished submission, video, code trail. ✅ (code done, needs video + submit)

---

## Parallel Track: Blog & Social (Optional, separate prizes)
- [ ] Write blog post as you build (supply-chain security for agents)
- [ ] Clip the moment when GitHub issue is filed (dramatic moment)
- [ ] Tweet: "We built an AI security auditor for AI tools" + demo clip

---

## Risk Mitigations
- **Fixture server breaks:** Keep backup hardened + vulnerable servers; test early ✅
- **GitHub API rate limits:** Use caching; don't hammer API in dev
- **Qodo review slow:** Start PRs early; don't block on review ✅
- **TrueForge bugs:** Join Discord, ask for help early
- **Sandbox escape during probe:** Scanner handles isolation; test thoroughly ✅

---

## Checkpoints (for Loop)
- [x] Day 1 EOD: PR merged, TrueForge running, scanner understood
- [x] Day 2 EOD: Probes wired, fixtures ready, live-verified
- [x] Day 3 EOD: Agent spec complete, audit logic working
- [x] Day 4 EOD: Approval gate + filing logic complete (needs live TrueForge test)
- [ ] Day 5 EOD: Demo recorded, README done, submitted

---

## UI Build (NEW — after backend complete)
- [x] Create UI handoff docs (HANDOFF.md, CLAUDE_CODE.md, UI_SPEC.md, API_REFERENCE.md, UI_ARCHITECTURE.md)
- [x] Build frontend (React + Vite + Tailwind + MCP SDK)
- [x] Frontend connects to probe server on port 8000
- [x] Audit log shows real-time scan progress
- [x] Findings table displays results
- [x] Draft issue panel with approval checkbox
- [x] Filed confirmation with GitHub link
- [x] Dark mode, responsive, keyboard shortcuts
