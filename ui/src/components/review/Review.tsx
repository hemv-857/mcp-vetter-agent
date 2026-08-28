import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useStore } from "../../store";
import { declineFiling, fileIssue } from "../../lib/scan";
import { cn, useEntrance } from "../../lib/util";
import { Markdown } from "../shared/Markdown";
import { EASE_MOVE, EASE_OUT } from "../shared/tokens";

const HOLD_MS = 1000;

/**
 * THE BOUNDARY.
 *
 * Everything before this was reading. This is the only action that leaves the
 * machine, so it is a sustained press rather than a click a stray pointer can
 * fire. Keyboard gets the identical interaction on Space or Enter.
 *
 * Slow while the operator is deciding, snappy the moment they let go — the
 * fill is progress feedback, so it survives reduced motion, shortened.
 */
function HoldToAuthorize({
  disabled,
  reason,
  onDone,
}: {
  disabled: boolean;
  /** Why the gate is shut, said at the control rather than only above it. */
  reason: string | null;
  onDone: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const reduce = useReducedMotion();

  const stop = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
  }, []);

  const start = useCallback(() => {
    if (disabled || timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onDone();
    }, HOLD_MS);
  }, [disabled, onDone]);

  useEffect(() => stop, [stop]);

  return (
    <div className="flex flex-col items-start gap-3">
      <motion.button
        type="button"
        disabled={disabled}
        aria-describedby="hold-hint"
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* some pointer types refuse capture */
          }
          start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") stop();
        }}
        onBlur={stop}
        whileTap={disabled ? undefined : { scale: 0.982 }}
        transition={{ duration: 0.16, ease: EASE_OUT }}
        className={cn(
          "relative h-[56px] overflow-hidden rounded-xl px-9 text-[14px] font-semibold select-none",
          "disabled:cursor-not-allowed disabled:opacity-35",
        )}
        style={{
          background: "var(--color-p2)",
          color: "var(--color-t1)",
          boxShadow: disabled
            ? "inset 0 0 0 1px var(--color-line)"
            : "inset 0 0 0 1px color-mix(in oklch, var(--color-human) 55%, transparent), 0 20px 44px -28px var(--color-human)",
        }}
      >
        {/* The commitment, revealed by a clip rather than a scale, so the edge
            stays crisp at any width. Slow to fill, instant to abandon. */}
        <span
          aria-hidden="true"
          className="keep-motion absolute inset-0"
          style={{
            background: "var(--color-human)",
            clipPath: holding ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
            transition: holding
              ? `clip-path ${reduce ? 220 : HOLD_MS}ms linear`
              : "clip-path 180ms cubic-bezier(0.23,1,0.32,1)",
          }}
        />
        <span
          className="relative transition-colors duration-150"
          style={{ color: holding ? "var(--color-bg)" : undefined }}
        >
          {holding ? "Authorizing…" : "Hold to authorize"}
        </span>
      </motion.button>
      <p id="hold-hint" className="max-w-[42ch] text-[11.5px] leading-[1.5] text-t4">
        {reason ?? "Press and hold, or focus and hold Space"}
      </p>
    </div>
  );
}

/** One consequence per column. Three facts, no paragraph. */
function Consequence({
  k,
  v,
  tone,
  mono,
}: {
  k: string;
  v: string;
  tone?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd
        className={cn("mt-3 text-[13.5px]", mono && "num")}
        style={{ color: tone ?? "var(--color-t1)" }}
      >
        {v}
      </dd>
    </div>
  );
}

