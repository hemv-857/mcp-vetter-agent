import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { STAGE_LABEL, useStore } from "../../store";
import type { Finding, Stage, StageId, StageState } from "../../types";
import { formatDuration, usePrefersReducedMotion, useTicker } from "../../lib/util";
import { Container, Download, FileText, GitMerge, ScanSearch, Send, UserCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BEAT_MS, BEAT_OF, useRevealBeat } from "../../lib/reveal";
import { EASE_OUT } from "../shared/tokens";

/**
 * THE AUDIT GRAPH — the investigation's centrepiece.
 *
 *   ACQUIRE → DECLARATIONS ─┬─ STATIC  ─┬─ SYNTHESIS → REVIEW → FILE
 *                           └─ DYNAMIC ─┘
 *
 * The two lanes never share a visual language until they meet. Static is
 * orthogonal, square, hollow: geometry, because it only read the source.
 * Dynamic is curved, round, filled: behaviour, because it ran the thing. At
 * synthesis the routing braids and both shapes resolve into one.
 *
 * Every node state, count and mote comes from the store. A stage that has not
 * reported is `pending`, and pending looks pending — no timer stands in for
 * work that has not happened.
 */

const VB_W = 1240;
const MID = 150;

interface Node {
  id: StageId;
  x: number;
  y: number;
  shape: "diamond" | "square" | "circle" | "hex";
  channel?: "static" | "dynamic";
}

function layout(): { nodes: Node[]; height: number; spread: number } {
  const spread = 88;
  return {
    spread,
    height: MID * 2,
    nodes: [
      { id: "clone", x: 62, y: MID, shape: "diamond" },
      { id: "manifest", x: 238, y: MID, shape: "diamond" },
      { id: "static", x: 486, y: MID - spread, shape: "square", channel: "static" },
      { id: "dynamic", x: 486, y: MID + spread, shape: "circle", channel: "dynamic" },
      { id: "synthesis", x: 748, y: MID, shape: "hex" },
      { id: "review", x: 942, y: MID, shape: "diamond" },
      { id: "file", x: 1108, y: MID, shape: "diamond" },
    ],
  };
}

/** The graph speaks in short words; STAGE_LABEL is the prose version. */
const SHORT: Record<StageId, string> = {
  clone: "ACQUIRE",
  manifest: "DECLARED",
  static: "STATIC",
  dynamic: "DYNAMIC",
  synthesis: "SYNTHESIS",
  review: "REVIEW",
  file: "FILE",
};

/**
 * One glyph per stage, and the only one — the lanes panel reads this same table.
 * A stage that was a container in the graph and a radio wave in the list was one
 * concept wearing two faces on one page.
 *
 * The icon names the act; the *shape around it* still carries the channel —
 * square/hollow for what was only read, circle/filled for what actually ran. The
 * icon is the label, the silhouette is the argument.
 */
export const STAGE_GLYPH: Record<StageId, LucideIcon> = {
  clone: Download,
  manifest: FileText,
  static: ScanSearch,
  dynamic: Container,
  synthesis: GitMerge,
  review: UserCheck,
  file: Send,
};

/**
 * Stroke weight repeats the product's one rule inside the glyph: reading is
 * tentative, execution is proof. Thin for the lane that only read the source,
 * bold for the lane that ran it.
 */
const GLYPH_WEIGHT: Partial<Record<StageId, number>> = { static: 1.5, dynamic: 2.5 };
const GLYPH_WEIGHT_DEFAULT = 1.9;

const BEAT_S = BEAT_MS / 1000;

const STATE_WORD: Record<StageState, string> = {
  pending: "not started",
  active: "running",
  done: "done",
  skipped: "skipped",
  failed: "failed",
  awaiting: "waiting for you",
};

const CH = {
  static: "var(--color-read)",
  dynamic: "var(--color-ran)",
} as const;

function tone(state: StageState, node: Node): string {
  if (state === "failed") return "var(--color-critical)";
  if (state === "awaiting") return "var(--color-human)";
  if (state === "pending") return "var(--color-t4)";
  if (state === "skipped") return "var(--color-t4)";
  if (node.channel) return CH[node.channel];
  return state === "active" ? "var(--color-read)" : "var(--color-t2)";
}

