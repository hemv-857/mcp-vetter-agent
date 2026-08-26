# Demo Video Script — 3 minutes

Target: one continuous screen recording, narrated live, no cuts except the two marked.
Pre-flight: run the full audit once before recording so results are warm; close all other
tabs; font size up; TrueForge chat UI + a browser tab on the fixture repo side by side.

## Setup (before recording starts)

- Terminal 1: probe server running (`uvicorn probe_server.server:mcp_app --port 8000`)
- Terminal 2: TrueForge (`npx @truefoundry/trueforge@latest`)
- Browser tab A: TrueForge chat, mcp-vetting agent loaded
- Browser tab B: github.com/hemv-857/mcp-vulnerable-fixture (issues page visible)
- Docker running (dynamic probes will fire)

## Script

### [0:00–0:20] The problem
> "Every agent built this week connects to MCP servers nobody has audited — community
> tools with hardcoded keys, eval() on arguments, no auth boundaries. Agents don't know
> to be suspicious. This is **MCP Vetting**: an agent that audits an MCP server BEFORE you
> trust it — and refuses to take the irreversible step without asking."

**On screen:** keep it on the empty chat.

### [0:20–0:35] The cast
> "It runs on TrueForge. The harness gives it subagents, sandboxing, session persistence,
> and native approval gates. We wrote four tools — clone, manifest read, static scan,
> full dynamic scan — wrapped around our scanning engine. The orchestration is the
> agent's instructions plus the harness."

**On screen:** briefly open Tools menu in composer showing connectors + capabilities on.

### [0:35–0:50] Fire
Type: `Audit https://github.com/hemv-857/mcp-vulnerable-fixture`
> "A real GitHub URL. Watch what happens."

### [0:50–1:30] The audit (let it run)
> "First it clones the target onto the probe host — that's our clone tool, https-only,
> shallow, private networks refused. Now look at Agent Steps: it spawned **parallel
> subagents** — static analysis and the full dynamic audit at once. The dynamic probes
> execute the target server inside throwaway Docker containers while reading its
> declared permissions."
>
> **[REFRESH THE BROWSER HERE — mid-probe]**
> "Oh, and I just refreshed the browser mid-audit. Session survived. The harness keeps
> the run alive across reconnects — reconnect and it's still going."

*(This is the moment most teams never film. If the refresh feels risky for the take,
do a separate 10-second clip of it and cut it in at the marked point.)*

### [1:30–2:00] The verdict
> "Eight findings: seven static candidates and — the important one — VULN-008,
> out-of-scope tool execution, **confirmed** by a live probe in isolation. Static says
> 'maybe'; the sandbox proves it. The agent separates the two instead of crying wolf."

**On screen:** verdict table scrolling — HIGH risk, OWASP categories per finding.

### [2:00–2:25] The gate (the money shot)
> "High-risk findings mean a public security report on someone's repository. That is
> irreversible. So the agent drafts it — title, evidence with rule IDs, remediation —
> and stops."

**On screen:** the draft issue in the transcript, then the Allow/Deny card.

> "It cannot file this. Only I can."
Click **Allow**.

### [2:25–2:45] Proof
**Switch to tab B**, refresh the fixture repo's issues page.
> "Filed. Public. Real. The maintainer gets reproducible findings with remediation
> hints — and it happened only because a human approved it."

### [2:45–3:00] Close
> "One command ran the whole loop: clone, parallel probes, verdict, human gate, report.
> That's what an agent harness is for — we wrote the tools; TrueForge made the agent
> trustworthy enough to use them."

## After recording checklist

- [ ] Approval click and GitHub issue both clearly visible (zoom if needed)
- [ ] Refresh-and-resume captured (or cut-in clip inserted)
- [ ] No secrets, keys, or personal data anywhere on screen
- [ ] Upload YouTube (unlisted or public), add link to README
