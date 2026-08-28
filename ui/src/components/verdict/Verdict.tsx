import { motion } from "motion/react";
import { useStore } from "../../store";
import type { Finding, Severity } from "../../types";
import { Beat } from "../shared/Primitives";
import { EASE_OUT, SEVERITY_COLOR } from "../shared/tokens";
import { useEntrance } from "../../lib/util";

const ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const HEADLINE: Record<string, { word: string; line: string; colour: string }> = {
  HIGH: {
    word: "High risk",
    line: "Do not connect an agent to this server.",
    colour: "var(--color-critical)",
  },
  MEDIUM: {
    word: "Medium risk",
    line: "Connect only with the findings below understood.",
    colour: "var(--color-medium)",
  },
  LOW: {
    word: "Low risk",
    line: "Minor defects. Nothing warrants a public report.",
    colour: "var(--color-low)",
  },
  CLEAN: {
    word: "Clean",
    line: "No rule fired and no probe reproduced anything.",
    colour: "var(--color-ran)",
  },
};

/**
 * One mark per finding: severity is the hue, and filled versus hollow is
 * whether a probe actually reproduced it. Reading the strip tells you how much
 * of the verdict is proven — which is the only honest summary of a scan.
 */
function Evidence({ findings }: { findings: Finding[] }) {
  const enter = useEntrance();
  if (findings.length === 0) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-[7px]">
        {findings.map((f, i) => {
          const proven = f.confidence === "confirmed";
          const c = SEVERITY_COLOR[f.severity];
          return (
            <motion.a
              key={`${f.id}-${i}`}
              href={`#finding-${f.id}`}
              title={`${f.id} · ${f.severity} · ${proven ? "confirmed by execution" : "static candidate"}`}
              initial={enter ? { opacity: 0, scale: 0.55 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.34, ease: EASE_OUT, delay: 0.5 + i * 0.028 }}
              whileHover={{ scale: 1.28 }}
              className={proven ? "block h-[18px] w-[18px] rounded-[5px]" : "block h-[18px] w-[18px] rounded-[3px]"}
              style={
                proven
                  ? { background: c, boxShadow: `0 0 14px -2px ${c}` }
                  : { boxShadow: `inset 0 0 0 1.5px ${c}` }
              }
            >
              <span className="sr-only">
                {f.id}, {f.severity}, {proven ? "confirmed by execution" : "static candidate"}
              </span>
            </motion.a>
          );
        })}
      </div>
      <p className="mt-4 max-w-[46ch] text-[12px] leading-[1.55] text-t4">
        Filled marks were reproduced by running the server. Hollow marks are candidates the
        source suggested and nothing confirmed.
      </p>
    </div>
  );
}

