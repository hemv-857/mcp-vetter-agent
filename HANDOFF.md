# HANDOFF — Build the MCP Vetting UI

**Read this first.** Everything you need to build the frontend is in this
directory (`docs/`) or referenced below.

---

## What This Project Is

MCP Vetting Agent — a security auditor for MCP (Model Context Protocol) servers.
It runs on TrueForge. A user gives it a GitHub URL of an MCP server, it clones
the repo, runs static + dynamic security scans, shows findings, and (if HIGH/CRITICAL)
drafts a GitHub security issue. The user approves before it's filed.

**Your job:** Build the web UI that lets a user drive this flow without the
TrueForge chat interface. The backend (probe server) already works.

---

## Project Status

| Component | Status |
|-----------|--------|
| Probe server (backend) | ✅ Done, 21/21 tests passing |
| MCP tools (clone, static, full, manifest) | ✅ Done |
| TrueForge agent spec | ✅ Done (`deploy/agent-manifest.json`) |
| Qodo review trail | ✅ Done (PR #1 merged) |
| Demo script | ✅ Done (`docs/demo_script.md`) |
| **Frontend UI** | **← You build this** |

---

## Architecture (30 seconds)

```
Browser (React SPA)
    │
    │ MCP streamable-HTTP transport
    ▼
probe_server/server.py  (port 8000)
    │
    │ calls CLI
    ▼
security-scan <target> --format json
```

No separate backend server. The UI talks directly to the existing MCP server
over HTTP.

---

## Read These Docs (in order)

1. **`docs/UI_SPEC.md`** — Full UI requirements, wireframe layout, all components,
   error states, UX details. This is your spec.

2. **`docs/API_REFERENCE.md`** — Every MCP tool's parameters, response shapes,
   error cases, and the call sequence. This is your API contract.

3. **`docs/UI_ARCHITECTURE.md`** — Data flow, state management (Zustand store
   shape), MCP client setup, file structure. This is your architecture.

4. **`docs/architecture.md`** — Full system architecture (includes backend
   context you may need to understand constraints).

---

## Tech Stack (non-negotiable)

| Layer | Choice |
|-------|--------|
| Framework | React 18 + Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| MCP client | `@modelcontextprotocol/sdk` (TypeScript) |
| Language | TypeScript |

No Next.js, no SSR, no backend-for-frontend. Pure static SPA.

---

## What to Build

Create a `ui/` directory at the repo root with a Vite + React + Tailwind project.

### Components

| Component | Purpose |
|-----------|---------|
| `UrlInput` | GitHub URL text field + Scan button |
| `StatusBar` | Connection indicator (top-right) |
| `AuditLog` | Vertical timeline of scan steps |
| `FindingsTable` | Sortable table with expandable rows |
| `DraftIssue` | Markdown preview of draft issue + approve/edit buttons |
| `FiledConfirmation` | Post-filing result with GitHub link |
| `ErrorBanner` | Server errors and connection failures |

### State (one Zustand store)

Key fields: `connected`, `status`, `targetPath`, `log[]`, `findings[]`,
`summary`, `draftIssue`, `filedIssue`, `error`. See `UI_ARCHITECTURE.md`
for the full TypeScript interface.

### Scan Orchestration (`lib/scan.ts`)

```
1. clone_target(url) → get target path
2. read_target_manifest(target) → log manifests
3. static_audit(target) ← parallel with → full_audit(target, allow_degraded=true)
4. Merge findings, compute summary
5. If HIGH/CRITICAL: generate draft issue
6. Show draft, await user approval
```

Steps 3 and 4 run in parallel. Each step appends to the audit log.

---

## Key Constraints

1. **MCP server must be running** on `127.0.0.1:8000`. The UI should check
   `/health` on mount and show an error banner if unreachable.

2. **Tool responses come back as JSON strings** inside `result.content[0].text`.
   Parse them client-side.

3. **Filing the issue:** The TrueForge agent uses the native GitHub connector
   for this. For the standalone UI, you have two options:
   - **Option A (simpler):** Add a `file_github_issue` tool to the probe server
     that wraps the GitHub API. This is a new endpoint.
   - **Option B:** Use the GitHub REST API directly from the browser (requires
     a personal access token, which is less ideal for demo).
   - **Recommended: Option A.** The probe server already has Python; adding one
     more tool is trivial. See "Issue Filing" below.

4. **Dark mode:** Tailwind `dark` class on `<html>`. Toggle in the header.

5. **No API keys in the UI.** The probe server handles all auth.

---

## Issue Filing (new tool to add to probe server)

If you choose Option A, add this to `probe_server/server.py`:

```python
@mcp.tool(
    annotations={"readOnlyHint": False, "title": "File GitHub security issue"},
)
async def file_github_issue(
    repo_url: str,
    title: str,
    body: str,
    labels: list[str] | None = None,
) -> dict[str, Any]:
    """File a security issue on a GitHub repository.

    Requires GITHUB_TOKEN env var with repo scope.
    Returns the issue URL on success.
    """
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return {"error": "GITHUB_TOKEN not configured"}

    # Parse owner/repo from URL
    parts = urlsplit(repo_url.strip())
    segments = [s for s in parts.path.split("/") if s]
    if len(segments) < 2:
        return {"error": "Invalid repo URL"}

    owner, repo = segments[0], segments[1]

    # Create issue via GitHub API
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.github.com/repos/{owner}/{repo}/issues",
            json={"title": title, "body": body, "labels": labels or []},
            headers={
                "Authorization": f"token {token}",
                "Accept": "application/vnd.github+json",
            },
            timeout=30,
        )
        if resp.status_code not in (200, 201):
            return {"error": f"GitHub API error: {resp.status_code}", "detail": resp.text[:500]}
        data = resp.json()
        return {"url": data["html_url"], "number": data["number"]}
```

Then in the UI, after user approves the draft:
```typescript
await client.callTool({
  name: "file_github_issue",
  arguments: {
    repo_url: draftIssue.targetRepo,
    title: draftIssue.title,
    body: draftIssue.body,
    labels: draftIssue.labels,
  }
});
```

Add `httpx` to `requirements.txt` if not already there.

---

## Running the UI

```bash
cd ui/
npm install
npm run dev     # Vite dev server, typically http://localhost:5173
```

The probe server must already be running:
```bash
# From repo root:
source .venv/bin/activate
uvicorn probe_server.server:mcp_app --host 127.0.0.1 --port 8000
```

---

## Testing Against Fixtures

| Fixture | Expected Result |
|---------|-----------------|
| `https://github.com/hemv-857/mcp-vulnerable-fixture` | HIGH/CRITICAL risk, 7-8 findings |
| `https://github.com/hemv-857/mcp-clean-fixture` | Clean (if it exists), or LOW risk |

For local testing without GitHub:
```bash
# Clone the fixture manually, then use the local path
# The probe server accepts local paths in target_dir for static_audit/full_audit
```

---

## Deliverables

When you're done, the `ui/` directory should contain:
- `package.json` with all dependencies
- Working Vite + React + Tailwind app
- All 7 components listed above
- Zustand store with the shape from `UI_ARCHITECTURE.md`
- MCP client connecting to `http://127.0.0.1:8000/mcp`
- Dark mode toggle
- Error handling for all cases in `UI_SPEC.md`
- No hardcoded API keys
- README.md in `ui/` explaining how to run

---

## Questions to Resolve Before Starting

1. **Should the UI be production-built and served by the probe server?**
   (i.e., add a `/` static file route to `server.py` so it's one process)
   Or is a separate Vite dev server fine for the demo?

2. **Issue filing tool:** Confirm you're adding `file_github_issue` to the
   probe server (Option A above). If so, the user needs `GITHUB_TOKEN` in
   `.env`. Otherwise, skip filing and just show the draft.

3. **Mobile:** How important is responsive design? The demo is screen-recorded
   on desktop.

---

## Reference Files

| File | What It Contains |
|------|-----------------|
| `probe_server/server.py` | Backend you're building against (322 lines) |
| `deploy/agent-manifest.json` | Agent spec (shows what TrueForge expects) |
| `docs/UI_SPEC.md` | Your full UI specification |
| `docs/API_REFERENCE.md` | API contract for all MCP tools |
| `docs/UI_ARCHITECTURE.md` | Data flow, state shape, file structure |
| `docs/architecture.md` | Full system architecture |
| `docs/demo_script.md` | Demo narrative (for context on what the UI must show) |
| `README.md` | Project overview |
| `requirements.txt` | Backend dependencies |
| `.env.example` | What env vars the backend uses |
