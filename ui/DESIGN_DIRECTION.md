# Design Direction — locked

One direction. Everything built after this note refines it; nothing replaces it.

## The idea

**Containment and instrumentation.**

A third-party MCP server is a specimen. The product seals it inside a boundary and
reads it two ways: one instrument reads its *structure* without running it, the
other *runs* it inside the seal and watches what escapes. Evidence accumulates on
two channels. A defect is fact only where both channels agree. Then the machine
stops, because publishing is not reading.

Everything visual serves that sentence. No photography, no darkroom, no sheets,
no exposures, no case files, no Roman numerals. Those are dead.

## The two channels (the whole visual system)

The strongest thing the product knows is that **reading is not proving**. The
interface encodes that as two distinct visual languages that only merge at
synthesis.

| | STATIC — what the source says | DYNAMIC — what execution proves |
|---|---|---|
| Geometry | orthogonal, right-angle routing | curved bezier routing |
| Node | square, hairline stroke, hollow | circle, filled core, soft halo |
| Motion | ticks and steps, discrete | pulses that travel, continuous |
| Hue | `--read` cool steel blue | `--ran` teal-green |
| Evidence mark | hollow | filled |
| Word | *candidate* | *confirmed* |

At **synthesis** the two lanes braid into one path and both node shapes resolve
into a single diamond. That convergence is the best motion moment in the product
and must stay that way.

Never let a candidate render as confidently as a confirmed finding. That rule
outranks every aesthetic rule below it.

## Palette — dark only

No light theme. No toggle. The ground is a deep petrol graphite, not black, not
neon cyber.

- `--bg` `oklch(11.8% 0.008 263)` — the stage (hue re-measured off the plasma
  layer behind the app; the neutrals follow the atmosphere, the seven do not)
- `--panel-1..3` — three raised surfaces, each +4% L
- `--read` `oklch(78% 0.105 233)` — static channel, declared, structural
- `--ran` `oklch(80% 0.125 172)` — dynamic channel, observed, proven
- `--human` `oklch(76% 0.145 302)` — the approval boundary, *rare on purpose*
- severity: critical `25°` · high `52°` · medium `86°` · low neutral slate

Three identity hues + four severity hues. Nothing else gets colour. If a colour
is not naming one of those seven things, it is grey.

## Composition rules

1. **The viewport is a stage, not a document.** Landing and investigation each own
   one 16:9 screen. Scroll appears only where content genuinely exceeds it
   (findings, report body).
2. **One focal element per state.** Landing: the target input. Investigating: the
   graph. Verdict: the verdict. Review: the authorize control. Everything else
   recedes in luminance.
3. **No wall of cards.** Surfaces are earned: the input, the report preview, and
   the record's panels are contained. The graph, the verdict and its counts are
   open — they sit directly on the stage.
4. **Borders are meaningful.** No habitual `border-t` between sections. Grouping
   comes from spacing, alignment and luminance. A hairline means *this is a
   distinct surface* or *this is the channel seam*.
5. **Left rail / open field.** Copy and controls hold a narrow measure on the
   left; the visual system occupies the open field. Never a centered *body* of
   text. The landing is the one exception and an intentional one: its single
   field is the only thing on that screen, so it sits on the axis of the stage.
6. **Type**: Archivo (variable) for voice, Azeret Mono for anything machine-read —
   paths, rule IDs, counts, evidence. Mono is a semantic, not a texture.
7. **Text is short.** `HUMAN REVIEW REQUIRED`, not a paragraph. Prose only where a
   security decision needs it.

## Depth

Depth comes from luminance layering and one atmospheric light pool, not from drop
shadows. Surfaces get an inner top highlight (`inset 0 1px 0 rgb(255 255 255/.05)`)
and a hairline ring. Shadow is used once — under the target input — to make the
one thing the user must touch feel physically present.

## The atmosphere

*Revised. The original entry here specified a hand-authored CSS-3D containment
lattice and ruled out WebGL. The lattice was built and it read weak — a hairline
cage at low opacity is invisible against a petrol ground. What shipped instead is
recorded here, because a locked note that contradicts the product is worse than a
revised one.*

Two decorative layers, both under the content, neither taking a pointer event:

- **A plasma field** — one WebGL fragment shader, one context for the session,
  no scene graph and no generic icosphere. Its hue is *measured*, not chosen:
  263, the median of the layer itself, so the chrome sits in the same light as
  the ground rather than beside it. Its opacity is bought, not borrowed —
  `--color-t4` is committed to 4.5:1 and the alpha is set at the point where t4
  still holds that at the brightest pixel on screen.
- **Ribbons of light along the pointer** — in the console's own channel hues,
  never the reference's magenta and gold, because in a system where seven hues
  carry meaning a red across the background of a security tool says something
  untrue. `mix-blend-mode: screen`, so the layer can only add light.

Full strength on the landing, where it is the only thing moving; pulled back once
the instrument is on screen, because the graph draws in the same blues and must
win. Under `prefers-reduced-motion` neither layer is dimmed — neither is
downloaded.

The rule the original note was really making still stands: **no ornament may
compete with the instrument, and none may cost the palette its meaning.**

## Motion

`motion` (installed) only. Rules taken from the Emil Kowalski pass:

- Enter/exit: `ease-out` `cubic-bezier(.23,1,.32,1)`. Never `ease-in`.
- On-screen movement/morph: `cubic-bezier(.77,0,.175,1)`.
- UI transitions ≤ 300 ms. Stage transitions may reach 600 ms.
- Never animate from `scale(0)`. Start at `0.96` with opacity.
- Press: `scale(0.97)`, 160 ms. Every pressable thing.
- Slow where the operator decides (hold-to-authorize, 1 s linear); snappy where
  the system responds (release, 180 ms ease-out).
- Stagger 30–60 ms. Never gate content behind a stagger.
- Only `transform`, `opacity`, `filter`. Springs for pointer-driven things only.
- `prefers-reduced-motion`: movement goes, opacity and colour stay. Progress fills
  survive — they are information, not decoration.

## Integrity — outranks everything

- Every node, count, mote, pulse and bar comes from real store state.
- No simulated progress. No invented telemetry. A stage that has not reported is
  `pending`, and pending looks pending.
- Degraded capabilities (no sandbox, no token, no scanner) are stated on the
  chrome and at the graph node that cannot run. Degraded looks *deliberate*.
- `sample_data` is labelled everywhere it appears and can never look like a live
  scan.

## Accessibility

WCAG 2.2 AA. All text ≥ 4.5:1 on its own surface. Visible focus everywhere.
The graph is decorative-with-a-text-equivalent: a visually hidden ordered list
carries the same stages and counts. Authorization is fully keyboard-operable.
Live regions announce phase changes.
