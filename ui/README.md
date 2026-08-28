# MCP Vetting — Security Console

The web interface for the MCP Vetting agent. Point it at an MCP server, watch the
investigation run, read what the server declares against what it actually does,
and decide whether the report gets filed.

The console is a static SPA. It talks directly to `probe_server/server.py` over
the MCP streamable-HTTP transport — there is no backend-for-frontend, no SSR,
and no API key in the browser.

## Run it

The probe server must be running first, from the repository root:

```bash
uvicorn probe_server.server:mcp_app --host 127.0.0.1 --port 8000
```

Then, in this directory:

```bash
npm install && npm run dev
```

The console opens on <http://localhost:5173> and connects to
`http://127.0.0.1:8000/mcp`.

### Pointing at a different probe server

```bash
echo 'VITE_PROBE_ORIGIN=http://127.0.0.1:8010' > .env.local
```

The probe server only accepts browser origins it has been told about. Override
them with `VETTING_ALLOWED_ORIGINS` (comma-separated) if you serve the console
from somewhere other than the Vite dev/preview ports.

## What it needs from the probe server

| Capability | Without it |
| --- | --- |
| `security_scanner` engine installed | `static_audit`/`full_audit` fail; the console shows the real error |
| Docker running | Dynamic probes are skipped; nothing can reach `confirmed`, and the console says so |
| `GITHUB_TOKEN` in the environment | The draft is still produced; filing is disabled with an explanation |

All three degrade to a designed state rather than a broken one. `/health`
reports each, and the console renders what it reports.

### Replay mode

`security_scanner` is an internal package. When it is not installed, start the
probe server with `VETTING_DEV_FIXTURES=1` and the audit tools replay a captured
report instead of scanning. Every replayed report carries `sample_data: true`,
and the console labels it — in the header, on the verdict, and inside the
approval gate. It is off by default and never silent.

## Architecture

```
src/
├── main.tsx            entry
├── App.tsx             shell, stage switching, health polling
├── store.ts            the single Zustand store
├── types.ts
├── lib/
│   ├── mcp.ts          MCP client, reconnect, tool-result unwrapping
│   ├── scan.ts         orchestration: clone → manifest → static ‖ dynamic → synthesis
│   ├── report.ts       report normalisation, merge, summary, verdict
│   ├── draft.ts        builds the GitHub security report
│   └── util.ts
└── components/
    ├── shell/          Chrome (identity, target, capabilities, status), Fault
    ├── landing/        Landing stage, TargetField
    ├── visuals/        Chamber — the landing's CSS-3D containment anchor
    ├── audit/          Graph (the live audit graph), Investigation, Stream
    ├── verdict/        Verdict, evidence strip, severity distribution
    ├── findings/       Findings list and expanding detail
    ├── review/         Review (the human boundary), Outcome, Filed
    └── shared/         tokens, Primitives, Markdown
```

### Orchestration

`runAudit()` in `lib/scan.ts`:

1. `clone_target` — skipped for a local path
2. `read_target_manifest` — context, not a gate; a failure does not stop the scan
3. `static_audit` and `full_audit` **in parallel**
4. Merge (a confirmed finding supersedes the static candidate for the same
   defect), summarise, decide the verdict
5. A CRITICAL or HIGH finding drafts a report and **stops**
6. `file_github_issue` runs only from an explicit, deliberate human action

Every stage transition and log line is driven by a real tool result. No timer
stands in for work, and nothing is simulated.

## Design

The direction is recorded in [DESIGN_DIRECTION.md](./DESIGN_DIRECTION.md) and is
treated as locked. One idea: **containment and instrumentation.**

A third-party MCP server is a specimen. One instrument reads its source without
running it; the other runs it sealed and watches what escapes. Evidence
accumulates on two channels, and a defect is fact only where both agree.

### The two channels

The strongest thing the product knows is that reading is not proving, so the two
lanes keep separate visual languages and only merge at synthesis:

| | STATIC | DYNAMIC |
| --- | --- | --- |
| routing | orthogonal, right angles | curved bezier |
| node | square, hollow | circle, filled core |
| motion | discrete ticks | travelling pulses |
| hue | `--read` steel blue | `--ran` teal |
| word | *candidate* | *confirmed* |

A candidate never renders as confidently as a finding a probe reproduced —
hollow versus filled, everywhere it appears. That rule outranks every aesthetic
rule in the file.

### The stages

**Landing.** A left rail carrying identity, proposition and the target field —
the brightest element in the viewport — against a hexagonal containment chamber
that occupies the open field, bleeding past the right edge. The floor states
what this environment can actually do.

**Investigation.** The audit graph owns the screen while it runs: nodes activate,
lanes carry pulses, elapsed time ticks against the tool's real budget, and one
evidence mote travels per real finding. Below it, the target's declared surface
and the transcript. The moment there is a verdict the graph dims and hands over.

**Verdict.** The word rises out of its own line. Beside it, one mark per finding
— filled means reproduced by execution — and the severity distribution as a
single proportional bar rather than a wall of tiles.

**Findings.** One scannable line each; opening one expands in place into what the
source showed (READ) against what execution showed (RAN), side by side where both
exist.

**Review.** A violet threshold, three consequences stated as facts, the report
itself, and a sustained press rather than a click.

### Colour

Seven hues carry meaning and nothing else does: two channels (`--read`, `--ran`),
one boundary (`--human`), and four severities. Everything else is graphite.
Dark only — there is no light theme and no toggle.

### The chamber

Six hairline panels arranged as a hexagonal prism, capped top and bottom, with a
specimen suspended inside and a plane sweeping through. Built from CSS 3D
transforms rather than Three.js: a dozen GPU-composited layers at zero bundle
cost, and far more art direction than a generic icosphere. The base spin is a CSS
keyframe so it runs off the main thread; only the pointer parallax is spring-
driven in JS, and reduced motion holds it still.

### Motion

Motion for React. `cubic-bezier(0.23, 1, 0.32, 1)` for entrances and exits, never
`ease-in`. Springs only where something should feel physical. Nothing over 300 ms
that a user sees repeatedly. Slow where the operator decides (the 1 s authorize
hold), snappy where the system responds (180 ms release).

Two traps worth recording:

- Motion treats `y` in `animate` as a transform, not an SVG attribute, and does
  not animate the SVG `r` attribute at all — the graph's node pulses are
  declarative SMIL instead, which also runs off the main thread.
- A `motion` entrance whose `initial` is unguarded never completes in a hidden
  tab, because there are no animation frames. Everything with an `initial`
  goes through `useEntrance()`, which renders the final state when the document
  is hidden at mount.

## Accessibility

Every colour carrying text clears WCAG AA on the ground and on all three raised
surfaces, verified by computation rather than by eye. Single `<h1>`, skip link,
one focus treatment, live regions on connection and phase, combobox semantics
with `aria-activedescendant`, and no horizontal overflow at 390 px. The audit
graph is decorative with a visually hidden ordered list carrying the same stages,
states and counts. `prefers-reduced-motion` drops movement and stops every loop
— including the SMIL ones, which CSS cannot reach — while keeping colour, opacity
and progress fills, because those are information.

One known trade-off: hold-to-authorize is timing-based. It is operable by pointer
*or* keyboard and the requirement is announced via `aria-describedby`, but
someone who cannot sustain a ~1 s press has no shorter path. That is deliberate
for an irreversible public action; a typed confirmation is the accessible
substitute if it ever needs one.
