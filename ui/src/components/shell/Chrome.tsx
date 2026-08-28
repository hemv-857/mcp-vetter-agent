import { motion, useReducedMotion } from "motion/react";
import { useStore } from "../../store";
import { Mark } from "../shared/Primitives";
import { Capabilities } from "./Capabilities";
import { EASE_OUT } from "../shared/tokens";
import { repoSlug } from "../../lib/draft";
import { useEntrance } from "../../lib/util";

export function Chrome() {
  const connection = useStore((s) => s.connection);
  const sampleData = useStore((s) => s.sampleData);
  const phase = useStore((s) => s.phase);
  const repoUrl = useStore((s) => s.repoUrl);
  const reset = useStore((s) => s.reset);
  const enter = useEntrance();
  const still = useReducedMotion();

  const busy = phase === "scanning" || phase === "synthesizing" || phase === "filing";
  const started = phase !== "idle";
  // Once nothing is running there must always be a way back to a new target,
  // including out of an error.
  const settled =
    phase === "complete" || phase === "awaiting_approval" || phase === "filed" || phase === "error";
  const state =
    connection !== "connected"
      ? connection
      : busy
        ? "working"
        : phase === "filed"
          ? "filed"
          : "ready";

  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center justify-between gap-6 px-6 sm:px-8">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex shrink-0 items-center gap-2.5">
          <span style={{ color: "var(--color-ran)" }}>
            <Mark />
          </span>
          <span className="text-[13px] font-semibold tracking-[-0.012em]">MCP Vetting</span>
        </span>
        {/* under investigation the target belongs in the chrome — it is what
            every number on screen is about */}
        {started && repoUrl ? (
          <motion.span
            initial={enter ? { opacity: 0, x: -6 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.36, ease: EASE_OUT, delay: 0.2 }}
            className="hidden min-w-0 items-center gap-3.5 md:flex"
          >
            <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-[var(--color-line-2)]" />
            <span className="num truncate text-[12px] text-t3">{repoSlug(repoUrl)}</span>
          </motion.span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-5 sm:gap-6">
        {sampleData ? (
          <motion.span
            initial={enter ? { opacity: 0, y: -5 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: EASE_OUT }}
            className="label hidden rounded-full px-2.5 py-1.5 sm:block"
            style={{
              color: "var(--color-high)",
              boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--color-high) 45%, transparent)",
            }}
          >
            replayed sample
          </motion.span>
        ) : null}

        {/* on the landing this lives on the floor of the stage instead */}
        {started ? <Capabilities className="hidden md:flex" /> : null}

        {settled ? (
          <motion.button
            type="button"
            onClick={reset}
            initial={enter ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="press label whitespace-nowrap transition-colors duration-150 hover:text-t1"
          >
            new target
          </motion.button>
        ) : null}

        <div className="flex items-center gap-2">
          <motion.span
            className="keep-motion block h-[6px] w-[6px] rounded-full"
            animate={{
              backgroundColor:
                connection === "connected"
                  ? busy
                    ? "var(--color-read)"
                    : "var(--color-ran)"
                  : connection === "connecting"
                    ? "var(--color-t4)"
                    : "var(--color-critical)",
              opacity: busy && !still ? [1, 0.3, 1] : 1,
              scale: busy && !still ? [1, 1.35, 1] : 1,
            }}
            transition={
              busy && !still
                ? {
                    opacity: { duration: 1.7, repeat: Infinity, ease: "easeInOut" },
                    scale: { duration: 1.7, repeat: Infinity, ease: "easeInOut" },
                    backgroundColor: { duration: 0.2 },
                  }
                : { duration: 0.2 }
            }
          />
          <span
            className="label"
            role="status"
            aria-live="polite"
            style={{ color: connection === "disconnected" ? "var(--color-critical)" : undefined }}
          >
            {state}
          </span>
        </div>
      </div>
    </header>
  );
}
