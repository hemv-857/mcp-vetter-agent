import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion, useInView, useScroll, useTransform } from "motion/react";
import { useStore, STAGE_BUDGET, STAGE_LABEL, STAGE_ORDER } from "../../store";
import type { Finding, Stage, StageId, StageState } from "../../types";
import { Graph, GraphDescription, STAGE_GLYPH } from "../audit/Graph";
import { TargetField } from "../landing/TargetField";
import { Capabilities } from "../shell/Capabilities";
import { Fault } from "../shell/Fault";
import { ShaderBackground } from "../shell/ShaderBackground";
import { TubesCursor } from "../shell/TubesCursor";
import { Review } from "../review/Review";
import { Outcome } from "../review/Outcome";
import { Filed } from "../review/Filed";
import { ApprovalGate } from "../shared/ApprovalGate";
import { ConfidenceMark, Mark, SeverityTag } from "../shared/Primitives";
import { CHANNEL_COLOR, EASE_OUT } from "../shared/tokens";
import { ProofGauge, SeverityBars, useCountUp } from "./instruments";
import { Icon, type IconName } from "./icons";
import { repoSlug } from "../../lib/draft";
import {
  cn,
  clockTime,
  formatDuration,
  useMotionOk,
  usePrefersReducedMotion,
  useTicker,
} from "../../lib/util";
import { useProbeConnection } from "../../lib/connection";
import { getPersistedSession } from "../../store";
import { resumeAudit } from "../../lib/scan";
import {
  HOLD_MS,
  useRevealComplete,
  useRevealDriver,
  useValuesReady,
} from "../../lib/reveal";

/* ---------------------------------------------------------------------------
   Controls
   ------------------------------------------------------------------------ */

/**
 * The one button in the console. Hover lift and the sliding chevron are CSS
 * transitions, not motion values — Tailwind's `hover:` only applies on devices
 * that actually hover, so a touch tap never inherits a stuck hover state.
 */
function Action({
  children,
  onClick,
  icon,
  tone = "quiet",
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon?: IconName;
  tone?: "loud" | "quiet";
}) {
  const loud = tone === "loud";
  // The environment is blue now — plasma at hue 263, tube lights at #6dc3f0,
  // which is --color-read itself. A teal control on top of that read as a
  // leftover from a different palette. Only the two *decorative* uses of
  // --color-ran moved: this and the Investigate button. Every other one is
  // load-bearing — the RAN channel in the graph, "confirmed by execution", the
  // clean verdict, the probe-server lamp — and those still mean what they say.
  const hue = "var(--color-read)";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative inline-flex h-12 items-center gap-3 overflow-hidden rounded-xl px-5",
        "text-[13.5px] whitespace-nowrap",
        "transition-[transform,box-shadow,background-color,color] duration-200 ease-[var(--ease-out)]",
        "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.985]",
        // The hover reaction, now that the sheen is gone: the surface itself
        // lifts a step. Filter rather than a second background, so it reads
        // identically on the loud and quiet variants.
        "hover:brightness-[1.18]",
        loud ? "text-t1" : "text-t2 hover:text-t1",
      )}
      style={
        loud
          ? {
              // Opaque, not a translucent wash. Over a shader that is always
              // moving, a see-through control had a different value every
              // frame — the one button that carries the page cannot be
              // legible only some of the time. Hover is the reaction now:
              // one step up in surface, handled by CSS below.
              background: `color-mix(in oklch, ${hue} 22%, var(--color-p1))`,
              boxShadow: `inset 0 1px 0 oklch(100% 0 0 / 0.14), 0 0 0 1px color-mix(in oklch, ${hue} 52%, transparent)`,
            }
          : {
              background: "var(--color-p1)",
              boxShadow:
                "inset 0 1px 0 oklch(100% 0 0 / 0.06), 0 0 0 1px var(--color-line-2)",
            }
      }
    >
      {icon ? (
        <span
          className={cn(
            "relative transition-transform duration-200 ease-[var(--ease-out)] group-hover:scale-110",
            loud ? "" : "text-t3 group-hover:text-t1",
          )}
          style={loud ? { color: hue } : undefined}
        >
          <Icon name={icon} size={16} />
        </span>
      ) : null}

      <span className="relative">{children}</span>

      <span
        aria-hidden="true"
        className={cn(
          "relative translate-x-0 transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-1",
          loud ? "" : "text-t4",
        )}
        style={loud ? { color: hue } : undefined}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path
            d="M3 7h8m0 0L7.6 3.6M11 7l-3.4 3.4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Shells
   ------------------------------------------------------------------------ */

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("surface rounded-2xl", className)}>{children}</section>;
}

function PanelHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium tracking-[-0.01em] text-t1">{title}</h2>
        {sub && <p className="mt-1 truncate text-[11.5px] text-t4">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex shrink-0 rounded-md px-2 py-[3px] text-[11px] font-medium"
      style={{ color, background: `color-mix(in oklch, ${color} 14%, transparent)` }}
    >
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-6 text-[12.5px] leading-[1.6] text-t4">{children}</p>;
}

