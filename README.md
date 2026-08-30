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

## What the agent does

The MCP Vetting Agent audits third-party MCP servers for security vulnerabilities before anyone connects them to an AI agent. It answers one question: "Is this server safe to trust?"

Given a GitHub URL, the agent clones the repository, reads its declared tools and permissions, then runs two parallel security scans — static analysis (pattern matching for known vulnerability classes) and dynamic analysis (executing the server in isolated Docker containers to observe real behaviour). Findings are mapped to the OWASP Agentic Top 10 and synthesised into a risk verdict: HIGH, MEDIUM, LOW, or CLEAN.

If the verdict is HIGH, the agent drafts a GitHub security issue with per-finding details and remediation hints, then pauses and waits for human approval before filing anything. Nothing irreversible happens without a person saying yes.

## How it uses TrueForge

TrueForge is the agent harness — the runtime layer between the model and the tools it calls. Every part of the audit runs through TrueForge:

| TrueForge feature | How we use it |
| --- | --- |
| **MCP tool connectivity** | The probe server registers as an MCP connector. TrueForge calls `clone_target`, `read_target_manifest`, `static_audit`, `full_audit`, and `file_github_issue` through the harness — not through a wrapper. |
| **Approval gate (HITL)** | `file_github_issue` is annotated `@write`. TrueForge pauses the agent and presents Allow/Deny before the tool executes. The human approves or declines; the agent respects the decision. |
| **Sandbox** | Dynamic probes execute the target MCP server inside throwaway Docker containers. The sandbox is configured in TrueForge's agent manifest (`sandbox.enabled: true`). |

![Docker sandbox proof — container `vetted-audit-1788080269` running during a live audit](docs/docker-sandbox-proof.png)
| **Subagents** | Static and dynamic audits run in parallel as delegated subagent tasks, keeping the main agent context clean. |
| **Session persistence** | The audit session survives browser refreshes and reconnects. If the connection drops mid-audit, the agent continues and the UI reattaches to the running session. |
| **Model flexibility** | Runs on a local Ollama model (`qwen2.5:7b`) — no API key required, no data leaves the machine. |

The harness is doing the real work: reaching tools, running code safely, and stopping for a person before anything irreversible.

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Agent harness** | [TrueForge](https://trueforge.dev) — open-source agent runtime |
| **Probe server** | Python, FastMCP, Starlette, uvicorn |
| **Security scanning** | Custom AST rules (VULN-001..007), Docker-sandboxed dynamic probes (VULN-008..011) |
| **Web console** | React 18, TypeScript, Vite, Tailwind CSS 4, Zustand |
| **MCP protocol** | `@modelcontextprotocol/sdk` (streamable-HTTP transport) |
| **Sandbox** | Docker — throwaway containers for isolated probe execution |
| **Deployment** | Vercel (frontend), Render (probe server) |
| **Code review** | [Qodo](https://www.qodo.ai) — every PR reviewed before merge |
| **Model** | Ollama (`qwen2.5:7b`) — local inference, no data leaves the machine |
| **Version control** | GitHub, conventional commits |

## Quick start

**Deployed services:**
- **Frontend (Vercel):** https://ui-blond-six.vercel.app/
- **Probe server (Render):** https://mcp-vetting-probe.onrender.com

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

## 🎬 Demo

Watch the 3-minute walkthrough:
**[MCP Vetter Agent Demo on YouTube](https://youtube.com/watch?v=rld2-lTAexY)**

See the system in action:
- Parallel security probes running in real-time
- Real vulnerabilities detected with OWASP Agentic Top 10 mapping
- Human approval gate demonstrated (3-second hold before irreversible action)
- GitHub issues filed to real repositories

**Try it yourself:**
- **Live Console:** https://ui-blond-six.vercel.app/
- **Probe Server Health:** https://mcp-vetting-probe.onrender.com/health
- **Test Fixture Repo:** https://github.com/hemv-857/mcp-vetter-fixture-target

Enter the fixture repo URL in the live console to see a real security audit in action.

## AI tooling disclosure

This project was built with the assistance of AI coding assistants (Claude Code, Cursor). All AI-generated code was reviewed, tested, and understood by the contributors before merging.

## Credits

Built for The Agent Harness Hackathon (WeMakeDevs × TrueFoundry, Aug 2026). See `fixtures/LICENSE` for bundled reference-code licensing.
