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

One page, four acts, no router. `Dashboard` owns the whole surface; each act
renders for its own phase and the reader moves between them by scrolling.

```
src/
├── main.tsx            entry — mounts Dashboard
├── store.ts            the single Zustand store
├── types.ts
├── lib/
│   ├── mcp.ts          MCP client, lazy SDK load, reconnect, result unwrapping
│   ├── connection.ts   health polling; never interrupts a running audit
│   ├── scan.ts         orchestration: clone → manifest → static ‖ dynamic → synthesis
│   ├── report.ts       report normalisation, merge, summary, verdict
│   ├── draft.ts        builds the GitHub security report
│   ├── reveal.ts       the walk — replays a finished record in causal order
│   └── util.ts         cn, durations, reduced-motion and entrance gates
└── components/
    ├── soc/            Dashboard (the page), instruments, icons
    ├── shell/          Capabilities, Fault, ShaderBackground, TubesCursor
    ├── landing/        TargetField — the one input
    ├── audit/          Graph and its text equivalent
    ├── review/         Review (the human boundary), Outcome, Filed
    └── shared/         tokens, Primitives, Markdown
```

### The walk

A replayed audit settles in tens of milliseconds, so every stage would reach its
final state inside one frame and the graph would snap. `lib/reveal.ts` walks the
*finished* record back out beat by beat so it can be read — and it never runs
while work is actually happening. During a live scan the beat is `Infinity`,
nothing is gated, and a 300 s Docker probe animates because it genuinely takes
300 s. The walk replays the outcomes the stages reported, `skipped` and `failed`
included; no stage is ever drawn as running that did not run.

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

**Landing.** One proposition and one field, dressed as a terminal window — the
brightest element in the viewport — over the atmosphere. The chrome states what
this environment can actually do before anything is typed into it.

**Investigation.** The audit graph owns the screen while it runs: nodes activate,
lanes carry pulses, elapsed time ticks against the tool's real budget, and one
evidence mote travels per real finding. The moment there is a verdict the band
contracts and hands over.

**Verdict.** The word at full volume, the four counts that produced it, and the
proof gauge — how much of this verdict a probe reproduced, which is the only
honest ratio this product has. There is no health score.

**The record.** Everything the audit saw: the findings table, what the server
declared, the seven lanes with their real timings, and the severity distribution
split filled-versus-hatched by proof.

**Review.** A violet threshold, four consequences stated as facts, the report
itself, and a sustained press rather than a click.

### Colour

Seven hues carry meaning and nothing else does: two channels (`--read`, `--ran`),
one boundary (`--human`), and four severities. Everything else is graphite.
Dark only — there is no light theme and no toggle.

### The atmosphere

Two decorative layers sit under the content and never take a pointer event.
`ShaderBackground` is one WebGL fragment shader for the whole session — a plasma
whose hue was measured, not chosen, at 263 so the chrome sits in the same light
as the ground rather than beside it. `TubesCursor` draws ribbons of light along
the pointer above it, in the console's own channel hues, composited with
`mix-blend-mode: screen` so it can only ever add light to the layer below.

Its opacity is a measurement, not a taste: `--color-t4` is committed to 4.5:1,
and the plasma is set at the alpha where t4 still holds that at the brightest
point on screen. Both layers are gated on `prefers-reduced-motion` — under it
they are not dimmed, they are never downloaded.

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
surfaces, verified by computation rather than by eye. Single `<h1>`,
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
