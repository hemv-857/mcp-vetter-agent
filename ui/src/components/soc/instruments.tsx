import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { Finding, Severity } from "../../types";
import { EASE_OUT, SEVERITY_COLOR } from "../shared/tokens";
import { cn, useEntrance, usePrefersReducedMotion } from "../../lib/util";
import { useValuesReady } from "../../lib/reveal";

/* ---------------------------------------------------------------------------
   Shared motion primitives
   ------------------------------------------------------------------------ */

/**
 * Animate only when motion is welcome *and* the page can actually paint. A tab
 * that mounts in the background gets no animation frames, so a mount animation
 * would leave the gauge at zero and the bars flat — the console would render
 * empty. Both conditions collapse into one answer everything here reads.
 */
export function useMotionOk(): boolean {
  return useEntrance() && !usePrefersReducedMotion();
}

/**
 * Counts a real number up to its real value. Never used to imply progress that
 * has not happened: callers pass a value the store already holds.
 */
export function useCountUp(to: number, duration = 900, delay = 0, enabled = true): number {
  const still = !useMotionOk();
  const [value, setValue] = useState(still ? to : 0);

  useEffect(() => {
    // Held at zero until the reveal hands over, so the roll-up is something the
    // reader actually sees rather than something that finished behind a fade.
    if (!enabled) {
      setValue(0);
      return;
    }
    if (still) {
      setValue(to);
      return;
    }
    let frame = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / duration));
      setValue(to * (1 - Math.pow(1 - p, 3))); // ease-out cubic, matches --ease-out
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, duration, delay, still, enabled]);

  return value;
}

/* ---------------------------------------------------------------------------
   Proof gauge
   ------------------------------------------------------------------------ */

const ARC = "M 26 118 A 92 92 0 0 1 210 118";

/**
 * How much of this verdict is PROVEN, not how "healthy" the target is. There is
 * no health score in this product and inventing one would be fake telemetry —
 * the only honest ratio is findings a probe reproduced over findings total.
 * The proven arc is the dynamic hue; the remainder stays the static hue,
 * because an unconfirmed candidate is a reading, not a fact.
 */
