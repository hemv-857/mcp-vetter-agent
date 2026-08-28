import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../../store";
import { SERVER_PORT } from "../../lib/mcp";
import { EASE_OUT } from "../shared/tokens";
import { useEntrance } from "../../lib/util";

/** A failure is a designed state, not a blank screen. */
export function Fault({ onRetry }: { onRetry: () => void }) {
  const connection = useStore((s) => s.connection);
  const error = useStore((s) => s.error);
  const errorTitle = useStore((s) => s.errorTitle);
  const clearError = useStore((s) => s.clearError);
  const enter = useEntrance();

  const offline = connection === "disconnected";
  const show = offline || Boolean(error);
  // The probe server reports what failed; the console says what to do about it.
  const nextStep = error
    ? /clone|url|repository|network/i.test(error)
      ? "Check that the target is a public https GitHub repository."
      : /timed out/i.test(error)
        ? "The target may be too large for the tool's budget. Try a smaller repository."
        : /docker|sandbox/i.test(error)
          ? "Start Docker on the probe host to enable dynamic probes."
          : null
    : null;

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          role="alert"
          initial={enter ? { opacity: 0, y: -10, scale: 0.985 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.16 } }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
          className="surface flex flex-wrap items-start gap-x-6 gap-y-3 rounded-lg px-5 py-4"
          style={{ boxShadow: "inset 2px 0 0 var(--color-critical), 0 0 0 1px var(--color-line)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-medium text-t1">
              {offline ? "No probe server" : (errorTitle ?? "Something failed")}
            </div>
            <p className="mt-1.5 max-w-[74ch] text-[12.5px] leading-[1.6] text-t3">
              {offline ? (
                <>
                  Nothing is reachable on port <span className="num text-t2">{SERVER_PORT}</span>.
                  Start the probe server, then reconnect.
                </>
              ) : (
                error
              )}
            </p>
            {nextStep ? (
              <p className="mt-2 max-w-[74ch] text-[12.5px] leading-[1.6] text-t4">{nextStep}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={offline ? onRetry : clearError}
            className="press btn-ghost label"
            style={{ background: "var(--color-p2)" }}
          >
            {offline ? "reconnect" : "dismiss"}
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