/** Static routes at right angles. Dynamic curves. The path is the argument. */
function edgePath(from: Node, to: Node, channel?: "static" | "dynamic"): string {
  if (from.y === to.y) return `M${from.x} ${from.y} H${to.x}`;
  if (channel === "static") {
    const bend = from.x + (to.x - from.x) * 0.42;
    return `M${from.x} ${from.y} H${bend - 12} Q${bend} ${from.y} ${bend} ${
      from.y + (to.y > from.y ? 12 : -12)
    } V${to.y + (to.y > from.y ? -12 : 12)} Q${bend} ${to.y} ${bend + 12} ${to.y} H${to.x}`;
  }
  const c = (to.x - from.x) * 0.55;
  return `M${from.x} ${from.y} C${from.x + c} ${from.y} ${to.x - c} ${to.y} ${to.x} ${to.y}`;
}

function NodeGlyph({
  node,
  state,
  r,
  still,
  landing,
  dimmed,
}: {
  node: Node;
  state: StageState;
  r: number;
  still: boolean;
  /** This node is the beat the reveal just landed on. */
  landing: boolean;
  /** The reveal has not reached this node yet: draw the map, not the result. */
  dimmed: boolean;
}) {
  // A stage lights when the payload reaches it, not when its beat opens. The
  // one exception is the first node, which nothing travels to.
  const ignite = landing && node.id !== "clone" ? BEAT_S : 0;
  const Glyph = STAGE_GLYPH[node.id];
  const weight = GLYPH_WEIGHT[node.id] ?? GLYPH_WEIGHT_DEFAULT;
  const c = tone(state, node);
  const live = state === "active" || state === "awaiting";
  const solid = state === "done";
  const dashed = state === "skipped";

  const dormant = state === "pending";
  const common = {
    fill: solid ? c : "var(--color-bg)",
    // A dynamic node that ran reads as genuinely filled — that is the whole
    // claim of the lane, so it gets more than the neutral wash.
    fillOpacity: solid ? (node.channel === "dynamic" ? 0.28 : 0.13) : 1,
    stroke: c,
    strokeWidth: live ? 2.5 : 1.95,
    strokeDasharray: dashed ? "3 3" : undefined,
  };

  const glyph =
    node.shape === "circle" ? (
      <circle cx={node.x} cy={node.y} r={r} {...common} />
    ) : node.shape === "square" ? (
      <rect x={node.x - r} y={node.y - r} width={r * 2} height={r * 2} rx="2" {...common} />
    ) : node.shape === "hex" ? (
      <polygon
        points={Array.from({ length: 6 }, (_, i) => {
          const a = (Math.PI / 3) * i - Math.PI / 2;
          return `${node.x + r * 1.12 * Math.cos(a)},${node.y + r * 1.12 * Math.sin(a)}`;
        }).join(" ")}
        {...common}
      />
    ) : (
      <polygon
        points={`${node.x},${node.y - r * 1.15} ${node.x + r * 1.15},${node.y} ${node.x},${
          node.y + r * 1.15
        } ${node.x - r * 1.15},${node.y}`}
        {...common}
      />
    );

  return (
    <motion.g
      animate={{ opacity: dimmed ? 0.14 : dormant ? 0.5 : 1 }}
      transition={{ duration: 0.42, ease: EASE_OUT, delay: ignite }}
    >
      {/* a live node breathes; a settled one does not */}
      {/* SMIL, not motion: the SVG `r` attribute is not a motion value, and a
          declarative animation runs off the main thread while the audit works.
          SMIL ignores the CSS reduced-motion override, so it is gated here. */}
      {live ? (
        <circle
          className="keep-motion"
          cx={node.x}
          cy={node.y}
          r={still ? r * 1.5 : r}
          fill="none"
          stroke={c}
          strokeWidth="1"
          opacity={still ? 0.3 : 0}
        >
          {still ? null : (
            <>
              <animate
                attributeName="r"
                values={`${r};${r * 1.9}`}
                dur="2.1s"
                calcMode="spline"
                keySplines="0.23 1 0.32 1"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.55;0"
                dur="2.1s"
                repeatCount="indefinite"
              />
            </>
          )}
        </circle>
      ) : null}

      {/* Arrival: one ring, once, on the beat this node lands. Keyed so it
          re-fires per reveal instead of animating on every re-render. */}
      {landing && !still ? (
        <motion.circle
          key={`flare-${node.id}`}
          cx={node.x}
          cy={node.y}
          fill="none"
          stroke={c}
          strokeWidth="2"
          initial={{ r, opacity: 0.9 }}
          animate={{ r: r * 2.5, opacity: 0 }}
          transition={{ duration: 0.75, ease: EASE_OUT, delay: ignite }}
        />
      ) : null}

      {glyph}

      {/* The act, named. Sits inside the silhouette, never replacing it. */}
      <motion.g
        transform={`translate(${node.x - 13} ${node.y - 13})`}
        style={{ color: c }}
        animate={{ opacity: dormant ? 0.5 : 0.95 }}
        transition={{ duration: 0.42, ease: EASE_OUT, delay: ignite }}
      >
        <Glyph size={26} strokeWidth={weight} absoluteStrokeWidth />
      </motion.g>
    </motion.g>
  );
}

