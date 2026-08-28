# MCP Vetting Agent

**An AI security auditor for AI tools.** An agent, running on [TrueForge](https://trueforge.dev), that vets third-party MCP servers for security vulnerabilities *before* you connect them to your agent — then pauses and asks a human before filing a public security report.

> TrueForge connects agents to any MCP server. Community servers are shared as gists, templates, and side projects — with hardcoded keys, `eval()` on tool args, and no auth boundaries. Agents don't know to be suspicious. This agent is the suspicious one.

## How it works

```
User: "audit https://github.com/someone/some-mcp-server"
  └─ TrueForge agent (mcp-vetting)
       ├─ clone_target          ── shallow-clones the GitHub URL onto the probe host
       ├─ read_target_manifest   ── declared tools & permission boundaries
       ├─ subagent: static_audit ── AST rules + pattern matching (VULN-001..007)
       ├─ subagent: full_audit   ── AI review + Docker probes (VULN-008..011)
       ├─ Synthesizes verdict (HIGH/MEDIUM/LOW, OWASP Agentic Top 10 mapped)
       └─ ⏸ PAUSES before filing the GitHub security issue → human approves → files
```

- **Probes run in isolation**: Dynamic probes execute the target server inside throwaway Docker containers.
- **Approval gate is native TrueForge HITL**: issue creation is a write/destructive action, so the harness pauses for Allow/Deny.
- **Sessions survive reconnects**: refresh mid-audit; the agent keeps working.

## Quick start

```bash
# 1. Probe server (the security scanning engine)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn probe_server.server:mcp_app --host 127.0.0.1 --port 8000   # serves /mcp

# 2. TrueForge (separate terminal; needs Node 22+)
npx @truefoundry/trueforge@latest                                   # UI at http://localhost:8790

# 3. In the TrueForge UI:
#    Settings → Models      : configure a provider (API key)
#    Settings → Connectors  : Add MCP Server → http://127.0.0.1:8000/mcp
#                             (+ GitHub connector from the catalog, OAuth)
#    Settings → Sandbox     : optional (skills/code mode); cloning runs on the probe host
#    Create agent           : import deploy/agent-manifest.json via API, or compose in UI

# 4. Chat: "audit ./fixtures/vulnerable_server"
```

Try it against the bundled fixtures first:

| Fixture | Expected |
| --- | --- |
| `fixtures/vulnerable_server` | HIGH risk — `eval()` calculator, unrestricted file reader, poisoned prompt |
| `fixtures/clean_server` | Clean report |

## The console

There are two ways to drive the agent: the TrueForge chat above, or the web
console in `ui/` — a static React SPA that speaks MCP straight to the probe
server, with no backend in between.

```bash
# terminal 1 — the probe server
uvicorn probe_server.server:mcp_app --host 127.0.0.1 --port 8000

# terminal 2 — the console
cd ui && npm install && npm run dev     # http://localhost:5173
```

The console presents the audit as a live graph with two lanes: reading the source
and running it sealed in a container keep separate visual languages and only
merge at synthesis, because a defect is fact only where both agree. It shows what the agent is doing, what it is waiting on, and
what it did — and asks before the irreversible step rather than after it. Filing goes through
`file_github_issue` on the probe server, which reads `GITHUB_TOKEN` from its own
environment; the browser never handles a credential.

If the `security_scanner` engine is not installed, start the probe server with
`VETTING_DEV_FIXTURES=1` to replay a captured report. Replayed reports are
tagged `sample_data: true` and the console labels them everywhere they appear.

See `ui/README.md` for the architecture and `ui/DESIGN_DIRECTION.md` for the
locked visual direction.

## Repository layout

```
probe_server/    MCP server exposing the scanning engine as agent tools
ui/              Web console (React + Vite + Tailwind + Zustand + MCP SDK)
fixtures/        Vulnerable + hardened reference MCP servers
deploy/          TrueForge agent manifest (agent spec via API)
docs/            PRD, architecture, week plan, setup guide
```

## Qodo Code Review Evidence

Every substantive change in this repository went through a pull request reviewed by [Qodo](https://www.qodo.ai) before merge — starting from the first day of the hackathon.

**Representative reviewed PR:** [#1 — feat: probe server, fixtures, tests, TrueForge agent spec](https://github.com/hemv-857/mcp-vetter-agent/pull/1)

**What Qodo surfaced and what we did about it** (full trail visible on the PR):

| Round | Findings | Outcome |
| --- | --- | --- |
| Initial review | 2 High, 5 Medium | Fixed: added `clone_target` tool so GitHub targets are materialized on the probe host instead of an unreachable sandbox path (High); symlink + containment hardening in manifest reads to stop host-file disclosure while auditing malicious repos (High); process-group kill + reap on scan timeouts; structured error dicts at every boundary; async Docker preflight |
| Re-review of fixes | 3 High, 1 Medium | Fixed: standard GitHub URLs without `.git` were wrongly rejected; clone timeouts left orphaned git processes; private-network (SSRF) targets refused; stale temp clones swept off-thread |
| Third pass | 3 Medium | Fixed: malformed URLs return error dicts instead of raising; cancellation reaps the clone process tree; all cleanup moved off the event loop |
| Final pass | **0 findings** | Clean |

**One finding was dismissed with a recorded reason:** the clean fixture's zero-value integrity digest ([comment on the PR](https://github.com/hemv-857/mcp-vetter-agent/pull/1#issuecomment-5421705111)) — it ships that way upstream, and the code path involved is never exercised by our tools, so we kept our fixtures identical to upstream rather than forking them.

The PR history shows each review, the commits addressing its findings, and follow-up reviews confirming resolution against the final code.

## Demo

<!-- TODO(day 5): 3-minute video link -->

## Credits

Built for The Agent Harness Hackathon (WeMakeDevs × TrueFoundry, Aug 2026). See `fixtures/LICENSE` for bundled reference-code licensing.
