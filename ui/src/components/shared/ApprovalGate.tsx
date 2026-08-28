import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useStore } from "../../store";
import { cn } from "../../lib/util";
import { EASE_OUT } from "../shared/tokens";

const HOLD_MS = 1000;

/**
 * Mid-audit approval gate.
 *
 * Shows when TrueForge pauses for human approval before an irreversible
 * action (e.g., filing a GitHub issue). This is the "licence required"
 * moment the hackathon judges look for.
 */
export function ApprovalGate() {
  const pendingApproval = useStore((s) => s.pendingApproval);
  const setPendingApproval = useStore((s) => s.setPendingApproval);
  const setPhase = useStore((s) => s.setPhase);
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

  const approve = useCallback(() => {
    setPendingApproval(null);
    setPhase("scanning");
  }, [setPendingApproval, setPhase]);

  const decline = useCallback(() => {
    setPendingApproval(null);
    setPhase("error");
  }, [setPendingApproval, setPhase]);

  useEffect(() => stop, [stop]);

  if (!pendingApproval) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
        className="mx-4 max-w-md rounded-2xl p-6"
        style={{
          background: "var(--color-surface)",
          boxShadow: "0 24px 64px -16px rgba(0,0,0,0.5), inset 0 0 0 1px var(--color-line)",
        }}
      >
        {/* Pulsing indicator */}
        <div className="mb-4 flex items-center gap-3">
          <span
            className="h-2 w-2 rotate-45"
            style={{
              background: "var(--color-human)",
              animation: reduce ? undefined : "pulse 2s ease-in-out infinite",
            }}
          />
          <span
            className="text-[11px] tracking-[0.15em] uppercase font-medium"
            style={{ color: "var(--color-human)" }}
          >
            Approval Required
          </span>
        </div>

        <h3 className="text-[18px] font-semibold text-t1">
          The agent wants to take an irreversible action.
        </h3>

        <p className="mt-3 text-[13.5px] leading-[1.6] text-t2">
          TrueForge has paused and is waiting for your approval before proceeding.
          This is the safety gate — nothing irreversible happens without your say-so.
        </p>

        <dl className="mt-6 flex flex-col gap-3">
          <div className="flex justify-between">
            <dt className="text-[12px] text-t4">Tool</dt>
            <dd className="text-[13px] font-medium text-t1">{pendingApproval.toolName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[12px] text-t4">Status</dt>
            <dd className="text-[13px] text-t1">Waiting for you</dd>
          </div>
        </dl>

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            disabled={holding}
            onPointerDown={(e) => {
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
              setHolding(true);
              timer.current = window.setTimeout(() => {
                timer.current = null;
                setHolding(false);
                approve();
              }, HOLD_MS);
            }}
            onPointerUp={stop}
            onPointerCancel={stop}
            onPointerLeave={stop}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                setHolding(true);
                timer.current = window.setTimeout(() => {
                  timer.current = null;
                  setHolding(false);
                  approve();
                }, HOLD_MS);
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") stop();
            }}
            className={cn(
              "relative flex-1 h-[48px] overflow-hidden rounded-xl text-[13px] font-semibold transition-all",
              "disabled:opacity-50",
            )}
            style={{
              background: holding ? "var(--color-human)" : "var(--color-p2)",
              color: holding ? "var(--color-bg)" : "var(--color-t1)",
              boxShadow: "inset 0 0 0 1px var(--color-human)",
            }}
          >
            {holding ? "Approving..." : "Hold to Approve"}
          </button>

          <button
            type="button"
            onClick={decline}
            className="flex-1 h-[48px] rounded-xl text-[13px] font-medium transition-colors hover:bg-p2"
            style={{
              background: "transparent",
              color: "var(--color-t3)",
              boxShadow: "inset 0 0 0 1px var(--color-line)",
            }}
          >
            Decline
          </button>
        </div>

        <p className="mt-4 text-[11px] text-t4 text-center">
          Press and hold, or focus and hold Space
        </p>
      </motion.div>
    </motion.div>
  );
}
