import { useEffect } from "react";
import { create } from "zustand";
import { useStore } from "../store";
import type { StageId } from "../types";
import { usePrefersReducedMotion } from "./util";

/**
 * THE REVEAL — presentation, never progress.
 *
 * A replayed audit settles in tens of milliseconds, so every stage reaches its
 * final state within one frame and the graph snaps. This walks the *finished*
 * record back out in causal order so it can be read.
 *
 * The distinction that keeps it honest: this never runs while work is actually
 * happening. During `scanning`/`synthesizing` the beat is Infinity, nothing is
 * gated, and the graph shows real live state — a 300s Docker probe animates
 * because it genuinely takes 300s. The walk only starts once the stages have
 * already reported, and it replays the outcomes they actually reported,
 * `skipped` and `failed` included. No stage is ever drawn as running that did
 * not run.
 */

/** The two lanes share a beat: running in parallel is the claim, not a detail. */
export const REVEAL_BEATS: StageId[][] = [
  ["clone"],
  ["manifest"],
  ["static", "dynamic"],
  ["synthesis"],
  ["review"],
  ["file"],
];

export const BEAT_OF: Record<StageId, number> = REVEAL_BEATS.reduce(
  (acc, ids, i) => {
    for (const id of ids) acc[id] = i;
    return acc;
  },
  {} as Record<StageId, number>,
);

/**
 * Pacing. The walk has to be watchable — it is the only chance to see the query
 * actually pass through the instrument, so it gets a lead-in (the graph has to
 * finish arriving before it starts drawing), a real per-beat dwell, and a hold
 * on the finished picture before anything moves the reader away from it.
 */
const LEAD_IN_MS = 640;
/** Exported: the payload's flight time and the edge's draw time are the same
 *  number, or the mark arrives before the line it is supposedly drawing. */
export const BEAT_MS = 460;
/** How long the completed map stays on screen before the verdict is offered. */
export const HOLD_MS = 1500;

export const TOTAL_BEATS = REVEAL_BEATS.length;

/** Findings exist once synthesis has merged the lanes — that is when numbers
 *  have earned the right to appear, not when the last stage clears. */
export const ANALYSIS_BEAT = BEAT_OF.synthesis + 1;

/** Infinity means "not revealing": show everything, immediately. */
const useRevealStore = create<{
  beat: number;
  /** The walk has run to the end for this audit. Distinct from beat===Infinity,
   *  which is also the resting state of a run that never walked at all. */
  complete: boolean;
  setBeat: (beat: number) => void;
  setComplete: (complete: boolean) => void;
}>((set) => ({
  beat: Infinity,
  complete: false,
  setBeat: (beat) => set({ beat }),
  setComplete: (complete) => set({ complete }),
}));

export function useRevealBeat(): number {
  return useRevealStore((s) => s.beat);
}

/** True once the analysis beats have played and values may appear. */
export function useValuesReady(): boolean {
  return useRevealStore((s) => s.beat >= ANALYSIS_BEAT);
}

/** True only after the whole walk has finished — every stage, not just synthesis. */
export function useRevealComplete(): boolean {
  return useRevealStore((s) => s.complete);
}

/**
 * Drives the walk. Mounted once per surface; the beat lives in a module store
 * so the graph and the panels read one clock instead of racing two.
 */
export function useRevealDriver(): void {
  const runId = useStore((s) => s.scanStartedAt);
  const hasResults = useStore((s) => s.verdict !== null || s.findings.length > 0);
  const setBeat = useRevealStore((s) => s.setBeat);
  const setComplete = useRevealStore((s) => s.setComplete);
  const still = usePrefersReducedMotion();

  useEffect(() => {
    // Nothing to walk out: stay ungated so live state renders as it always has.
    if (!hasResults || runId === null) {
      setBeat(Infinity);
      setComplete(false);
      return;
    }
    if (still) {
      setBeat(Infinity);
      setComplete(true);
      return;
    }

    // Deliberately re-entrant. An earlier version guarded with a ref and was
    // silently broken by StrictMode's double-invoke: the first pass claimed the
    // guard and started the interval, the cleanup killed it, and the second
    // pass took the early return — so the walk stalled on beat 0 and no value
    // ever appeared. Depending only on (runId, hasResults) makes a restart
    // harmless, which is what makes it correct under StrictMode.
    setComplete(false);
    setBeat(0);

    let beat = 0;
    let interval = 0;
    // Hold at beat 0 while the instrument finishes arriving, so the first edge
    // does not draw underneath a panel that is still sliding into place.
    const lead = window.setTimeout(() => {
      interval = window.setInterval(() => {
        beat += 1;
        if (beat >= TOTAL_BEATS) {
          window.clearInterval(interval);
          setBeat(Infinity);
          setComplete(true);
          return;
        }
        setBeat(beat);
      }, BEAT_MS);
    }, LEAD_IN_MS);

    return () => {
      window.clearTimeout(lead);
      window.clearInterval(interval);
    };
  }, [hasResults, runId, setBeat, setComplete, still]);
}
