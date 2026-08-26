# UI Architecture — MCP Vetting Agent

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (SPA)                         │
│                                                         │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────┐   │
│  │ URL Input │→ │ Audit Log │→ │ Findings Table   │   │
│  └───────────┘  └───────────┘  └──────────────────┘   │
│       │                              │                  │
│       │              ┌───────────────┘                  │
│       │              ▼                                  │
│       │     ┌────────────────┐                         │
│       │     │  Draft Issue   │                         │
│       │     │  Panel         │                         │
│       │     └───────┬────────┘                         │
│       │             │                                   │
│       │             ▼                                   │
│  ┌────┴──────────────────────┐                         │
│  │    MCP Client (SDK)       │                         │
│  │    @modelcontextprotocol  │                         │
│  └───────────┬───────────────┘                         │
│              │                                          │
└──────────────┼──────────────────────────────────────────┘
               │ HTTP (streamable transport)
               ▼
┌──────────────────────────────────────────────────────────┐
│         probe_server/server.py  (port 8000)              │
│                                                          │
│  /health ─── GET ─── { status, docker_available }       │
│  /mcp    ─── POST ── MCP streamable-HTTP transport      │
│                                                          │
│  Tools:                                                  │
│    clone_target(url) → { target }                       │
│    static_audit(target_dir) → { findings, summary }    │
│    full_audit(target_dir, allow_degraded?) → { ... }   │
│    read_target_manifest(target_dir) → { manifests }    │
│                                                          │
│  Internally calls:                                       │
│    security-scan <target> --format json [--static-only] │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Data Flow (single audit)

```
User pastes URL
       │
       ▼
UI calls clone_target(url)
       │
       ▼
UI calls read_target_manifest(target)  ─────────────┐
       │                                            │
       ▼                                            │
UI calls static_audit(target)  ←── parallel ───────┤
       │                         with               │
       ▼                         full_audit ────────┘
       │
       ▼
UI receives findings (may arrive incrementally
if the MCP server streams tool results)
       │
       ▼
UI renders findings table + audit log
       │
       ▼
If HIGH/CRITICAL findings: show draft issue panel
       │
       ▼
User clicks "File Issue"
       │
       ▼
UI sends approval confirmation back through MCP
(MCP tool call returns; in TrueForge the approval gate
is native — for standalone UI, the user confirms in-browser
and the filing happens via a separate GitHub API call or
a dedicated MCP tool if one is added)
       │
       ▼
UI shows filed confirmation with GitHub link
```

---

## State Management (Zustand)

One store, one slice:

```typescript
interface AuditState {
  // Connection
  connected: boolean;
  dockerAvailable: boolean;

  // Input
  repoUrl: string;

  // Scan progress
  status: "idle" | "cloning" | "scanning_static" | "scanning_full" |
          "reading_manifest" | "synthesizing" | "awaiting_approval" |
          "filed" | "error";
  targetPath: string | null;

  // Log entries
  log: LogEntry[];

  // Findings
  findings: Finding[];
  summary: { total: number; critical: number; high: number;
             medium: number; low: number } | null;

  // Draft issue
  draftIssue: { title: string; body: string; labels: string[];
                targetRepo: string } | null;

  // Filed result
  filedIssue: { url: string; number: number; repo: string } | null;

  // Error
  error: string | null;
}

interface LogEntry {
  timestamp: number;
  step: string;
  detail: string;
  type: "info" | "success" | "error" | "warning";
}

interface Finding {
  id: string;           // VULN-008
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  owaspCategory: string;
  status: "static" | "dynamic";
  evidence: string;
  remediation: string;
}
```

---

## MCP Client Setup

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const SERVER_URL = "http://127.0.0.1:8000/mcp";

export async function connectToServer(): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL));
  const client = new Client({ name: "mcp-vetting-ui", version: "1.0.0" });
  await client.connect(transport);
  return client;
}
```

---

## Tool Calls from UI

```typescript
// 1. Clone
const cloneResult = await client.callTool({
  name: "clone_target",
  arguments: { repo_url: "https://github.com/hemv-857/mcp-vulnerable-fixture" }
});
// cloneResult.content[0].text → JSON string with { target: "/tmp/vetted-..." }

// 2. Read manifests
const manifestResult = await client.callTool({
  name: "read_target_manifest",
  arguments: { target: targetPath }
});

// 3. Static audit
const staticResult = await client.callTool({
  name: "static_audit",
  arguments: { target_dir: targetPath }
});

// 4. Full audit
const fullResult = await client.callTool({
  name: "full_audit",
  arguments: { target_dir: targetPath, allow_degraded: true }
});
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Server unreachable | Show red banner, disable scan button |
| Tool returns `error` key | Show error entry in log, stop scan |
| MCP connection drops | Auto-reconnect (3 attempts, exponential backoff) |
| Partial results | Show whatever findings arrived, mark scan as incomplete |

---

## File Structure

```
ui/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── src/
│   ├── main.tsx              # React entry
│   ├── App.tsx               # Root component
│   ├── store.ts              # Zustand store
│   ├── mcp.ts                # MCP client singleton
│   ├── types.ts              # TypeScript types
│   ├── components/
│   │   ├── UrlInput.tsx      # URL bar + scan button
│   │   ├── StatusBar.tsx     # Connection/status indicator
│   │   ├── AuditLog.tsx      # Timeline of scan steps
│   │   ├── FindingsTable.tsx # Findings with expand/collapse
│   │   ├── DraftIssue.tsx    # Issue preview + approve/edit
│   │   ├── FiledConfirmation.tsx  # Post-filing result
│   │   └── ErrorBanner.tsx   # Connection/server errors
│   └── lib/
│       ├── scan.ts           # Orchestration: clone → manifest → static → full
│       └── github.ts         # Optional: direct GitHub API for filing issues
```
