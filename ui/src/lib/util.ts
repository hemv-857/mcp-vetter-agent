import { useEffect, useState } from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function clockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Re-render on an interval, but only while something is actually running.
 * A stopped audit costs zero timers.
 */
export function useTicker(active: boolean, intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Entrance flourishes must never gate content. A tab that mounts while hidden
 * gets no animation frames, so a mount animation would leave the page stuck at
 * `opacity: 0` until it is focused — which for a background tab is never.
 * Animate only when we are actually on screen; otherwise render the final state.
 */
export function useEntrance(): boolean {
  const [animate] = useState(() => typeof document === "undefined" || !document.hidden);
  return animate;
}

/**
 * Animate only when motion is welcome *and* the page can actually paint. A tab
 * that mounts in the background gets no animation frames, so a mount animation
 * would leave its element stuck at its `initial` — an invisible gauge, a flat
 * bar, a report that never slides in. Both conditions collapse into one answer.
 */
export function useMotionOk(): boolean {
  return useEntrance() && !usePrefersReducedMotion();
}