export function ProofGauge({
  confirmed,
  total,
  settled = false,
  className = "mx-auto max-w-[268px]",
  scale = 1,
}: {
  confirmed: number;
  total: number;
  /** The audit has finished. Nought findings then means nought to prove, not "not yet". */
  settled?: boolean;
  className?: string;
  /** Type scale multiplier — the hero wants this instrument loud. */
  scale?: number;
}) {
  const still = !useMotionOk();
  const ready = useValuesReady();
  const fraction = ready && total > 0 ? confirmed / total : 0;
  const shown = useCountUp(confirmed, 900, 0, ready);

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox="0 0 236 132"
        className="w-full"
        role="img"
        aria-label={
          ready && total > 0
            ? `${confirmed} of ${total} findings confirmed by execution`
            : settled
              ? "No findings, so there is nothing to confirm"
              : "No findings yet"
        }
      >
        {/* The unproven remainder: what reading the source suggested. */}
        <path d={ARC} stroke="var(--color-p3)" strokeWidth="13" strokeLinecap="round" fill="none" />
        {ready && total > 0 && (
          <path
            d={ARC}
            stroke="var(--color-read)"
            strokeWidth="13"
            strokeLinecap="round"
            fill="none"
            opacity="0.4"
          />
        )}
        {/* Omitted entirely at zero: a round-capped stroke with pathLength 0
            paints a dot at each dash boundary, which would read as proof that
            does not exist. */}
        {fraction > 0 && (
          <motion.path
            d={ARC}
            stroke="var(--color-ran)"
            strokeWidth="13"
            strokeLinecap="round"
            fill="none"
            style={{
              filter: "drop-shadow(0 0 8px color-mix(in oklch, var(--color-ran) 45%, transparent))",
            }}
            initial={{ pathLength: still ? fraction : 0 }}
            animate={{ pathLength: fraction }}
            transition={{ duration: still ? 0 : 0.9, ease: EASE_OUT }}
          />
        )}
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center">
        {ready && total > 0 ? (
          <>
            <div className="flex items-baseline justify-center gap-0.5">
              <span
                className="num leading-none font-light tracking-[-0.04em] text-t1 tabular-nums"
                style={{ fontSize: `${46 * scale}px` }}
              >
                {Math.round(shown)}
              </span>
              <span className="num text-t4" style={{ fontSize: `${15 * scale}px` }}>
                /{total}
              </span>
            </div>
            <div className="mt-1.5 text-ran" style={{ fontSize: `${12 * scale}px` }}>
              confirmed by execution
            </div>
          </>
        ) : (
          <>
            <div
              className="num leading-none font-light text-t4"
              style={{ fontSize: `${34 * scale}px` }}
            >
              —
            </div>
            {/* "yet" is a promise. A finished audit that found nothing has
                nothing left to prove, and must not read as still working. */}
            <div className="mt-2 text-t4" style={{ fontSize: `${12 * scale}px` }}>
              {settled ? "nothing to confirm" : "nothing proven yet"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Severity distribution
   ------------------------------------------------------------------------ */

const ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

/**
 * The real distribution, split by proof. Filled is what a probe reproduced,
 * hatched is what only the source suggested — the same filled/hollow rule the
 * rest of the product uses, so a candidate never reads as confidently as a
 * confirmed finding.
 */
export function SeverityBars({ findings }: { findings: Finding[] }) {
  const still = !useMotionOk();
  const ready = useValuesReady();

  const rows = ORDER.map((severity) => {
    const of = findings.filter((f) => f.severity === severity);
    return {
      severity,
      confirmed: of.filter((f) => f.confidence === "confirmed").length,
      candidate: of.filter((f) => f.confidence !== "confirmed").length,
      total: of.length,
    };
  });

  const peak = Math.max(1, ...rows.map((r) => r.total));

  if (findings.length === 0) {
    return <p className="px-5 py-6 text-[12.5px] text-t4">No findings to distribute yet.</p>;
  }

  return (
    <div className="px-5 pt-1 pb-1">
      <div className="flex h-[104px] items-end gap-3">
        {rows.map((row, i) => {
          const colour = SEVERITY_COLOR[row.severity];
          return (
            <div key={row.severity} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="num text-[11px] text-t3 tabular-nums">{row.total || ""}</span>
              <div className="flex w-full flex-1 flex-col justify-end gap-[2px]">
                {row.candidate > 0 && (
                  <motion.div
                    className="w-full origin-bottom rounded-t-[3px]"
                    style={{
                      height: `${(row.candidate / peak) * 76}px`,
                      background: `repeating-linear-gradient(45deg, ${colour} 0 1px, transparent 1px 5px)`,
                      boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${colour} 45%, transparent)`,
                    }}
                    initial={{ transform: still ? "scaleY(1)" : "scaleY(0)" }}
                    animate={{ transform: ready ? "scaleY(1)" : "scaleY(0)" }}
                    transition={{ duration: still ? 0 : 0.5, ease: EASE_OUT, delay: still ? 0 : 0.15 + i * 0.06 }}
                  />
                )}
                {row.confirmed > 0 && (
                  <motion.div
                    className="w-full origin-bottom rounded-[2px]"
                    style={{ height: `${(row.confirmed / peak) * 76}px`, background: colour }}
                    initial={{ transform: still ? "scaleY(1)" : "scaleY(0)" }}
                    animate={{ transform: ready ? "scaleY(1)" : "scaleY(0)" }}
                    transition={{ duration: still ? 0 : 0.5, ease: EASE_OUT, delay: still ? 0 : 0.1 + i * 0.06 }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-3 border-t border-line pt-2">
        {rows.map((row) => (
          <div
            key={row.severity}
            className="num flex-1 text-center text-[8.5px] tracking-[0.06em]"
            style={{ color: SEVERITY_COLOR[row.severity] }}
          >
            {row.severity}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-line pt-2.5 text-[10.5px] text-t4">
        <span className="inline-flex items-center gap-1.5">
          <span className="block h-2 w-2 rounded-full bg-t3" />
          confirmed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="block h-2 w-2"
            style={{
              background: "repeating-linear-gradient(45deg, var(--color-t3) 0 1px, transparent 1px 4px)",
              boxShadow: "inset 0 0 0 1px var(--color-line-2)",
            }}
          />
          candidate
        </span>
      </div>
    </div>
  );
}
