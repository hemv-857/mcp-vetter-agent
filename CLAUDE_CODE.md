# Building MCP Vetter UI with Claude Code

**This document tells Claude Code exactly what to build for the frontend UI.**

The backend (probe server + scanning engine) is already complete. Your job is the web UI.

---

## What Exists Already

```
mcp-vetter-agent/
├── probe_server/
│   ├── __init__.py
│   └── server.py          # MCP server: clone_target, static_audit, full_audit, read_target_manifest
├── fixtures/
│   ├── vulnerable_server/  # Deliberately unsafe MCP server
│   ├── clean_server/       # Hardened MCP server
│   └── LICENSE
├── deploy/
│   └── agent-manifest.json # TrueForge agent spec
├── tests/                  # 21/21 tests passing
├── docs/                   # Architecture, API reference, UI spec, etc.
├── HANDOFF.md              # ← READ THIS FIRST
├── README.md
└── requirements.txt
```

**The probe server runs on `127.0.0.1:8000` and exposes 4 MCP tools over HTTP.**

---

## Step 1: Read HANDOFF.md

```bash
# Start Claude Code in the repo
claude code

# Tell Claude:
"""
Read HANDOFF.md in the repo root. It has everything you need to build the UI.
Also read docs/UI_SPEC.md, docs/API_REFERENCE.md, and docs/UI_ARCHITECTURE.md.
Then build the frontend.
"""
```

---

## Step 2: Scaffold the UI

```bash
# Tell Claude:
"""
Create a ui/ directory at the repo root with a Vite + React + TypeScript + Tailwind project.

Requirements:
- React 18 + Vite
- Tailwind CSS
- Zustand for state management
- @modelcontextprotocol/sdk for MCP client
- TypeScript

Files to create:
ui/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── store.ts          # Zustand store
│   ├── mcp.ts            # MCP client singleton
│   ├── types.ts           # TypeScript types
│   ├── components/
│   │   ├── UrlInput.tsx
│   │   ├── StatusBar.tsx
│   │   ├── AuditLog.tsx
│   │   ├── FindingsTable.tsx
│   │   ├── DraftIssue.tsx
│   │   ├── FiledConfirmation.tsx
│   │   └── ErrorBanner.tsx
│   └── lib/
│       ├── scan.ts        # Orchestration: clone → manifest → static → full
│       └── github.ts      # Optional: direct GitHub API for filing
└── README.md
"""
```

---

## Step 3: Implement MCP Client Connection

```bash
# Tell Claude:
"""
Implement the MCP client connection in ui/src/mcp.ts:

1. Connect to http://127.0.0.1:8000/mcp using StreamableHTTPClientTransport
2. Export a singleton client
3. On mount, check /health endpoint (GET http://127.0.0.1:8000/health)
4. Show error banner if server unreachable

The MCP server exposes these tools:
- clone_target(repo_url) → { target: "/tmp/vetted-..." }
- static_audit(target_dir) → { findings: [...], summary: {...} }
- full_audit(target_dir, allow_degraded?) → { findings: [...], summary: {...} }
- read_target_manifest(target_dir) → { manifests: {...} }

All tools return JSON dicts. Errors have an "error" key.
"""
```

---

## Step 4: Implement Zustand Store

```bash
# Tell Claude:
"""
Implement ui/src/store.ts with this exact interface:

interface AuditState {
  connected: boolean;
  dockerAvailable: boolean;
  repoUrl: string;
  status: "idle" | "cloning" | "scanning_static" | "scanning_full" |
          "reading_manifest" | "synthesizing" | "awaiting_approval" |
          "filed" | "error";
  targetPath: string | null;
  log: LogEntry[];
  findings: Finding[];
  summary: { total: number; critical: number; high: number;
             medium: number; low: number } | null;
  draftIssue: { title: string; body: string; labels: string[];
                targetRepo: string } | null;
  filedIssue: { url: string; number: number; repo: string } | null;
  error: string | null;
}

interface LogEntry {
  timestamp: number;
  step: string;
  detail: string;
  type: "info" | "success" | "error" | "warning";
}

interface Finding {
  id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  owaspCategory: string;
  status: "static" | "dynamic";
  evidence: string;
  remediation: string;
}
"""
```

---

## Step 5: Implement Scan Orchestration

