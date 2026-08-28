import { motion } from "motion/react";
import { useStore } from "../../store";
import { runAudit } from "../../lib/scan";
import { useEntrance } from "../../lib/util";
import { TargetField } from "./TargetField";
import { EASE_OUT } from "../shared/tokens";
import { Capabilities } from "../shell/Capabilities";

/**
 * The two visual languages, taught once before the graph ever uses them. A
 * hollow square is what the source suggested; a filled circle is what execution
 * reproduced. Everything downstream obeys this legend.
 */
const LEGEND = [
  {
    k: "Static",
    v: "reads the source",
    c: "var(--color-read)",
    mark: (
      <span
        className="block h-[9px] w-[9px]"
        style={{ boxShadow: "inset 0 0 0 1.4px var(--color-read)" }}
      />
    ),
  },
  {
    k: "Dynamic",
    v: "runs it sealed",
    c: "var(--color-ran)",
    mark: (
      <span
        className="block h-[9px] w-[9px] rounded-full"
        style={{ background: "var(--color-ran)", boxShadow: "0 0 10px var(--color-ran)" }}
      />
    ),
  },
  {
    k: "You",
    v: "authorize the report",
    c: "var(--color-human)",
    mark: (
      <span
        className="block h-[9px] w-[9px] rotate-45"
        style={{ boxShadow: "inset 0 0 0 1.4px var(--color-human)" }}
      />
    ),
  },
];

/** Real targets that ship in this repository, plus the fixture on GitHub. */
const KNOWN = [
  { label: "vulnerable fixture", target: "https://github.com/hemv-857/mcp-vulnerable-fixture" },
  { label: "local vulnerable", target: "fixtures/vulnerable_server" },
  { label: "local clean", target: "fixtures/clean_server" },
];

export function Landing() {
  const enter = useEntrance();
  const connected = useStore((s) => s.connected);
  const setRepoUrl = useStore((s) => s.setRepoUrl);

  const step = (delay: number) => ({
    initial: enter ? { opacity: 0, y: 14, filter: "blur(6px)" } : false,
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.62, ease: EASE_OUT, delay },
  });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="relative z-10 flex min-h-0 flex-1 items-center px-6 sm:px-12 lg:px-[72px]">
        <div className="w-full max-w-[680px]">
          <motion.div {...step(0)} className="flex items-center gap-3.5">
            <span className="label">MCP server vetting</span>
            <span
              aria-hidden="true"
              className="h-px w-16"
              style={{ background: "linear-gradient(to right, var(--color-line-2), transparent)" }}
            />
          </motion.div>

          <motion.h1
            {...step(0.06)}
            className="mt-7 text-[clamp(1.75rem,2.85vw,2.32rem)] leading-[1.14] font-semibold tracking-[-0.034em] text-balance"
          >
            <span className="block text-t3">Every server declares what it can do.</span>
            <span className="block">Find out what it actually does.</span>
          </motion.h1>

          <motion.p
            {...step(0.12)}
            className="mt-6 max-w-[46ch] text-[14.5px] leading-[1.65] text-t2"
          >
            Read the source, then run it sealed in a container and compare. A defect is fact
            only where both agree — and nothing is published without you.
          </motion.p>

          <motion.div {...step(0.19)} className="mt-11">
            <TargetField />
          </motion.div>

          <motion.div {...step(0.27)} className="mt-6 flex flex-wrap items-center gap-2.5">
            <span className="label mr-1">Or try</span>
            {KNOWN.map((k) => (
              <button
                key={k.target}
                type="button"
                disabled={!connected}
                onClick={() => {
                  setRepoUrl(k.target);
                  void runAudit(k.target);
                }}
                title={k.target}
                className="press num rounded-full px-3.5 py-2 text-[11.5px] text-t3 transition-[color,background-color] duration-150 hover:bg-p2 hover:text-t1 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ boxShadow: "inset 0 0 0 1px var(--color-line-2)" }}
              >
                {k.label}
              </button>
            ))}
          </motion.div>

        </div>
      </div>

      {/* The floor of the stage: the language, and what this environment can do. */}
      <motion.div
        {...step(0.42)}
        className="relative z-10 flex flex-wrap items-center gap-x-10 gap-y-4 px-6 pb-9 sm:px-12 lg:px-[72px]"
      >
        {LEGEND.map((i) => (
          <div key={i.k} className="flex items-center gap-2.5">
            <span aria-hidden="true">{i.mark}</span>
            <span className="text-[12.5px] leading-none font-medium" style={{ color: i.c }}>
              {i.k}
            </span>
            <span className="text-[12.5px] leading-none text-t4">{i.v}</span>
          </div>
        ))}
        <div className="ml-auto hidden items-center gap-8 lg:flex">
          <Capabilities />
        </div>
      </motion.div>
    </div>
  );
}
