import { motion } from "motion/react";
import { useStore } from "../../store";
import { EASE_MOVE, EASE_OUT } from "../shared/tokens";
import { useEntrance } from "../../lib/util";

/**
 * After the boundary. Deliberately unlike the approval surface: the violet
 * urgency is gone, the enclosure is closed, and what is left is a receipt.
 * Quiet, settled, and specific about what left the machine.
 */
export function Filed() {
  const filed = useStore((s) => s.filedIssue);
  const phase = useStore((s) => s.phase);
  const reset = useStore((s) => s.reset);
  const enter = useEntrance();

  if (!filed || phase !== "filed") return null;

  return (
    <motion.section
      aria-labelledby="filed-title"
      initial={enter ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="px-5 pt-24 sm:px-8"
    >
      <motion.div
        aria-hidden="true"
        initial={enter ? { scaleX: 0 } : false}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, ease: EASE_MOVE }}
        className="mb-10 h-px w-full origin-left"
        style={{
          background:
            "linear-gradient(to right, var(--color-ran), color-mix(in oklch, var(--color-ran) 20%, transparent) 44%, transparent)",
        }}
      />

      <div className="flex flex-wrap items-start gap-x-20 gap-y-12">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <motion.span
              initial={enter ? { scale: 0.4, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", duration: 0.6, bounce: 0.28, delay: 0.1 }}
              className="grid h-[18px] w-[18px] place-items-center rounded-full"
              style={{ background: "var(--color-ran)" }}
            >
              <svg width="10" height="10" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                <path
                  d="M2 5.6 4.3 8 9 3"
                  stroke="var(--color-bg)"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.span>
            <span
              className="num text-[10.5px] tracking-[0.2em] uppercase"
              style={{ color: "var(--color-ran)" }}
            >
              Filed
            </span>
          </div>

          <h2 id="filed-title" className="mt-6 overflow-hidden">
            <motion.span
              initial={enter ? { y: "108%" } : false}
              animate={{ y: "0%" }}
              transition={{ duration: 0.66, ease: EASE_OUT, delay: 0.16 }}
              className="num block text-[clamp(2.2rem,4.4vw,3.2rem)] leading-[1.04] font-semibold tracking-[-0.04em]"
            >
              #{filed.number}
            </motion.span>
          </h2>

          <p className="num mt-5 text-[14px] text-t2">{filed.repo}</p>

          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <a
              href={filed.url}
              target="_blank"
              rel="noreferrer noopener"
              className="press group flex items-center gap-3 rounded-xl py-0 pr-[6px] pl-6 text-[14px] font-semibold"
              style={{ background: "var(--color-t1)", color: "var(--color-bg)" }}
            >
              View on GitHub
              <span
                aria-hidden="true"
                className="grid h-[42px] w-[42px] place-items-center rounded-[9px] transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-[2px] group-hover:-translate-y-[1px]"
                style={{ background: "oklch(0% 0 0 / 0.09)" }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path
                    d="M3.5 9.5 9.5 3.5M9.5 3.5H4.6M9.5 3.5v4.9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </a>
            <button
              type="button"
              onClick={reset}
              className="press text-[13px] text-t4 transition-colors duration-150 hover:text-t1"
            >
              Investigate another server
            </button>
          </div>
        </div>

        <p className="max-w-[34ch] pt-2 text-[12.5px] leading-[1.65] text-t4">
          The report is public and permanent. The findings above remain on this screen for as
          long as the session lasts.
        </p>
      </div>
    </motion.section>
  );
}