/**
 * Evidence in transit: one mote per real finding, travelling its own lane's
 * path into synthesis. The count is the data — nothing is emitted that the
 * scanner did not return.
 */
function Motes({
  path,
  findings,
  channel,
  id,
}: {
  path: string;
  findings: Finding[];
  channel: "static" | "dynamic";
  id: string;
}) {
  const reduced = usePrefersReducedMotion();
  if (reduced || findings.length === 0) return null;
  // A lane with 40 candidates should not paint 40 motes; the count is stated in
  // words beside the node and the motes stay legible.
  const shown = findings.slice(0, 12);
  return (
    <g>
      {shown.map((f, i) => (
        <g key={`${id}-${f.id}-${i}`}>
          {channel === "static" ? (
            <rect
              x={-2.4}
              y={-2.4}
              width="4.8"
              height="4.8"
              fill="none"
              stroke={CH.static}
              strokeWidth="1.2"
            >
              <animateMotion
                path={path}
                dur="2.6s"
                begin={`${i * 0.14}s`}
                repeatCount="1"
                fill="freeze"
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                dur="2.6s"
                begin={`${i * 0.14}s`}
                repeatCount="1"
                fill="freeze"
              />
            </rect>
          ) : (
            <circle r="2.6" fill={CH.dynamic}>
              <animateMotion
                path={path}
                dur="2.6s"
                begin={`${i * 0.14}s`}
                repeatCount="1"
                fill="freeze"
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                dur="2.6s"
                begin={`${i * 0.14}s`}
                repeatCount="1"
                fill="freeze"
              />
            </circle>
          )}
        </g>
      ))}
    </g>
  );
}

/** The swimlane titles own the left margin; nothing else may sit in it. */
const LANE_TEXT = { static: "reads the source", dynamic: "runs it sealed" } as const;
/** Measured from the rendered label: Azeret Mono at 11.5px with 0.16em
 *  tracking advances 9.32 user units per character. The old 7.6 estimate ran
 *  the dashed rail underneath the very title it points away from. */
const LANE_CHAR = 9.35;
const LANE_GUTTER = Math.max(...Object.values(LANE_TEXT).map((t) => t.length)) * LANE_CHAR + 18;

/** The drawing area. */
const VB = { x: -4, y: -6, w: VB_W + 8, h: 318 };

