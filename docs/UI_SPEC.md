# UI Specification — MCP Vetter Agent

## Overview

A single-page web interface for the MCP Vetter Agent. Users paste a GitHub URL,
watch the security audit happen in real time, review findings, approve the draft
security issue, and see it filed — all in one view.

The UI is judged under the hackathon's **Best UI** track:
> "An interface that shows what the agent is doing, what it is waiting on, and
> what it did, and asks before the irreversible step rather than after it."

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | React + Vite | Fast dev, small bundle, no SSR needed |
| Styling | Tailwind CSS | Utility-first, no CSS-in-JS overhead |
| State | Zustand | Minimal, one store for scan state |
| MCP client | `@modelcontextprotocol/sdk` | Official MCP TypeScript client, connects to `http://127.0.0.1:8000/mcp` |
| Backend | None | UI talks directly to the MCP server over HTTP (streamable-HTTP transport) |

No backend server. The UI is a static site that connects to the existing
`probe_server/server.py` on port 8000.

---

## Pages

Single page. No routing.

---

## Layout (wireframe)

```
┌──────────────────────────────────────────────────────────────┐
│  MCP Vetter                                    [status bar]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  GitHub URL: [_______________________________] [Scan]│   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  AUDIT LOG (scrolls)                                 │   │
│  │                                                      │   │
│  │  > Cloning https://github.com/hemv-857/...          │   │
│  │    Cloned to /tmp/vetted-abc123/repo                 │   │
│  │                                                      │   │
│  │  > Reading manifests...                              │   │
│  │    Found: target.yaml, tools.yaml                    │   │
│  │                                                      │   │
│  │  > Running static audit...                           │   │
│  │    VULN-001: eval() on tool args         [HIGH]      │   │
  │  │    VULN-004: Unrestricted file access    [HIGH]      │   │
  │  │    VULN-003: Missing input validation    [MEDIUM]    │   │
│  │    ...                                               │   │
│  │                                                      │   │
│  │  > Running full audit (dynamic probes)...            │   │
│  │    VULN-008: Out-of-scope execution      [CRITICAL]  │   │
│  │    (confirmed in Docker sandbox)                     │   │
│  │                                                      │   │
│  │  > Audit complete.                                   │   │
│  │    Verdict: HIGH RISK (4 findings)                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  FINDINGS TABLE (collapsible per finding)            │   │
│  │                                                      │   │
│  │  ID        Severity   OWASP Category     Status      │   │
│  │  ─────────────────────────────────────────────────── │   │
│  │  VULN-001  HIGH       A3: Injection      Static      │   │
  │  │  VULN-004  HIGH       A1: Excess Perms   Static      │   │
  │  │  VULN-008  CRITICAL   A7: Breakout       Dynamic ✓   │   │
  │  │  VULN-003  MEDIUM     A6: No Validation  Static      │   │
│  │                                                      │   │
│  │  [Expand all]  [Collapse all]                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  DRAFT ISSUE (shown after verdict)                   │   │
│  │                                                      │   │
│  │  Title: Security audit: mcp-vulnerable-fixture       │   │
│  │                                                      │   │
│  │  Body: (markdown preview)                            │   │
│  │  ---                                                 │   │
│  │  ## Vulnerabilities Detected                         │   │
│  │  ...                                                │   │
│  │                                                      │   │
│  │  Labels: security, vulnerability                     │   │
│  │  Target: github.com/hemv-857/mcp-vulnerable-fixture │   │
│  │                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐                 │   │
│  │  │ File Issue   │  │ Edit Draft   │                 │   │
│  │  └──────────────┘  └──────────────┘                 │   │
│  │  ⚠ This action is irreversible and public           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  FILED (shown after approval)                        │   │
│  │                                                      │   │
│  │  ✓ Issue filed: #12 on hemv-857/mcp-vulnerable-fixture│  │
│  │  [View on GitHub →]                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Status Bar

Top-right corner, always visible:

| State | Display |
|-------|---------|
| Idle | `● Disconnected` (grey) |
| Connected | `● Connected` (green) |
| Scanning | `● Scanning...` (pulsing blue) |
| Awaiting approval | `● Awaiting approval` (amber, pulsing) |
| Filed | `● Done` (green) |

---

## Audit Log

A vertical timeline that appends entries as the scan progresses. Each entry has:
- **Timestamp** (relative: "2s ago")
- **Step label** ("Cloning", "Static audit", "Full audit", "Synthesizing")
- **Detail line** (plain text or finding summary)

The log auto-scrolls to bottom during scan. User can scroll up to review.
After scan completes, the log is a static record.

---

## Findings Table

Columns:
- **ID**: Rule ID (e.g., VULN-008)
- **Severity**: Color-coded badge (CRITICAL=red, HIGH=orange, MEDIUM=yellow, LOW=blue)
- **OWASP Category**: Mapped category name
- **Status**: `Static` (unconfirmed) or `Dynamic ✓` (confirmed by live probe)

Each row expands to show:
- **Evidence**: What the probe found (raw output snippet)
- **Remediation**: Suggested fix
- **Confidence**: "Candidate" (static only) or "Confirmed" (dynamic)

---

## Draft Issue Panel

Visible only after audit completes with HIGH/CRITICAL findings.

- **Title**: Editable text field
- **Body**: Markdown preview (rendered from markdown)
- **Labels**: Read-only chips
- **Target repo**: Read-only, derived from the scanned URL

Buttons:
- **File Issue** (primary, destructive color): Sends approval request to MCP server
- **Edit Draft** (secondary): Opens title/body in editable form

The "File Issue" button is disabled until the user confirms understanding of
irreversibility (checkbox: "I understand this is public and irreversible").

---

## Filed Confirmation

After approval, shows:
- Green checkmark
- Issue number and repo
- "View on GitHub →" link

---

## Error States

| Error | UI Response |
|-------|-------------|
| MCP server unreachable | Red banner: "Cannot reach probe server at 127.0.0.1:8000. Is it running?" |
| Clone failed | Error entry in log, scan stops, no findings table |
| Scanner error | Error entry in log with stderr snippet |
| Docker unavailable | Warning in log: "Dynamic probes unavailable. Running static only." |
| Timeout | Error entry: "Scan timed out after 300s" |

---

## UX Details

1. **Scan button** is disabled while a scan is running. Shows spinner.
2. **URL input** validates format: must be `https://github.com/owner/repo`
3. **Scan history**: Last 5 URLs stored in localStorage, shown as suggestions
   in a dropdown below the input.
4. **Dark mode**: Tailwind dark class on `<html>`. Toggle in top-right.
5. **Responsive**: Works on mobile (findings table stacks vertically).
6. **Keyboard shortcuts**: `Ctrl+Enter` triggers scan.
