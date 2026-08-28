import type { Confidence, Severity } from "../../types";
import { CONFIDENCE_LABEL, SEVERITY_COLOR } from "./tokens";
import { cn } from "../../lib/util";

/**
 * Containment: a viewfinder bracket around a specimen. The product's whole act
 * in one glyph — something enclosed, and something looking at it.
 */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M1.6 6V2.6a1 1 0 0 1 1-1H6M12 1.6h3.4a1 1 0 0 1 1 1V6M16.4 12v3.4a1 1 0 0 1-1 1H12M6 16.4H2.6a1 1 0 0 1-1-1V12"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path d="M9 6.2 11.8 9 9 11.8 6.2 9 9 6.2Z" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

/** Severity as a coloured spine, never as a filled badge. Tone carries it. */
export function SeverityTag({ severity }: { severity: Severity }) {
  return (
    <span
      className="num text-[10px] font-semibold tracking-[0.14em] uppercase"
      style={{ color: SEVERITY_COLOR[severity] }}
    >
      {severity}
    </span>
  );
}

/**
 * Filled means a probe reproduced it. Hollow means the source suggested it and
 * nothing confirmed it. This distinction is the product's entire claim, so it
 * is carried by shape — not by colour alone, and not by wording alone.
 */
export function ConfidenceMark({ confidence }: { confidence: Confidence }) {
  const proven = confidence === "confirmed";
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span
        aria-hidden="true"
        className={cn("block h-[7px] w-[7px]", proven ? "rounded-full" : "rounded-[1px]")}
        style={
          proven
            ? { background: "var(--color-ran)", boxShadow: "0 0 9px var(--color-ran)" }
            : { boxShadow: "inset 0 0 0 1.2px var(--color-read)" }
        }
      />
      <span
        className="num text-[10px] tracking-[0.15em] uppercase"
        style={{ color: proven ? "var(--color-ran)" : "var(--color-t4)" }}
      >
        {CONFIDENCE_LABEL[confidence]}
      </span>
    </span>
  );
}
