import type { Confidence, Severity } from "../../types";

/** The seven meaningful hues. Anything not in here is graphite. */
export const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: "var(--color-critical)",
  HIGH: "var(--color-high)",
  MEDIUM: "var(--color-medium)",
  LOW: "var(--color-low)",
};

/** Static reads the source; dynamic runs it. Two channels, two hues, always. */
export const CHANNEL_COLOR = {
  static: "var(--color-read)",
  dynamic: "var(--color-ran)",
} as const;

/**
 * Reading is not proving. A candidate never renders as confidently as a
 * finding a probe reproduced — hollow versus filled, everywhere.
 */
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  confirmed: "confirmed",
  candidate: "candidate",
  needs_review: "unreviewed",
};

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_MOVE = [0.77, 0, 0.175, 1] as const;