/** Values arrive only after the graph has finished walking the analysis. */
function Values({ className, children }: { className?: string; children: React.ReactNode }) {
  const ready = useValuesReady();
  const still = !useMotionOk();
  return (
    <motion.div
      className={className}
      // Invisible has to mean unreachable too: at opacity 0 these controls were
      // still in the tab order, so a keyboard reader could land on a button
      // nobody can see while the walk is still running.
      {...(ready ? {} : { inert: "" })}
      initial={false}
      animate={{
        opacity: ready ? 1 : 0,
        transform: ready || still ? "translateY(0px)" : "translateY(6px)",
      }}
      transition={{ duration: still ? 0 : 0.45, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px -6% 0px" });
  const still = !useMotionOk();
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: still ? 1 : 0, transform: still ? "none" : "translateY(22px)" }}
      animate={inView || still ? { opacity: 1, transform: "translateY(0px)" } : {}}
      transition={{ duration: still ? 0 : 0.5, ease: EASE_OUT, delay: still ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
   Real vocabulary
   ------------------------------------------------------------------------ */

const STATE_TONE: Record<StageState, string> = {
  pending: "var(--color-t4)",
  active: "var(--color-ran)",
  done: "var(--color-ran)",
  skipped: "var(--color-t4)",
  failed: "var(--color-critical)",
  awaiting: "var(--color-human)",
};

/**
 * `colour` is the verdict's own severity and still types the word itself.
 * `glow` is the wash behind it, and it answers one question only — is this the
 * one verdict that must stop you. Red there, the site's blue everywhere else,
 * so the alarm means something by being rare rather than by being loud.
 */
const VERDICT_COPY: Record<
  string,
  { word: string; line: string; colour: string; glow: string }
> = {
  HIGH: {
    word: "High risk",
    line: "Do not connect an agent to this server.",
    colour: "var(--color-critical)",
    glow: "var(--color-critical)",
  },
  MEDIUM: {
    word: "Medium risk",
    line: "Connect only with the findings below understood.",
    colour: "var(--color-medium)",
    glow: "var(--color-read)",
  },
  LOW: {
    word: "Low risk",
    line: "Minor defects. Nothing warrants a public report.",
    colour: "var(--color-low)",
    glow: "var(--color-read)",
  },
  CLEAN: {
    word: "Clean",
    line: "No rule fired and no probe reproduced anything.",
    colour: "var(--color-ran)",
    glow: "var(--color-read)",
  },
  DEGRADED: {
    word: "Degraded",
    line: "Only the source was read. No probe ran, so a clean result proves nothing.",
    colour: "var(--color-medium)",
    glow: "var(--color-read)",
  },
};

const PHASE_LINE: Record<string, string> = {
  scanning: "Reading the source, and running it sealed in a container.",
  synthesizing: "Merging both lanes — a defect is fact only where they agree.",
  awaiting_approval: "Stopped. Publishing a public report needs your authorization.",
  filing: "Filing the report.",
  filed: "Report filed.",
  complete: "Audit complete.",
  error: "The audit stopped.",
};

/**
 * How long the audit actually took. Once settled this freezes at the last
 * stage's own end time — measuring against `Date.now()` every render reports
 * how long the reader has been looking at the page, which for a 50ms replay
 * reads as several seconds. That is a fabricated number, not a slow one.
 */
function useElapsed(): string | null {
  const startedAt = useStore((s) => s.scanStartedAt);
  const stages = useStore((s) => s.stages);
  const phase = useStore((s) => s.phase);
  const running = phase === "scanning" || phase === "synthesizing";
  const now = useTicker(running, 200);

  if (startedAt === null) return null;
  const lastEnd = stages.reduce((max, stage) => Math.max(max, stage.endedAt ?? 0), 0);
  const end = running ? now : lastEnd > 0 ? lastEnd : now;
  return formatDuration(Math.max(0, end - startedAt));
}

/* ---------------------------------------------------------------------------
   Page furniture
   ------------------------------------------------------------------------ */

function BackgroundField() {
  const { scrollYProgress } = useScroll();
  const still = !useMotionOk();
  const drift = useTransform(scrollYProgress, [0, 1], still ? [0, 0] : [0, -120]);
  return (
    <motion.div
      aria-hidden="true"
      // -140px, not -10%. The overscan has to exceed the parallax or the
      // layer's own bottom edge scrolls into view: drift reaches -120px, while
      // -10% is only ~98px on a 982px viewport and less on anything shorter,
      // which left a strip of bare ground at the foot of the page. A fixed
      // inset is the one that holds at every viewport height.
      className="pointer-events-none fixed inset-[-140px] z-0"
      style={{ y: drift }}
    >
      {/* One WebGL context for the whole session, and it sits here rather than
          in any one act because this layer already spans all of them.

          The opacity is measured, not chosen, and it is low because there is
          almost nothing left to spend. --color-t4 is the dimmest token here and
          index.css commits it to 4.5:1; on bare ground under the pools above it
          already measures 4.80:1, so the entire budget for adding light to the
          background is 0.30 of contrast ratio. The plasma peaks at 0.127
          relative luminance against a ground of 0.0017, and t4 crosses 4.5:1 at
          alpha 0.026 — so the budget was bought rather than borrowed. The three
          radial pools that used to sit here are gone: they lay directly on the
          ground where body text is read, and the plasma now does the job they
          were added for. That one removal took the ceiling from 0.026 to 0.197,
          and halving body::before took it to 0.238. 0.22 is that, with margin —
          t4 holds 4.5:1, t3 5.6:1, t1 14.4:1 at the worst point on screen. */}
      <ShaderBackground className="absolute inset-0 opacity-[0.15]" />
    </motion.div>
  );
}

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left"
      style={{
        scaleX: scrollYProgress,
        background: "linear-gradient(to right, var(--color-read), var(--color-ran))",
      }}
    />
  );
}

function TopBar() {
  const connection = useStore((s) => s.connection);
  const repoUrl = useStore((s) => s.repoUrl);
  const sampleData = useStore((s) => s.sampleData);
  const phase = useStore((s) => s.phase);
  const live = connection === "connected";

  return (
    <div
      className="sticky top-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line px-5 py-3.5 sm:px-8"
      style={{
        background: "color-mix(in oklch, var(--color-bg) 78%, transparent)",
        backdropFilter: "blur(14px)",
      }}
    >
      {/* `layout` on each sibling: inserting the target chip mid-row otherwise
          shunts the logo and the readouts sideways in a single frame. */}
      <motion.span layout className="flex items-center gap-2.5 text-t1">
        <span className="text-read">
          <Mark size={20} />
        </span>
        <span className="text-[13.5px] font-medium tracking-[-0.01em]">MCP Vetting</span>
      </motion.span>

      <AnimatePresence>
        {phase !== "idle" && repoUrl ? (
          <motion.span
            key="target"
            layout
            initial={{ opacity: 0, filter: "blur(4px)", transform: "translateY(-8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)", transform: "translateY(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)", transform: "translateY(-8px)" }}
            transition={{ duration: 0.42, ease: EASE_OUT }}
            // Capped, and capped harder on a phone: at full width the sample
            // chip was pushed onto a row of its own, and the chrome ate a
            // quarter of the viewport before the verdict got any of it.
            className="num flex min-w-0 max-w-[62%] items-center gap-2 rounded-xl bg-p1 px-3 py-2 text-[12px] ring-1 ring-line sm:max-w-[38ch]"
          >
            <span className="label shrink-0">Target</span>
            <span className="truncate text-t2" title={repoUrl}>
              {repoSlug(repoUrl)}
            </span>
          </motion.span>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sampleData ? (
          <motion.span
            key="sample"
            layout
            initial={{ opacity: 0, transform: "scale(0.94)" }}
            animate={{ opacity: 1, transform: "scale(1)" }}
            exit={{ opacity: 0, transform: "scale(0.94)" }}
            transition={{ duration: 0.36, ease: EASE_OUT, delay: 0.1 }}
            className="label rounded-md px-2 py-1"
            style={{
              color: "var(--color-medium)",
              background: "color-mix(in oklch, var(--color-medium) 14%, transparent)",
            }}
            title="The scanning engine is not installed. This report was replayed from a captured sample, not scanned live."
          >
            sample data
          </motion.span>
        ) : null}
      </AnimatePresence>

      {/* On a phone the readouts take their own row rather than being crushed
          into the end of the title line — squeezed, "probe server ready" broke
          across three lines. */}
      <motion.div
        layout
        className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 sm:w-auto sm:border-0 sm:pt-0 md:ml-auto"
      >
        {/* Never hidden by width. "scanner off" is the difference between
            a live scan and a replayed sample, and a reader who cannot see it
            has been told something untrue by omission. */}
        <Capabilities className="flex-wrap" />
        <span className="flex items-center gap-2 text-[11.5px] whitespace-nowrap text-t3">
          <span
            aria-hidden="true"
            className="block h-[6px] w-[6px] rounded-full"
            style={{
              background: live ? "var(--color-ran)" : "var(--color-high)",
              boxShadow: `0 0 7px ${live ? "var(--color-ran)" : "var(--color-high)"}`,
            }}
          />
          {connection === "connected"
            ? "probe server ready"
            : connection === "connecting"
              ? "connecting"
              : "probe server offline"}
        </span>
      </motion.div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   ACT ZERO — ask for the link, and nothing else
   ------------------------------------------------------------------------ */

function LandingStage() {
  const still = !useMotionOk();
  const step = (delay: number) => ({
    initial: { opacity: still ? 1 : 0, transform: still ? "none" : "translateY(16px)" },
    animate: { opacity: 1, transform: "translateY(0px)" },
    transition: { duration: still ? 0 : 0.5, ease: EASE_OUT, delay: still ? 0 : delay },
  });

  return (
    <motion.section
      key="landing"
      aria-label="Choose a target"
      className="fixed inset-0 z-10 flex items-center justify-center px-6"
      // pointerEvents flips the instant the exit begins: a stalled exit animation
      // must never swallow clicks meant for the instrument underneath it.
      exit={{ opacity: 0, transform: still ? "none" : "translateY(-44px)", pointerEvents: "none" }}
      transition={{ duration: still ? 0 : 0.45, ease: EASE_OUT }}
    >
      <div className="w-full max-w-[760px]">
        <motion.h1
          {...step(0.12)}
          className="text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.06] font-light tracking-[-0.04em] text-t1"
        >
          Paste the repository link.
        </motion.h1>
        <motion.p {...step(0.19)} className="mt-4 max-w-[46ch] text-[15px] leading-[1.6] text-t3">
          Read the source, then run it sealed in a container and compare. A defect is fact only
          where both agree — and nothing is published without you.
        </motion.p>
        <motion.div {...step(0.27)} className="mt-9">
          <TargetField />
        </motion.div>
      </div>
    </motion.section>
  );
}

/* ---------------------------------------------------------------------------
   ACT ONE — the query passing through the instrument
   ------------------------------------------------------------------------ */

function InstrumentSection() {
  const phase = useStore((s) => s.phase);
  const error = useStore((s) => s.error);
  const repoUrl = useStore((s) => s.repoUrl);
  const still = !useMotionOk();
  // The band contracts once there is a verdict to read: the instrument stops
  // being the thing you are watching and becomes the thing you scrolled past.
  const settled = phase !== "scanning" && phase !== "synthesizing";

  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], still ? [1, 1] : [1, 0.94]);
  const fade = useTransform(scrollYProgress, [0, 0.75], still ? [1, 1] : [1, 0.25]);

  return (
    <section
      ref={ref}
      aria-label="Investigation"
      className={cn(
        "relative flex flex-col px-5 pt-10 sm:px-8",
        // A screen tall while the audit is the thing you are watching. Once it
        // has settled the band contracts to ~390px and the rest of that 100svh
        // was empty floor between the drawing and the verdict, which read as a
        // gap rather than as breathing room.
        settled ? "pb-8" : "min-h-[100svh]",
      )}
    >
      {/* Pulled up as the link falls away: one continuous handover, not a swap. */}
      <motion.div
        className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col"
        initial={{ opacity: still ? 1 : 0, transform: still ? "none" : "translateY(54px)" }}
        animate={{ opacity: 1, transform: "translateY(0px)" }}
        transition={{ duration: still ? 0 : 0.72, ease: EASE_OUT, delay: still ? 0 : 0.16 }}
      >
        <div className="max-w-[64ch]">
          <h1 className="num truncate text-[clamp(1.4rem,2.6vw,2.1rem)] leading-[1.1] font-light tracking-[-0.03em] text-t1">
            {repoSlug(repoUrl)}
          </h1>
          {/* The phase line is the only running commentary the audit has, so it
              is also the live region: a reader who cannot see the graph still
              hears the audit move from lane to lane. */}
          <p role="status" aria-live="polite" className="mt-3 text-[14px] leading-[1.6] text-t3">
            {error ?? PHASE_LINE[phase] ?? ""}
          </p>
        </div>

        <motion.div style={{ scale, opacity: fade }} className="mt-6 flex-1">
          <div className={cn("flex h-full items-center", settled ? "" : "min-h-[48vh]")}>
            <div className="w-full">
              <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11.5px] text-t3">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-[8px] w-[8px]"
                    style={{ boxShadow: `inset 0 0 0 1.6px ${CHANNEL_COLOR.static}` }}
                  />
                  Static — reads the source
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-[8px] w-[8px] rounded-full" style={{ background: CHANNEL_COLOR.dynamic }} />
                  Dynamic — runs it sealed
                </span>
              </div>
              {/* The system already owns this: .graph-band ties the height to
                  the graph's own aspect ratio. The hardcoded viewport height it
                  replaces gave a phone a 455px void around a 96px drawing —
                  precisely what that class exists to prevent. */}
              <div className="graph-band" data-settled={settled ? "true" : "false"}>
                <Graph />
              </div>
              <GraphDescription />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   ACT TWO — the answer, at full volume
   ------------------------------------------------------------------------ */

function BigStat({ value, label, colour }: { value: number; label: string; colour: string }) {
  const ready = useValuesReady();
  const n = useCountUp(value, 900, 0, ready);
  // Colour names a thing that is there. Nought criticals painted in the critical
  // hue is an alarm for an alarm that did not happen, so a zero stays graphite.
  const tone = value > 0 ? colour : "var(--color-t4)";
  return (
    <div>
      <div
        className="num leading-none font-light tracking-[-0.04em] tabular-nums"
        style={{ color: tone, fontSize: "clamp(2.2rem,4.4vw,3.6rem)" }}
      >
        {ready ? Math.round(n) : "—"}
      </div>
      <div className="mt-2 text-[12px] tracking-[0.02em] text-t3">{label}</div>
    </div>
  );
}

function VerdictSection({
  onNewAudit,
  onViewReport,
}: {
  onNewAudit: () => void;
  onViewReport: () => void;
}) {
  const findings = useStore((s) => s.findings);
  const summary = useStore((s) => s.summary);
  const verdict = useStore((s) => s.verdict);
  const phase = useStore((s) => s.phase);
  const error = useStore((s) => s.error);
  const still = !useMotionOk();
  const ready = useValuesReady();
  const elapsed = useElapsed();

  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start center"] });
  const rise = useTransform(scrollYProgress, [0, 1], still ? [0, 0] : [64, 0]);
  // Floors at 0.55, never 0. The verdict is the one thing this product exists
  // to deliver; scroll earns it emphasis, never legibility.
  const fade = useTransform(scrollYProgress, [0.15, 0.85], still ? [1, 1] : [0.55, 1]);
  const auraDepth = useTransform(scrollYProgress, [0.1, 0.9], still ? [1, 1] : [0.45, 1]);

  const confirmed = findings.filter((f) => f.confidence === "confirmed").length;
  const copy = verdict ? VERDICT_COPY[verdict] : null;
  const stopped = phase === "error";

  return (
    <section
      ref={ref}
      id="verdict"
      aria-label="Verdict"
      // The top bar is sticky, so an anchor that lands flush with the viewport
      // lands underneath it. Clear its height on the way in.
      // 78svh, not a full screen. The verdict still gets a stage of its own —
      // it is the sentence the whole audit exists to produce — but centring it
      // in 100svh under a band that now stops at ~640px meant a third of a
      // screen of empty floor before you reached the word.
      className="relative flex min-h-[78svh] scroll-mt-40 items-center px-5 py-14 sm:scroll-mt-24 sm:px-8"
    >
      <motion.div style={{ y: rise, opacity: fade }} className="mx-auto w-full max-w-[1500px]">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="relative min-w-0">
            {/* Scoped to this column, not the section. The severity should glow
                behind the verdict itself — bleeding it across the gauge tinted
                "confirmed by execution" in the colour of the risk, which reads
                as if the proof were part of the alarm. */}
            {copy && ready ? (
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute -z-10"
                style={{ inset: "-45% -14% -35% -30%", opacity: auraDepth }}
              >
                <div
                  className="aura-breathe absolute inset-0"
                  style={{
                    background: `radial-gradient(46% 46% at 40% 50%, color-mix(in oklch, ${copy.glow} 40%, transparent), transparent 72%)`,
                  }}
                />
              </motion.div>
            ) : null}

            {copy ? (
              <>
                <motion.h2
                  className="leading-[0.9] font-light tracking-[-0.05em]"
                  style={{
                    color: copy.colour,
                    fontSize: "clamp(3.2rem,10.5vw,9rem)",
                    textShadow: `0 0 80px color-mix(in oklch, ${copy.colour} 45%, transparent)`,
                  }}
                  initial={{ opacity: still ? 1 : 0, transform: still ? "none" : "translateY(18px)" }}
                  animate={ready ? { opacity: 1, transform: "translateY(0px)" } : {}}
                  transition={{ duration: still ? 0 : 0.6, ease: EASE_OUT }}
                >
                  {copy.word}
                </motion.h2>
                <Values className="mt-6 max-w-[26ch] text-[clamp(1.05rem,1.9vw,1.6rem)] leading-[1.3] font-light text-t1">
                  {copy.line}
                </Values>
              </>
            ) : stopped ? (
              <>
                <h2
                  className="leading-[0.9] font-light tracking-[-0.05em] text-t2"
                  style={{ fontSize: "clamp(3.2rem,10.5vw,9rem)" }}
                >
                  Stopped
                </h2>
                <p className="mt-6 max-w-[34ch] text-[clamp(1rem,1.7vw,1.4rem)] leading-[1.35] font-light text-t3">
                  {error ?? "The audit did not finish."}
                </p>
                <p className="mt-4 max-w-[42ch] text-[13.5px] leading-[1.6] text-t4">
                  There is no verdict, because nothing was analysed. Nothing was published.
                </p>
              </>
            ) : (
              <>
                <h2
                  className="leading-[0.9] font-light tracking-[-0.05em] text-t4"
                  style={{ fontSize: "clamp(3.2rem,10.5vw,9rem)" }}
                >
                  Reading
                </h2>
                <p className="mt-6 max-w-[34ch] text-[clamp(1rem,1.7vw,1.4rem)] leading-[1.35] font-light text-t3">
                  The verdict appears once both lanes have reported.
                </p>
              </>
            )}

            <div className="mt-12 grid grid-cols-2 gap-8 sm:grid-cols-4">
              <BigStat value={summary?.total ?? 0} label="Findings" colour="var(--color-t1)" />
              <BigStat value={confirmed} label="Confirmed by execution" colour="var(--color-ran)" />
              <BigStat value={findings.length - confirmed} label="Static candidates" colour="var(--color-read)" />
              <BigStat value={summary?.critical ?? 0} label="Critical" colour="var(--color-critical)" />
            </div>

            <Values className="mt-11 flex flex-wrap items-center gap-3">
              {/* Goes to the report already on this page, not to a second copy
                  of it. Everything the audit saw, then the gate below it. */}
              {stopped || phase === "filing" ? null : (
                <Action tone="loud" icon="file" onClick={onViewReport}>
                  View the full report
                </Action>
              )}
              {phase === "filing" ? null : (
                <Action tone={stopped ? "loud" : "quiet"} icon="refresh" onClick={onNewAudit}>
                  New audit
                </Action>
              )}
              {elapsed ? (
                <span className="num ml-1 text-[11.5px] text-t4">
                  {elapsed} · {phase.replace(/_/g, " ")}
                </span>
              ) : null}
            </Values>
          </div>

          <div className="min-w-0">
            <ProofGauge
              confirmed={confirmed}
              total={findings.length}
              settled={ready && (verdict !== null || stopped)}
              scale={1.5}
              className="mx-auto max-w-[420px]"
            />
            <Values className="mx-auto mt-6 max-w-[34ch] text-center text-[12.5px] leading-[1.6] text-t4">
              Filled is what a probe reproduced by running the server. The remainder is what reading
              the source suggested and nothing has confirmed.
            </Values>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   ACT THREE — the record, on request
   ------------------------------------------------------------------------ */

function Stat({
  icon,
  label,
  caption,
  color,
  count,
  text,
  index,
}: {
  icon: IconName;
  label: string;
  caption: string;
  color: string;
  count?: number;
  text?: string;
  index: number;
}) {
  const ready = useValuesReady();
  const n = useCountUp(count ?? 0, 900, 200 + index * 60, ready);
  return (
    <div className="min-w-[150px] flex-1 border-l border-line px-5 py-4 first:border-l-0">
      <div className="flex items-center gap-2 text-[12.5px] text-t2">
        <span style={{ color }}>
          <Icon name={icon} size={15} strokeWidth={1.9} />
        </span>
        {label}
      </div>
      <Values className="num mt-3 text-[32px] leading-none font-light tracking-[-0.03em] text-t1 tabular-nums">
        {text ?? Math.round(n)}
      </Values>
      <div className="mt-2 text-[11.5px] text-t4">{caption}</div>
    </div>
  );
}

function StatRow() {
  const findings = useStore((s) => s.findings);
  const summary = useStore((s) => s.summary);
  const startedAt = useStore((s) => s.scanStartedAt);
  const confirmed = findings.filter((f) => f.confidence === "confirmed").length;
  const elapsed = useElapsed() ?? "—";

  return (
    <div className="flex flex-wrap border-t border-line">
      <Stat index={0} icon="barChart" label="Findings" count={summary?.total ?? 0} caption="Across both lanes" color="var(--color-read)" />
      <Stat index={1} icon="checkCircle" label="Confirmed" count={confirmed} caption="Reproduced by a probe" color="var(--color-ran)" />
      <Stat index={2} icon="alert" label="Critical" count={summary?.critical ?? 0} caption="Highest severity found" color="var(--color-critical)" />
      <Stat index={3} icon="clock" label="Elapsed" text={startedAt ? elapsed : "—"} caption={startedAt ? "How long the audit took" : "No audit started"} color="var(--color-medium)" />
    </div>
  );
}

function DeclaredPanel() {
  const manifests = useStore((s) => s.manifests);
  const targetPath = useStore((s) => s.targetPath);
  const stage = useStore((s) => s.stages.find((x) => x.id === "manifest"));
  const read = stage?.state === "done" || stage?.state === "failed";

  return (
    <Panel className="pb-4">
      <PanelHead
        title="Declared"
        sub="What the server says it can do, before anything runs it."
        right={manifests.length ? <span className="num text-[11px] text-t4">{manifests.length}</span> : null}
      />
      <div className="px-5 pt-3">
        {targetPath ? (
          <p className="num mb-3 truncate text-[11.5px] text-t4" title={targetPath}>
            {targetPath}
          </p>
        ) : null}
        {manifests.length ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {manifests.map((m) => (
              <li key={m.name} className="num flex items-center gap-2 text-[12px] text-t2">
                <span
                  aria-hidden="true"
                  className="block h-[6px] w-[6px]"
                  style={{ boxShadow: "inset 0 0 0 1.2px var(--color-read)" }}
                />
                {m.name}
              </li>
            ))}
          </ul>
        ) : read ? (
          <p className="text-[12.5px] leading-[1.6] text-t4">
            The server declares no YAML manifest, so there is nothing to compare its behaviour
            against.
          </p>
        ) : (
          <p className="text-[12.5px] text-t4">Not read yet.</p>
        )}
      </div>
    </Panel>
  );
}

function FindingsPanel() {
  const findings = useStore((s) => s.findings);
  const sampleData = useStore((s) => s.sampleData);
  /** A finished audit that found nothing is a result, not a waiting room. */
  const settled = useStore((s) => s.verdict !== null || s.phase === "error");

  return (
    <Panel className="pb-2">
      {/* No second door. The drafted report is reached by the one control that
          names it, on the verdict — a link here let the reader arrive at the
          publish gate without ever passing the decision. */}
      <PanelHead title="Findings" sub="Rule IDs map to the OWASP Agentic Top 10." />
      {sampleData && findings.length ? (
        <p
          className="mx-5 mt-3 rounded-lg px-3 py-2 text-[11.5px] leading-[1.5]"
          style={{
            color: "var(--color-medium)",
            background: "color-mix(in oklch, var(--color-medium) 10%, transparent)",
          }}
        >
          Replayed from a captured sample — the scanning engine is not installed, so nothing here was
          scanned live.
        </p>
      ) : null}
      {findings.length === 0 ? (
        <Empty>
          {settled
            ? "Nothing to report. No static rule fired and no probe reproduced anything, so neither lane has a finding to show."
            : "No findings yet. Static rules produce candidates, and only a probe running the target in isolation produces a confirmation."}
        </Empty>
      ) : (
        <div className="mt-3 overflow-x-auto px-5 pb-3">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead>
              <tr className="text-[11.5px] text-t4">
                <th scope="col" className="pb-2 font-normal">Rule</th>
                <th scope="col" className="pb-2 font-normal">Finding</th>
                <th scope="col" className="pb-2 font-normal">OWASP</th>
                <th scope="col" className="pb-2 font-normal">Lane</th>
                <th scope="col" className="pb-2 font-normal">Severity</th>
                <th scope="col" className="pb-2 font-normal">Proof</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {findings.map((f: Finding, i) => (
                <tr
                  key={`${f.id}-${i}`}
                  className="border-t border-line transition-colors duration-200 hover:bg-p2/60"
                >
                  <td className="num py-2.5 text-t2 whitespace-nowrap">{f.id}</td>
                  <td className="py-2.5 pr-4 text-t1">{f.title}</td>
                  <td className="py-2.5 pr-4 text-[12px] text-t3">{f.owaspCategory}</td>
                  <td className="py-2.5">
                    <span
                      className="num text-[11px] tracking-[0.1em] uppercase"
                      style={{ color: CHANNEL_COLOR[f.source] }}
                    >
                      {f.source}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <SeverityTag severity={f.severity} />
                  </td>
                  <td className="py-2.5">
                    <ConfidenceMark confidence={f.confidence} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function StagesPanel() {
  const stages = useStore((s) => s.stages);
  const phase = useStore((s) => s.phase);
  const still = !useMotionOk();
  const running = phase === "scanning" || phase === "synthesizing";
  const now = useTicker(running, 200);
  const by = (id: StageId): Stage | undefined => stages.find((s) => s.id === id);

  return (
    <Panel className="pb-4">
      <PanelHead title="Lanes" sub="The seven stages of an audit, in order." />
      <ol className="relative mt-3 px-5">
        <span aria-hidden="true" className="absolute top-3 bottom-8 left-[35px] w-px bg-line-2" />
        {STAGE_ORDER.map((id) => {
          const stage = by(id);
          const StageGlyph = STAGE_GLYPH[id];
          const state = stage?.state ?? "pending";
          const tone = STATE_TONE[state];
          const budget = STAGE_BUDGET[id];

          let timing = "—";
          if (stage?.startedAt && stage.endedAt) timing = formatDuration(stage.endedAt - stage.startedAt);
          else if (stage?.startedAt && state === "active") timing = formatDuration(now - stage.startedAt);
          else if (stage?.startedAt) timing = clockTime(stage.startedAt);
          // A budget describes work that is still ahead. A stage that was
          // skipped never spends it, so it reports why instead.
          else if (state === "skipped") timing = stage?.note ?? "not run";
          else if (budget) timing = `budget ${formatDuration(budget)}`;

          return (
            <li key={id} className="relative flex items-center gap-3 py-2">
              <span
                className="relative grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-line"
                style={{ color: tone, background: "var(--color-p1)" }}
              >
                <StageGlyph size={14} strokeWidth={1.9} absoluteStrokeWidth />
                {state === "active" && !still ? (
                  <span
                    className="absolute inset-0 animate-ping rounded-lg opacity-60"
                    style={{ boxShadow: `inset 0 0 0 1px ${tone}` }}
                  />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-t1">{STAGE_LABEL[id]}</span>
                <span className="num block text-[10.5px] text-t4">{timing}</span>
              </span>
              <Chip color={tone}>{state}</Chip>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/**
 * What the audit saw is not an extra — it is the evidence behind the verdict,
 * so it sits on the page and is reached by scrolling. Only the drafted report,
 * which is a thing you might publish rather than a thing you must read, is
 * behind a control.
 */
function RecordSection() {
  const findings = useStore((s) => s.findings);
  /**
   * The findings table only earns a column of its own once it has a real list
   * in it. Four is where it stops looking stranded beside the lanes; it is a
   * threshold, not a measurement, and the layout below it is the honest shape
   * for "there was not much to say".
   */
  const holdsTheColumn = findings.length >= 4;

  /**
   * Panel order is fixed; only the arrangement changes. Both branches pair the
   * tall panel in each column with a short one, because the earlier split — the
   * table alone against lanes + severity + declared — ran one column out ~330px
   * before the other and left a hole in the page rather than a margin.
   */
  const lanes = (
    <Reveal delay={0.1}>
      <StagesPanel />
    </Reveal>
  );
  const severity = (
    <Reveal delay={0.14}>
      <Panel className="pb-4">
        {/* The legend describes a chart. With nothing to plot there is no chart
            to read, so the caption goes with it. */}
        <PanelHead
          title="Severity"
          sub={findings.length ? "Filled is proven. Hatched is only suspected." : undefined}
        />
        <div className="pt-2">
          <SeverityBars findings={findings} />
        </div>
      </Panel>
    </Reveal>
  );
  const declared = (
    <Reveal delay={0.18}>
      <DeclaredPanel />
    </Reveal>
  );

  return (
    <section
      id="record"
      aria-label="The record"
      // pb-12, not pb-24: every section that can follow this one opens with
      // its own pt-24, and the two stacked to ~190px of empty floor above
      // "No report was warranted".
      className="relative scroll-mt-40 px-5 pb-12 sm:scroll-mt-24 sm:px-8"
    >
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="border-t border-line pt-10 pb-8">
          <h2 className="text-[clamp(1.5rem,2.6vw,2.1rem)] leading-none font-light tracking-[-0.03em] text-t1">
            Everything the audit actually saw
          </h2>
        </div>

        <Reveal className="mb-4">
          <Panel>
            <StatRow />
          </Panel>
        </Reveal>

        {holdsTheColumn ? (
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* Declared sits under the table on purpose: what the server says
                it can do, directly beneath what it was caught doing. */}
            <div className="flex min-w-0 flex-col gap-4">
              <Reveal delay={0.05}>
                <FindingsPanel />
              </Reveal>
              {declared}
            </div>
            <div className="flex flex-col gap-4">
              {lanes}
              {severity}
            </div>
          </div>
        ) : (
          /* Nothing to list: the table stops reserving a column, and the lanes —
             seven rows tall whatever happened — take one side on their own. */
          <div className="flex flex-col gap-4">
            <Reveal delay={0.05}>
              <FindingsPanel />
            </Reveal>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              {lanes}
              <div className="flex flex-col gap-4">
                {severity}
                {declared}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Page
   ------------------------------------------------------------------------ */

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * When the walk finishes, the answer is one screen down. Move there — but only
 * if the reader has not already gone somewhere themselves. Hijacking a scroll
 * someone is actively driving is worse than making them press page-down.
 */
function useAdvanceToVerdict() {
  // Waits for the WHOLE walk, not just the analysis beats. Advancing on
  // "values are ready" fired at the synthesis beat — roughly a second and a
  // half in, while the instrument was still sliding into place — so the map
  // was yanked off screen before it had visibly run.
  const complete = useRevealComplete();
  const runId = useStore((s) => s.scanStartedAt);
  const still = usePrefersReducedMotion();
  const advanced = useRef<number | null>(null);

  useEffect(() => {
    if (!complete || runId === null || still) return;
    if (advanced.current === runId) return;
    if (window.scrollY > 140) return;
    advanced.current = runId;
    // Then hold, so the finished picture is something you got to look at.
    const t = window.setTimeout(() => scrollToId("verdict"), HOLD_MS);
    return () => window.clearTimeout(t);
  }, [complete, runId, still]);
}

export function Dashboard() {
  const probe = useProbeConnection();
  useRevealDriver();
  useAdvanceToVerdict();

  const phase = useStore((s) => s.phase);
  const reset = useStore((s) => s.reset);
  const idle = phase === "idle";

  // Resume interrupted scan on reconnect — the session state was persisted
  // to sessionStorage so a network drop doesn't lose progress.
  useEffect(() => {
    if (phase !== "idle") return;
    const session = getPersistedSession();
    if (!session || session.phase === "idle" || session.phase === "error") return;

    // If findings already exist, restore them directly — no need to re-scan.
    if (session.findings.length > 0 || session.summary) {
      useStore.setState({
        repoUrl: session.target,
        targetPath: session.targetPath,
        phase: session.phase,
        stages: session.stages,
        scanStartedAt: session.scanStartedAt,
        manifests: session.manifests,
        findings: session.findings,
        summary: session.summary,
        verdict: session.verdict,
        sampleData: session.sampleData,
      });
      return;
    }

    // Mid-scan with no results yet — resume from where we left off.
    void resumeAudit(session);
  }, [phase]);

  const newAudit = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => reset(), 260);
  }, [reset]);

  const viewReport = useCallback(() => scrollToId("record"), []);

  return (
    <div className="relative min-h-[100svh] bg-bg">
      <ApprovalGate />
      <BackgroundField />
      {/* z-1: above the plasma at z-0, below the content at z-10 — exactly the
          slot asked for. pointer-events-none is not optional: the library binds
          its listeners to document.body, so a full-viewport canvas that took
          pointer events would swallow every click in the app while the effect
          itself would work either way. */}
      {/* mix-blend-mode: screen is what keeps the plasma visible. The tubes
          renderer composites its scene over black, and an opaque black canvas
          across the whole viewport left only 20% of the layer below showing —
          the background looked deleted. Screen maps black to a no-op and only
          ever adds light, so the plasma comes back untouched and the tubes read
          as glow rather than as geometry on a dark card. It also means this
          layer can only brighten what it crosses, never darken it. */}
      <TubesCursor
        className={cn(
          "pointer-events-none fixed inset-0 z-[1] mix-blend-screen",
          "transition-opacity duration-700 ease-[var(--ease-out)]",
          // Full strength on the landing, where it is the only thing moving.
          // Pulled back once the instrument is on screen: the audit graph draws
          // in the same blues and the trail was competing with the one drawing
          // the operator is meant to be reading.
          idle ? "opacity-[0.8]" : "opacity-[0.3]",
        )}
      />
      {!idle ? <ScrollProgress /> : null}
      <div className="relative z-10">
        <TopBar />

        {/* Above the landing, and in flow rather than floating over the
            instrument. A dead probe server disables the one control on the
            page, so it has to say why and offer the way back. */}
        <div className="relative z-30 px-5 pt-4 sm:px-8">
          <div className="mx-auto w-full max-w-[1500px]">
            <Fault onRetry={() => void probe()} />
          </div>
        </div>

        <AnimatePresence>{idle ? <LandingStage key="landing" /> : null}</AnimatePresence>

        {/* Above the landing, always. The exit below is a flourish; if it stalls
            — a starved tab, a busy main thread — the audit must still be the
            thing on screen. */}
        {!idle ? (
          <div className="relative z-20">
            <InstrumentSection />
            <VerdictSection onNewAudit={newAudit} onViewReport={viewReport} />
            <RecordSection />
            {/* The approval gate, on the same page and below the record it is
                about: read what the audit saw, then decide. Each of these
                renders only in its own phase. */}
            <div className="mx-auto w-full max-w-[1500px] pb-24">
              <Review />
              <Outcome />
              <Filed />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
