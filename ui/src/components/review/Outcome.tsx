import { motion } from "motion/react";
import { useStore } from "../../store";
import { EASE_OUT } from "../shared/tokens";
import { useEntrance, useMotionOk } from "../../lib/util";

/**
 * The audit ended without crossing the boundary — either nothing warranted a
 * public report, or the operator declined to file one. Declining is a real
 * outcome and gets a real state, not a blank screen.
 */
export function Outcome() {
  const phase = useStore((s) => s.phase);
  const stages = useStore((s) => s.stages);
  const summary = useStore((s) => s.summary);
  const reset = useStore((s) => s.reset);
  const enter = useEntrance();
  const move = useMotionOk();

  if (phase !== "complete" || !summary) return null;

  const declined = stages.find((s) => s.id === "file")?.note === "declined";
  const warranted = summary.critical > 0 || summary.high > 0;

  return (
    <motion.section
      aria-labelledby="outcome-title"
      initial={enter ? { opacity: 0, y: move ? 12 : 0 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.2 }}
      className="px-5 pt-14 sm:px-8"
    >
      {/* justify-between across 880px stranded the button in open space beside
          a 52ch paragraph, reading as something left behind rather than the
          way out. It belongs under the sentence that explains it. */}
      <div className="max-w-[880px]">
        <div className="min-w-0">
          <span className="label">Nothing was filed</span>
          <h2
            id="outcome-title"
            className="mt-5 text-[clamp(1.5rem,2.4vw,2rem)] leading-[1.12] font-semibold tracking-[-0.032em]"
          >
            {declined ? "You declined to file." : "No report was warranted."}
          </h2>
          <p className="mt-4 max-w-[52ch] text-[13.5px] leading-[1.62] text-t3">
            {declined
              ? "The draft was discarded. The findings above stay on this screen for the rest of the session."
              : warranted
                ? "The findings above stay on this screen for the rest of the session."
                : "A public report needs a CRITICAL or HIGH finding. Nothing here reaches that bar, so nothing was drafted and no approval was needed."}
          </p>
        </div>

        <button
          type="button"
          onClick={reset}
          className="press btn-ghost btn-outline mt-9 text-[13px]"
        >
          Investigate another server
        </button>
      </div>
    </motion.section>
  );
}