export function Graph() {
  const stages = useStore((s) => s.stages);
  const findings = useStore((s) => s.findings);
  const phase = useStore((s) => s.phase);
  const { nodes } = useMemo(() => layout(), []);

  const running = phase === "scanning" || phase === "synthesizing";
  const now = useTicker(running, 200);
  const still = usePrefersReducedMotion();

  // The reveal walks a finished record back out in causal order. While work is
  // genuinely happening the beat is Infinity and none of this gates anything —
  // the graph shows live state, as it always has.
  const beat = useRevealBeat();
  const revealing = Number.isFinite(beat);
  const arrived = (id: StageId): boolean => beat >= BEAT_OF[id];
  const landing = (id: StageId): boolean => beat === BEAT_OF[id];

  const by = (id: StageId): Stage => stages.find((s) => s.id === id)!;
  /** Before its beat a stage reads `pending`, because that is what it was. */
  const shownState = (id: StageId): StageState =>
    revealing && !arrived(id) ? "pending" : by(id).state;
  const at = (id: StageId): Node => nodes.find((n) => n.id === id)!;

  const staticFindings = findings.filter((f) => f.source === "static");
  const dynamicFindings = findings.filter((f) => f.source === "dynamic");

  // Each edge is gated by the stage it arrives at, so an edge draws exactly
  // when its destination lands — that is what makes the walk read as causal.
  const edges: Array<{ from: Node; to: Node; ch?: "static" | "dynamic"; gate: StageId }> = [
    { from: at("clone"), to: at("manifest"), gate: "manifest" },
    { from: at("manifest"), to: at("static"), ch: "static", gate: "static" },
    { from: at("manifest"), to: at("dynamic"), ch: "dynamic", gate: "dynamic" },
    { from: at("static"), to: at("synthesis"), ch: "static", gate: "synthesis" },
    { from: at("dynamic"), to: at("synthesis"), ch: "dynamic", gate: "synthesis" },
    { from: at("synthesis"), to: at("review"), gate: "review" },
    { from: at("review"), to: at("file"), gate: "file" },
  ];

  const r = 23;
  const [hover, setHover] = useState<StageId | null>(null);

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <filter id="g-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* One shot, the whole map. Seven stages and a fork are the argument;
            framing part of them would hide it. */}
        <g>
        {/* Lane titles sit at the left margin of each lane, clear of the
            nodes — a swimlane label, not a caption fighting for the same space. */}
        {(
          [
            ["static", at("static").y, LANE_TEXT.static, CH.static],
            ["dynamic", at("dynamic").y, LANE_TEXT.dynamic, CH.dynamic],
          ] as const
        ).map(([key, y, text, colour]) => (
          <g key={`lane-${key}`}>
            <line
              x1={text.length * LANE_CHAR + 12}
              x2={at(key).x - r - 10}
              y1={y}
              y2={y}
              stroke={colour}
              strokeWidth="1"
              strokeDasharray="1 6"
              opacity={0.22}
            />
            <text
              x={0}
              y={y}
              textAnchor="start"
              dominantBaseline="middle"
              className="num"
              style={{
                fontSize: 11.5,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fill: colour,
                opacity: 0.6,
              }}
            >
              {text}
            </text>
          </g>
        ))}

        {/* ------------------------------------------------------------ edges */}
        {edges.map((e, i) => {
          const d = edgePath(e.from, e.to, e.ch);
          const s = shownState(e.gate);
          // The edge's own channel decides its colour. Reading it off `e.to`
          // silently greyed both lanes on the run into synthesis, because
          // synthesis belongs to neither of them.
          const c = tone(s, e.ch ? { ...e.to, channel: e.ch } : e.to);
          const settled = s === "done" || s === "awaiting";
          const live = s === "active";
          const drawing = landing(e.gate);
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="var(--color-line-2)" strokeWidth="1.6" />
              <motion.path
                d={d}
                fill="none"
                stroke={c}
                strokeWidth={live ? 3 : 2.3}
                strokeLinecap="round"
                initial={false}
                animate={{
                  pathLength: settled || live ? 1 : 0,
                  opacity: drawing ? 1 : settled ? 0.75 : live ? 1 : 0,
                }}
                transition={
                  drawing
                    ? { duration: BEAT_S, ease: "linear" }
                    : { duration: revealing ? 0.42 : 0.75, ease: EASE_OUT }
                }
                style={settled || live || drawing ? { filter: "url(#g-glow)" } : undefined}
              />
              {/* THE PAYLOAD. The target itself, in transit — it leaves one stage,
                  draws the edge under it at exactly its own speed, and its
                  arrival is what ignites the next node. At the fork it becomes
                  two marks, and each takes its lane's shape: a hollow square
                  goes to be read, a filled circle goes to be run. */}
              {drawing && !still ? (
                <g key={`payload-${i}`} className="keep-motion">
                  <g>
                    {e.ch === "static" ? (
                      <rect
                        x="-4.5"
                        y="-4.5"
                        width="9"
                        height="9"
                        fill="var(--color-bg)"
                        stroke={c}
                        strokeWidth="1.8"
                      />
                    ) : e.ch === "dynamic" ? (
                      <circle r="5" fill={c} />
                    ) : (
                      <polygon points="0,-5 5,0 0,5 -5,0" fill={c} />
                    )}
                    {/* a short comet tail, so direction is legible at speed */}
                    <circle r="2.4" fill={c} opacity="0.32" />
                    <animateMotion path={d} dur={`${BEAT_S}s`} repeatCount="1" fill="freeze" />
                    <animate
                      attributeName="opacity"
                      values="0;1;1;1"
                      keyTimes="0;0.1;0.85;1"
                      dur={`${BEAT_S}s`}
                      repeatCount="1"
                      fill="freeze"
                    />
                  </g>
                </g>
              ) : null}

              {/* a running lane carries a travelling pulse — cause, not decoration */}
              {live && !still ? (
                <circle r={e.ch === "static" ? 0 : 3.4} fill={c} className="keep-motion">
                  <animateMotion path={d} dur="1.9s" repeatCount="indefinite" />
                </circle>
              ) : null}
              {live && !still && e.ch === "static" ? (
                <rect
                  x="-3"
                  y="-3"
                  width="6"
                  height="6"
                  fill="none"
                  stroke={c}
                  strokeWidth="1.2"
                  className="keep-motion"
                >
                  <animateMotion path={d} dur="1.9s" repeatCount="indefinite" />
                </rect>
              ) : null}
            </g>
          );
        })}

        {/* --------------------------------------- evidence flowing to synthesis */}
        {shownState("synthesis") !== "pending" ? (
          <>
            <Motes
              id="s"
              channel="static"
              path={edgePath(at("static"), at("synthesis"), "static")}
              findings={staticFindings}
            />
            <Motes
              id="d"
              channel="dynamic"
              path={edgePath(at("dynamic"), at("synthesis"), "dynamic")}
              findings={dynamicFindings}
            />
          </>
        ) : null}

        {/* ------------------------------------------------------------ nodes */}
        {nodes.map((n) => (
          <NodeGlyph
            key={n.id}
            node={n}
            state={shownState(n.id)}
            r={r}
            still={still}
            landing={landing(n.id)}
            dimmed={revealing && !arrived(n.id)}
          />
        ))}

        {/* Pointing at a node says what that stage actually did. Hover-only is
            fine here: the same record is in GraphDescription for assistive tech. */}
        {nodes.map((n) => (
          <circle
            key={`hit-${n.id}`}
            cx={n.x}
            cy={n.y}
            r={34}
            fill="transparent"
            style={{ cursor: "default" }}
            onPointerEnter={() => setHover(n.id)}
            onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
          />
        ))}

        {/* ----------------------------------------------------------- labels */}
        {nodes.map((n) => {
          const stage = { ...by(n.id), state: shownState(n.id) };
          const above = n.y < MID;
          const dy = above ? -(r + 18) : r + 30;
          const c = tone(stage.state, n);
          const elapsed =
            stage.state === "active" && stage.startedAt
              ? formatDuration(now - stage.startedAt)
              : null;
          return (
            // The tooltip's first line is this stage's name, so the short label
            // steps aside rather than being covered by the box that repeats it.
            <g
              key={`l-${n.id}`}
              opacity={hover === n.id ? 0 : 1}
              style={{ transition: "opacity 140ms var(--ease-out)" }}
            >
              <text
                x={n.x}
                y={n.y + dy}
                textAnchor="middle"
                className="num"
                style={{
                  fontSize: 12.5,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  fill:
                    stage.state === "pending"
                      ? "var(--color-t4)"
                      : stage.state === "active" || stage.state === "awaiting"
                        ? c
                        : "var(--color-t2)",
                }}
              >
{SHORT[n.id]}
              </text>
              {stage.note || elapsed ? (
                <text
                  x={n.x}
                  y={n.y + dy + (above ? -17 : 18)}
                  textAnchor="middle"
                  className="num"
                  style={{ fontSize: 12, fill: c, opacity: 0.9 }}
                >
                  {elapsed ?? stage.note}
                </text>
              ) : null}
            </g>
          );
        })}

        {hover
          ? (() => {
              const n = at(hover);
              const stage = by(hover);
              // Always opposite the node's own label — the mid row carries its
              // labels below, so the box goes above them instead of landing on
              // top of the very thing it describes.
              const above = n.y >= MID;
              const lines = [
                STAGE_LABEL[hover],
                STATE_WORD[stage.state],
                stage.note ?? "",
                stage.startedAt && stage.endedAt
                  ? formatDuration(stage.endedAt - stage.startedAt)
                  : "",
              ].filter(Boolean);
              const w = Math.max(...lines.map((l) => l.length)) * 7.9 + 30;
              const h = lines.length * 19 + 16;
              // Clamped to the gutter, not to 0: flush left it landed squarely
              // on the swimlane title for the lane it crosses.
              const x = Math.min(Math.max(n.x - w / 2, LANE_GUTTER), VB_W - w);
              const y = above ? n.y - r - 16 - h : n.y + r + 16;
              return (
                <g pointerEvents="none">
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx="8"
                    fill="var(--color-p2)"
                    stroke="var(--color-line-2)"
                  />
                  {lines.map((line, i) => (
                    <text
                      key={i}
                      x={x + 13}
                      y={y + 26 + i * 19}
                      className="num"
                      style={{
                        fontSize: 12.5,
                        fill: i === 0 ? "var(--color-t1)" : "var(--color-t3)",
                      }}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })()
          : null}

        </g>

      </svg>
    </div>
  );
}

/** The graph's text equivalent. The picture is decorative; this is the record. */
export function GraphDescription() {
  const stages = useStore((s) => s.stages);
  return (
    <ol className="sr-only" aria-label="Audit stages">
      {stages.map((s) => (
        <li key={s.id}>
          {STAGE_LABEL[s.id]}: {s.state}
          {s.note ? ` — ${s.note}` : ""}
        </li>
      ))}
    </ol>
  );
}
