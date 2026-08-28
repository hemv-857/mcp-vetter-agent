import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { useStore } from "../../store";
import type { LogEntry } from "../../types";
import { clockTime, cn, useEntrance } from "../../lib/util";
import { EASE_OUT } from "../shared/tokens";

/**
 * The transcript. What the agent did, what it is waiting on, and what it
 * found — every line written by a real tool result, in the order it arrived.
 *
 * Colour follows the lane the line came from, so the stream and the graph
 * agree without either of them explaining the other.
 */
function toneOf(entry: LogEntry): string {
  if (entry.kind === "error") return "var(--color-critical)";
  if (entry.kind === "human") return "var(--color-human)";
  if (entry.kind === "warning") return "var(--color-high)";
  if (entry.stage === "static") return "var(--color-read)";
  if (entry.stage === "dynamic") return "var(--color-ran)";
  return "var(--color-t2)";
}

export function Stream({ className }: { className?: string }) {
  const log = useStore((s) => s.log);
  const phase = useStore((s) => s.phase);
  const scroller = useRef<HTMLDivElement>(null);
  const enter = useEntrance();

  const running = phase === "scanning" || phase === "synthesizing" || phase === "filing";

  useEffect(() => {
    const el = scroller.current;
    if (!el || !running) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [log.length, running]);

  if (log.length === 0) return null;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-3.5 flex items-baseline gap-3">
        <span className="label">Transcript</span>
        <span className="num text-[11px] text-t4">{log.length}</span>
      </div>
      <div
        ref={scroller}
        role="log"
        aria-live="polite"
        aria-label="Audit transcript"
        className="contain-scroll max-h-[168px] overflow-y-auto pr-2"
        // The top of the stream dissolves rather than being cut by a rule.
        style={{
          maskImage: "linear-gradient(to bottom, transparent, black 22px)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 22px)",
        }}
      >
        <ul className="flex flex-col gap-[7px] pt-3">
          {log.map((entry) => {
            const tone = toneOf(entry);
            return (
              <motion.li
                key={entry.id}
                initial={enter ? { opacity: 0, y: 7 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: EASE_OUT }}
                className="flex items-baseline gap-3.5 text-[12px] leading-[1.5]"
              >
                <span className="num shrink-0 text-t4 tabular-nums">
                  {clockTime(entry.timestamp)}
                </span>
                <span
                  className="shrink-0 font-medium"
                  style={{ color: tone, minWidth: "13ch" }}
                >
                  {entry.step}
                </span>
                <span
                  className={cn("min-w-0 flex-1 break-words", entry.machine && "num")}
                  style={{ color: entry.kind === "error" ? tone : "var(--color-t3)" }}
                >
                  {entry.detail}
                </span>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
