# Product

## Platform

web

## Stack

Existing codebase. Probe server: Python + FastMCP (`probe_server/server.py`), MCP streamable-HTTP
on `/mcp`, REST `/health`. Console: React 18 + Vite + TypeScript + Tailwind v4 + Zustand +
`@modelcontextprotocol/sdk`, in `ui/`. Static SPA, no backend-for-frontend, no SSR. Fixed by the
user; not open for revision.

## What it is

MCP Vetting audits a third-party MCP (Model Context Protocol) server for security defects
*before* anyone connects an agent to it, then stops and asks a human before filing a public
security report on the maintainer's repository.

## Mechanism

The server **declares** what it can do (`tools.yaml`, `permissions.yaml`). The product checks
what it **actually** does — by reading the source, and by executing it inside a throwaway
container — and reports where the two disagree. Static rules produce *candidates*; only a live
probe produces *confirmed*. The distinction between "declared" and "observed", and between
"suspected" and "proven", is the product's entire claim.

## Primary user and scene

An engineer wiring an agent to third-party tooling, deciding whether a community MCP server is
safe to connect. They arrive suspicious, at a desktop, with the repository URL in the clipboard.
*(Inferred from the brief and README; not user-confirmed.)*

A second, near-term audience: hackathon judges evaluating this on a desktop screen recording.
*(Stated by the user.)*

## Job

Paste a repository URL → understand what was found, how serious it is, and what actually proves
it → decide whether to publish a security report to the maintainer.

## Capabilities (real, from `probe_server/server.py`)

- `clone_target(repo_url)` — shallow clone, https only, private/loopback addresses refused, 120s
- `read_target_manifest(target_dir)` — root `*.yaml`/`*.yml`, symlinks ignored, containment enforced
- `static_audit(target_dir)` — VULN-001..007, 30s budget, no Docker, no model calls
- `full_audit(target_dir, allow_degraded)` — VULN-008..011 in Docker sandbox, 300s budget
- `file_github_issue(repo_url, title, body, labels)` — the only write action; needs `GITHUB_TOKEN`
  in the probe server's environment; never handled by the browser

## Terminology (must not drift)

**Target** the MCP server under audit · **Candidate** a static finding, unproven · **Confirmed** a
finding reproduced by executing the target in isolation · **Verdict** HIGH / MEDIUM / LOW / CLEAN ·
**Lane** the static or dynamic analysis path · **Authorize** the human act of approving the filing.
Findings map to the OWASP Agentic Top 10 and carry rule IDs VULN-001..011.

## Durable constraints

- Real backend only. No mock findings, no simulated progress, no invented telemetry, no fake
  counts. Every visual state is driven by an actual MCP tool result.
- Filing is irreversible and public. The system must never file without an explicit human act.
- Static-vs-dynamic and candidate-vs-confirmed must stay legible; overstating proof is a product
  failure, not a design one.
- Three capabilities degrade and each needs an honest state: the `security_scanner` engine may be
  absent, Docker may be absent, `GITHUB_TOKEN` may be unset. `/health` reports all three.
- Dev replay (`VETTING_DEV_FIXTURES=1`) exists because the scanner engine is an internal package;
  replayed reports carry `sample_data: true` and must be labelled wherever they appear.
- Secrets found in scanned code are redacted, never printed.

## Accessibility

WCAG 2.2 AA is a shipped commitment, not an aspiration: all text ≥4.5:1 on every surface
(dark only; there is no light theme), visible focus, full keyboard operation, reduced-motion support, live regions for async
state. The authorization control must be operable by keyboard.

## Open decisions

- Visual world: settled. Containment and instrumentation — see ui/DESIGN_DIRECTION.md.
- Whether hold-to-authorize keeps a timing-based interaction or gains a typed-confirmation
  alternative for motor accessibility.
