import { AnimatePresence, motion } from "motion/react";
import { useStore } from "./store";
import { Chrome } from "./components/shell/Chrome";
import { Fault } from "./components/shell/Fault";
import { Landing } from "./components/landing/Landing";
import { Investigation } from "./components/audit/Investigation";
import { Verdict } from "./components/verdict/Verdict";
import { Findings } from "./components/findings/Findings";
import { Outcome } from "./components/review/Outcome";
import { Review } from "./components/review/Review";
import { Filed } from "./components/review/Filed";
import { EASE_MOVE } from "./components/shared/tokens";
import { repoSlug } from "./lib/draft";
import { useEntrance } from "./lib/util";
import { useProbeConnection } from "./lib/connection";
import { useRevealDriver } from "./lib/reveal";

export default function App() {
  const phase = useStore((s) => s.phase);
  const repoUrl = useStore((s) => s.repoUrl);
  const enter = useEntrance();

  const probe = useProbeConnection();
  useRevealDriver();

  const started = phase !== "idle";
  const settled =
    phase === "complete" ||
    phase === "awaiting_approval" ||
    phase === "filing" ||
    phase === "filed" ||
    phase === "error";

  return (
    <div className="relative z-10 flex h-[100dvh] flex-col">
      <a
        href="#stage"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-t1 focus:px-4 focus:py-2 focus:text-[13px] focus:text-bg"
      >
        Skip to the investigation
      </a>

      <Chrome />

      {/* The two states overlap rather than queue: the landing dissolves while
          the instrument draws itself in, so pressing Investigate reads as one
          continuous transformation instead of a page swap. The investigation
          sits above, so a stalled exit animation can never hide it. */}
      <main id="stage" className="relative flex min-h-0 flex-1 flex-col">
        {/* In flow, not fixed: a banner that floats over the instrument hides
            exactly the thing the operator is trying to read. */}
        <div className="shrink-0 px-6 sm:px-10">
          <div className="mx-auto max-w-[1560px]">
            <Fault onRetry={() => void probe()} />
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
        <AnimatePresence>
          {!started ? (
            <motion.div
              key="landing"
              className="absolute inset-0 z-0 flex flex-col"
              exit={{
                opacity: 0,
                filter: "blur(9px)",
                transition: { duration: 0.44, ease: EASE_MOVE },
              }}
            >
              <Landing />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {started ? (
          <motion.div
            className="absolute inset-0 z-10 overflow-x-hidden overflow-y-auto"
            initial={enter ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: EASE_MOVE, delay: 0.14 }}
          >
            <div className="mx-auto max-w-[1560px] pt-2 pb-32">
              {/* The landing carries the visible h1; once an audit is running
                  the page still needs one, and it names what is on screen. */}
              <h1 className="sr-only">Audit of {repoSlug(repoUrl)}</h1>
              <Investigation settled={settled} />
              <Verdict />
              <Findings />
              <Review />
              <Outcome />
              <Filed />
            </div>
          </motion.div>
        ) : null}
        </div>
      </main>
    </div>
  );
}
