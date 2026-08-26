# MCP Vetting Agent — PRD

## Problem
TrueForge agents can connect to *any* MCP server—including untrusted third-party ones from the community. A malicious MCP tool can hijack your agent, exfiltrate data, or escalate privileges. Nobody vets these servers before connection.

## Solution
An agent that runs on TrueForge that:
1. **Audits third-party MCP servers** before you trust them (static analysis + dynamic probes)
2. **Reasons through findings** (shows confidence: "High risk — tool can escape sandbox" vs "Low risk — read-only")
3. **Proposes a verdict** (Safe to use? Blocked? Needs review?)
4. **Stops before filing a report** (approval pause: human reviews draft security issue before it's filed publicly on the maintainer's repo—irreversible)
5. **Survives reconnects** (if you refresh the browser mid-audit, agent keeps working)

## Target User
- Security teams vetting MCP servers before integrating them
- Agent builders who want to audit tools before connection
- DevOps/platform teams managing approved tool registries

## Success Criteria for Hackathon
- **Impact:** Supply-chain security for agents (timely, real problem)
- **Creativity:** Meta angle ("who audits the auditor's tools?"), fresh take in a crowded field
- **Technical excellence:** Clean probe orchestration, Qodo review trail, reliability
- **TrueForge showcase:** GitHub MCP (clone/analyze repos), sandboxed probes, approval gate (filing GitHub issue), subagents, session resilience
- **Control/safety:** Approval pause before **irreversible public action** (filing security report) — strongest possible moment
- **Presentation:** Probe fires, vulnerability confirmed, agent freezes, you approve filing—dramatic & clear

## MVP Scope (Hackathon Week)
### Must-have
- GitHub MCP (clone target MCP server repo, analyze code/schema)
- Static analysis (AST + rules inspection—reuse internal security scanner)
- Parallel subagents (static probe, injection probe, schema probe)
- Sandboxed dynamic probes (TrueForge sandbox runs 3–4 probe templates against target MCP)
- Agent judgment loop (synthesize findings, assign risk level, draft verdict)
- Approval gate (agent drafts GitHub security issue, waits for human approval, files on approval)
- Session persistence (survives browser refresh)
- Demo runs in the TrueForge chat UI (bundled with the harness); SDK available for automation

### Nice-to-have (post-MVP)
- Multiple target MCP servers in parallel (subagent delegation)
- Automated remediation (auto-block high-risk tools in registry)
- Public scorecard/report (publish audit trail)
- Integration with TrueForge tool registry

## Demo Story (3 min, pre-recorded)
1. **You provide a target MCP repo** (GitHub URL of a vulnerable-but-real MCP server fixture)
2. **Agent clones & analyzes** (GitHub MCP: reads schemas, tool definitions, auth boundaries)
3. **Static probe fires** (detects overpermissioned schema—tool can access all file paths)
4. **Subagent 1 runs injection test** (sandbox probe attempts SQL injection through tool arg)
5. **Subagent 2 checks scope escape** (sandbox probe tries to access parent processes)
6. **Agent synthesizes** ("This tool has 2 HIGH findings: unrestricted file access + injection vector")
7. **Agent drafts** GitHub security issue (title, description, proof-of-concept)
8. **Approval moment** (you review draft; click "file report")
9. **GitHub issue filed** (irreversible, public—shows on maintainer's repo)
10. **Browser refresh** (during step 3–5, you refresh; agent keeps probing—shows TrueForge persistence)

## Non-goals
- Building a new probe suite (reuse the scanner's proven probe templates)
- Auto-patching tools
- Real-time monitoring (one-time audit, not continuous)
- Replacing formal security review