export function Review() {
  const enter = useEntrance();
  const draft = useStore((s) => s.draftIssue);
  const phase = useStore((s) => s.phase);
  const acknowledged = useStore((s) => s.approvalAcknowledged);
  const setAcknowledged = useStore((s) => s.setAcknowledged);
  const updateDraft = useStore((s) => s.updateDraft);
  const health = useStore((s) => s.health);
  const sampleData = useStore((s) => s.sampleData);
  const findings = useStore((s) => s.findings);
  const [editing, setEditing] = useState(false);
  const still = useReducedMotion();

  if (!draft || (phase !== "awaiting_approval" && phase !== "filing")) return null;

  const filing = phase === "filing";
  const tokenReady = health?.githubConfigured !== false;
  const filable = /^https:\/\/(www\.)?github\.com\//i.test(draft.repoUrl);
  const blocked = !acknowledged || filing || !tokenReady || !filable;
  // A disabled control that says nothing reads as broken. Name the first thing
  // standing in the way, in the order the operator can act on it.
  const blockReason = filing
    ? null
    : !filable
      ? "No repository to file against. Investigate a GitHub URL to enable filing."
      : !tokenReady
        ? "The probe server has no GITHUB_TOKEN, so nothing can be filed."
        : !acknowledged
          ? "Tick the box above first."
          : null;
  const reported = findings.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH");

  return (
    <motion.section
      aria-labelledby="review-title"
      initial={enter ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="px-5 pt-24 sm:px-8"
    >
      {/* The threshold. One line, drawn once, where the machine stops and a
          person starts — the only decorative rule in the product. */}
      <motion.div
        aria-hidden="true"
        initial={enter ? { scaleX: 0, opacity: 0 } : false}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.85, ease: EASE_MOVE }}
        className="mb-10 h-px w-full origin-left"
        style={{
          background:
            "linear-gradient(to right, var(--color-human), color-mix(in oklch, var(--color-human) 22%, transparent) 46%, transparent)",
        }}
      />

      <div className="mb-9 flex items-center gap-3">
        <motion.span
          className="keep-motion h-[7px] w-[7px] rotate-45"
          style={{ boxShadow: "inset 0 0 0 1.6px var(--color-human)" }}
          animate={{ opacity: still ? 1 : [1, 0.32, 1] }}
          transition={
            still ? { duration: 0 } : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
          }
        />
        <span
          className="num text-[10.5px] tracking-[0.2em] uppercase"
          style={{ color: "var(--color-human)" }}
        >
          Human review required
        </span>
      </div>

      <div className="grid gap-x-20 gap-y-14 lg:grid-cols-[minmax(0,580px)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2
            id="review-title"
            className="text-[clamp(1.8rem,3vw,2.5rem)] leading-[1.08] font-semibold tracking-[-0.036em]"
          >
            The system stops here.
          </h2>
          <p className="mt-5 max-w-[46ch] text-[14.5px] leading-[1.6] text-t2">
            Everything above was read-only. Publishing a security report on someone
            else&rsquo;s repository is not, so it was drafted and left for you.
          </p>

          <dl className="mt-11 flex flex-wrap gap-x-16 gap-y-8">
            <Consequence
              k="Destination"
              v={filable ? draft.targetRepo : "no repository"}
              mono={filable}
            />
            <Consequence k="Visibility" v={filable ? "Public, permanently" : "Nothing is sent"} />
            <Consequence k="Reversible" v="No" tone="var(--color-critical)" />
            <Consequence
              k="Reporting"
              v={`${reported.length} of ${findings.length} findings`}
            />
          </dl>

          {/* Reasons the gate is shut, stated plainly, one line each. */}
          <div className="mt-9 flex flex-col gap-3">
            {sampleData ? (
              <p
                className="max-w-[56ch] text-[12.5px] leading-[1.6]"
                style={{ color: "var(--color-high)" }}
              >
                Replayed from a captured report. Filing would report defects nobody verified.
              </p>
            ) : null}
            {!filable ? (
              <p className="max-w-[56ch] text-[12.5px] leading-[1.6] text-t3">
                Local path — no repository to file against. Investigate a GitHub URL to enable
                filing.
              </p>
            ) : null}
            {filable && !tokenReady ? (
              <p className="max-w-[56ch] text-[12.5px] leading-[1.6] text-t3">
                Filing is unavailable: the probe server has no{" "}
                <span className="num">GITHUB_TOKEN</span>.
              </p>
            ) : null}
          </div>

          <label className="mt-10 flex max-w-[54ch] cursor-pointer items-start gap-3.5">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={filing}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="mt-[2px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] transition-[background-color,box-shadow] duration-150 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-read)]"
              style={{
                background: acknowledged ? "var(--color-human)" : "transparent",
                boxShadow: acknowledged
                  ? "none"
                  : "inset 0 0 0 1.4px var(--color-line-2)",
              }}
            >
              <AnimatePresence>
                {acknowledged ? (
                  <motion.svg
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={{ duration: 0.18, ease: EASE_OUT }}
                    width="11"
                    height="11"
                    viewBox="0 0 11 11"
                    fill="none"
                  >
                    <path
                      d="M2 5.6 4.3 8 9 3"
                      stroke="var(--color-bg)"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </motion.svg>
                ) : null}
              </AnimatePresence>
            </span>
            <span className="text-[13px] leading-[1.55] text-t2">
              I have read this report and understand that filing publishes it publicly on{" "}
              {/* A target can be a long path; break it rather than letting it
                  run out of the column and under the report beside it. */}
              <span className="num break-all text-t1">{draft.targetRepo}</span> and cannot be
              undone.
            </span>
          </label>

          <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-5">
            <HoldToAuthorize
              disabled={blocked}
              reason={blockReason}
              onDone={() => void fileIssue()}
            />
            <button
              type="button"
              onClick={declineFiling}
              disabled={filing}
              className="press text-[13px] text-t4 transition-colors duration-150 hover:text-t1 disabled:opacity-40"
            >
              Don&rsquo;t file it
            </button>
          </div>
        </div>

        {/* The report itself — a contained surface, because it is a document
            that leaves the machine rather than part of the instrument. */}
        <div className="min-w-0">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <span className="label">The report</span>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              disabled={filing}
              className="press label transition-colors duration-150 hover:text-t1 disabled:opacity-40"
            >
              {editing ? "done" : "edit"}
            </button>
          </div>

          <div
            className="surface overflow-hidden rounded-xl"
            style={{ boxShadow: "inset 0 1px 0 oklch(100% 0 0 / 0.05), 0 0 0 1px var(--color-line-2)" }}
          >
            {editing ? (
              <div className="flex flex-col gap-3 p-4">
                <label className="sr-only" htmlFor="draft-title">
                  Report title
                </label>
                <input
                  id="draft-title"
                  value={draft.title}
                  onChange={(e) => updateDraft({ title: e.target.value })}
                  className="w-full rounded-lg bg-p2 px-3.5 py-3 text-[13.5px] font-medium text-t1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-read)]"
                />
                <label className="sr-only" htmlFor="draft-body">
                  Report body
                </label>
                <textarea
                  id="draft-body"
                  value={draft.body}
                  onChange={(e) => updateDraft({ body: e.target.value })}
                  rows={16}
                  spellCheck={false}
                  className="num contain-scroll w-full resize-y rounded-lg bg-p2 px-3.5 py-3 text-[12px] leading-[1.6] text-t2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-read)]"
                />
              </div>
            ) : (
              <div className="contain-scroll max-h-[440px] overflow-y-auto px-6 py-5">
                <h3 className="text-[14.5px] leading-[1.4] font-semibold text-t1">
                  {draft.title}
                </h3>
                <div className="mt-2.5 mb-5 flex flex-wrap gap-2">
                  {draft.labels.map((l) => (
                    <span
                      key={l}
                      className="label rounded-full px-2.5 py-1.5"
                      style={{ boxShadow: "inset 0 0 0 1px var(--color-line-2)" }}
                    >
                      {l}
                    </span>
                  ))}
                </div>
                <Markdown source={draft.body} />
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
