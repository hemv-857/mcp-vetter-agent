# MCP Vetter Agent

**An AI security auditor for AI tools.** An agent, running on [TrueForge](https://trueforge.dev), that vets third-party MCP servers for security vulnerabilities *before* you connect them to your agent — then pauses and asks a human before filing a public security report.

> TrueForge connects agents to any MCP server. Community servers are shared as gists, templates, and side projects — with hardcoded keys, `eval()` on tool args, and no auth boundaries. Agents don't know to be suspicious. This agent is the suspicious one.

## How it works

```
User: "audit https://github.com/someone/some-mcp-server"
  └─ TrueForge agent (mcp-vetter)
       ├─ clone_target          ── shallow-clones the GitHub URL onto the probe host
       ├─ read_target_manifest   ── declared tools & permission boundaries
       ├─ subagent: static_audit ── AST rules + Semgrep (SENT-001..007)
       ├─ subagent: full_audit   ── GPT review + Docker probes (SENT-008..011)
       ├─ Synthesizes verdict (HIGH/MEDIUM/LOW, OWASP Agentic Top 10 mapped)
       └─ ⏸ PAUSES before filing the GitHub security issue → human approves → files
```

- **Probes run in isolation**: Sentinel's dynamic probes execute the target server inside throwaway Docker containers.
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

## Repository layout

```
probe_server/    MCP server exposing the scanning engine as agent tools
fixtures/        Vulnerable + hardened reference MCP servers (from Sentinel, MIT)
deploy/          TrueForge agent manifest (agent spec via API)
docs/            PRD, architecture, week plan, setup guide
```

## Qodo Code Review Evidence

<!-- TODO(day 1): link at least one merged PR reviewed by Qodo, describe what it
     surfaced and what was changed or intentionally dismissed, and show the
     follow-up review against the final code. -->

## Demo

<!-- TODO(day 5): 3-minute video link -->

## Credits

Built for The Agent Harness Hackathon (WeMakeDevs × TrueFoundry, Aug 2026). See `fixtures/LICENSE` for bundled reference-code licensing.