```bash
# Tell Claude:
"""
Implement ui/src/lib/scan.ts with the full audit flow:

1. clone_target(url) → get target path, log it
2. read_target_manifest(target) → log manifests found
3. static_audit(target) ← parallel with → full_audit(target, allow_degraded=true)
4. Merge findings from both scans
5. Compute summary (total, critical, high, medium, low)
6. If any HIGH/CRITICAL findings: generate draft issue
7. Show draft, await user approval

Each step appends to the audit log. Steps 3 runs in parallel.
"""
```

---

## Step 6: Build All Components

```bash
# Tell Claude:
"""
Build all 7 components per the wireframe in docs/UI_SPEC.md:

1. UrlInput - GitHub URL text field + Scan button (disabled while scanning)
2. StatusBar - Connection indicator (top-right, color-coded)
3. AuditLog - Vertical timeline with timestamps, auto-scrolls
4. FindingsTable - Sortable table, expandable rows, color-coded severity badges
5. DraftIssue - Markdown preview of draft issue + approve/edit buttons + irreversibility checkbox
6. FiledConfirmation - Green checkmark, issue number, GitHub link
7. ErrorBanner - Red banner for server errors

Layout matches the wireframe in docs/UI_SPEC.md exactly.
"""
```

---

## Step 7: Add Dark Mode & Polish

```bash
# Tell Claude:
"""
Add dark mode toggle (Tailwind dark class on html element).
Add keyboard shortcut: Ctrl+Enter triggers scan.
Store last 5 scanned URLs in localStorage for suggestions.
Make responsive (findings table stacks on mobile).
"""
```

---

## Step 8: Add Issue Filing Tool to Backend

```bash
# Tell Claude:
"""
Add a file_github_issue tool to probe_server/server.py:

@mcp.tool(
    annotations={"readOnlyHint": False, "title": "File GitHub security issue"},
)
async def file_github_issue(
    repo_url: str,
    title: str,
    body: str,
    labels: list[str] | None = None,
) -> dict[str, Any]:
    # Parse owner/repo from URL
    # POST to GitHub API using GITHUB_TOKEN env var
    # Return { url, number } on success
    # Return { error } on failure

Also add httpx to requirements.txt if not present.
"""
```

---

## Step 9: Test Against Fixture

```bash
# Tell Claude:
"""
Test the full flow against the vulnerable fixture:
1. Make sure probe server is running on port 8000
2. Open the UI at http://localhost:5173
3. Enter: https://github.com/hemv-857/mcp-vulnerable-fixture
4. Click Scan
5. Verify: audit log populates, findings table shows 7-8 findings
6. Verify: draft issue panel appears with HIGH/CRITICAL findings
7. Verify: clicking File Issue (with approval checkbox) works

If any step fails, fix the issue and re-test.
"""
```

---

## What Claude Should NOT Do

- Don't create a backend server — the UI talks directly to the probe server via MCP
- Don't use Next.js or SSR — pure static SPA
- Don't add unnecessary state management libraries — Zustand is enough
- Don't create mock data — test against the real probe server
- Don't skip error handling — every MCP call can fail
- Don't add comments unless asked

---

## Key Constraints

1. The probe server must be running on port 8000 before the UI can work
2. MCP tool responses come as JSON strings in `result.content[0].text`
3. The scanner's internal Python module name is baked into the installed package — don't change it
4. Fixture YAML files: `target.yaml`, `permissions.yaml`, `tools.yaml` (not named after any external project)
5. Rule IDs are VULN-001 through VULN-011
6. No API keys should be hardcoded in the UI
7. The UI should check `/health` on mount and show an error if the server is down

---

## Running Everything

```bash
# Terminal 1: Probe server
cd /Users/hemang/mcp-vetter-agent
source .venv/bin/activate
uvicorn probe_server.server:mcp_app --host 127.0.0.1 --port 8000

# Terminal 2: UI dev server
cd /Users/hemang/mcp-vetter-agent/ui
npm install
npm run dev
# Opens at http://localhost:5173
```

---

## Reference Files

| File | What It Contains |
|------|-----------------|
| `HANDOFF.md` | Master handoff doc — read first |
| `docs/UI_SPEC.md` | Full UI specification with wireframe |
| `docs/API_REFERENCE.md` | All MCP tool schemas |
| `docs/UI_ARCHITECTURE.md` | Data flow, state shape, file structure |
| `probe_server/server.py` | Backend (322 lines) |
| `deploy/agent-manifest.json` | TrueForge agent spec |
| `fixtures/vulnerable_server/` | Test target (expects HIGH/CRITICAL findings) |

---

**Goal:** Build a clean, working UI that shows the audit in real time, presents findings clearly, and asks before the irreversible step. Ship it.