/** The distribution as one proportional bar, not four numbers in four boxes. */
function Distribution({ findings }: { findings: Finding[] }) {
  const enter = useEntrance();
  const counts = ORDER.map((s) => ({
    severity: s,
    n: findings.filter((f) => f.severity === s).length,
  })).filter((c) => c.n > 0);
  const total = findings.length;
  if (!total) return null;

  return (
    <div className="max-w-[420px]">
      <div className="flex h-[6px] gap-[3px] overflow-hidden">
        {counts.map((c, i) => (
          <motion.span
            key={c.severity}
            initial={enter ? { scaleX: 0 } : false}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.55, ease: EASE_OUT, delay: 0.62 + i * 0.07 }}
            className="block origin-left rounded-full"
            style={{ flex: c.n, background: SEVERITY_COLOR[c.severity] }}
          />
        ))}
      </div>
      <dl className="mt-3.5 flex flex-wrap gap-x-6 gap-y-2">
        {counts.map((c) => (
          <div key={c.severity} className="flex items-baseline gap-2">
            <dt
              className="num text-[10px] tracking-[0.15em] uppercase"
              style={{ color: SEVERITY_COLOR[c.severity] }}
            >
              {c.severity}
            </dt>
            <dd className="num text-[12.5px] text-t2">{c.n}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Verdict() {
  const verdict = useStore((s) => s.verdict);
  const findings = useStore((s) => s.findings);
  const summary = useStore((s) => s.summary);
  const sampleData = useStore((s) => s.sampleData);
  const phase = useStore((s) => s.phase);
  const health = useStore((s) => s.health);
  const enter = useEntrance();

  if (!verdict || !summary || phase === "scanning" || phase === "synthesizing") return null;

  const head = HEADLINE[verdict]!;
  const confirmed = findings.filter((f) => f.confidence === "confirmed").length;
  const dockerOff = health?.dockerAvailable === false;

  return (
    <motion.section
      aria-labelledby="verdict-title"
      initial={enter ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="px-6 pt-10 sm:px-10 lg:px-14"
    >
      <div className="grid items-start gap-x-20 gap-y-12 lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)]">
        <div>
          <motion.span
            initial={enter ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="label"
          >
            Verdict
          </motion.span>

          {/* The reveal: the word rises out of its own line rather than fading
              in place, so the conclusion arrives instead of appearing. */}
          <h2 id="verdict-title" className="mt-5 overflow-hidden">
            <motion.span
              initial={enter ? { y: "108%", filter: "blur(9px)" } : false}
              animate={{ y: "0%", filter: "blur(0px)" }}
              transition={{ duration: 0.72, ease: EASE_OUT, delay: 0.18 }}
              className="block text-[clamp(2.4rem,5vw,3.6rem)] leading-[1.02] font-semibold tracking-[-0.042em]"
              style={{ color: head.colour }}
            >
              {head.word}
            </motion.span>
          </h2>

          <motion.p
            initial={enter ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.42 }}
            className="mt-5 max-w-[42ch] text-[15px] leading-[1.55] text-t2"
          >
            {head.line}
          </motion.p>

          <motion.p
            initial={enter ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.52 }}
            className="mt-9 flex flex-wrap items-baseline gap-x-2.5 gap-y-2 text-[14px] text-t3"
          >
            <Beat value={summary.total} className="text-[19px] font-semibold text-t1" />
            <span>{summary.total === 1 ? "finding" : "findings"}</span>
            <span aria-hidden="true" className="px-1.5 text-t4">
              ·
            </span>
            <Beat
              value={confirmed}
              color="var(--color-ran)"
              className="text-[19px] font-semibold"
            />
            <span>confirmed by execution</span>
          </motion.p>

          {/* One obvious next action, at the moment the verdict is understood. */}
          {phase === "awaiting_approval" ? (
            <motion.a
              href="#review-title"
              initial={enter ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.44, ease: EASE_OUT, delay: 0.72 }}
              className="press group mt-9 inline-flex items-center gap-3.5 rounded-xl py-0 pr-[6px] pl-6 text-[14px] font-semibold"
              style={{
                background: "var(--color-p2)",
                color: "var(--color-t1)",
                boxShadow:
                  "inset 0 0 0 1px color-mix(in oklch, var(--color-human) 50%, transparent)",
              }}
            >
              Review the report
              <span
                aria-hidden="true"
                className="grid h-[40px] w-[40px] place-items-center rounded-[9px] transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-y-[2px]"
                style={{ background: "color-mix(in oklch, var(--color-human) 20%, transparent)" }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path
                    d="M6.5 2v9M2.5 7l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </motion.a>
          ) : null}

          {/* Honest qualifiers, never buried. */}
          {dockerOff && !sampleData && summary.total > 0 ? (
            <motion.p
              initial={enter ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.62 }}
              className="mt-8 max-w-[52ch] text-[12.5px] leading-[1.6]"
              style={{ color: "var(--color-high)" }}
            >
              No sandbox was available. Nothing could be confirmed by execution — treat every
              finding as a candidate.
            </motion.p>
          ) : null}
          {sampleData ? (
            <motion.p
              initial={enter ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.66 }}
              className="mt-3 max-w-[52ch] text-[12.5px] leading-[1.6]"
              style={{ color: "var(--color-high)" }}
            >
              Replayed from a captured report. Nothing here was scanned live.
            </motion.p>
          ) : null}
        </div>

        <div className="flex flex-col gap-10 lg:pt-[52px]">
          {findings.length ? (
            <div>
              <span className="label">Evidence</span>
              <div className="mt-4">
                <Evidence findings={findings} />
              </div>
            </div>
          ) : null}
          {findings.length ? (
            <div>
              <span className="label">Severity</span>
              <div className="mt-4">
                <Distribution findings={findings} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}
