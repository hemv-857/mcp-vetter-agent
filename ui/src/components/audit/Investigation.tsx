import { motion } from "motion/react";
import { useStore } from "../../store";
import { Graph, GraphDescription } from "./Graph";
import { Stream } from "./Stream";
import { formatDuration, useEntrance, useTicker } from "../../lib/util";
import { EASE_MOVE, EASE_OUT } from "../shared/tokens";

/**
 * What the target says about itself — the other half of the product's
 * argument. Read straight off disk, never executed.
 */
function Declared() {
  const manifests = useStore((s) => s.manifests);
  const targetPath = useStore((s) => s.targetPath);
  const stage = useStore((s) => s.stages.find((x) => x.id === "manifest"));
  const enter = useEntrance();

  const pending = !targetPath && manifests.length === 0;

  return (
    <div className="min-w-0">
      <div className="mb-3.5 flex items-baseline gap-3">
        <span className="label">Declared</span>
        {manifests.length ? (
          <span className="num text-[11px] text-t4">{manifests.length}</span>
        ) : null}
      </div>
      {pending ? <p className="text-[12px] text-t4">Not read yet.</p> : null}
      {targetPath ? (
        <p className="num mb-3 truncate text-[11.5px] text-t4" title={targetPath}>
          {targetPath}
        </p>
      ) : null}
      {manifests.length ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {manifests.map((m, i) => (
            <motion.li
              key={m.name}
              initial={enter ? { opacity: 0, y: 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: EASE_OUT, delay: i * 0.05 }}
              className="num flex items-center gap-2 text-[12px] text-t2"
            >
              <span
                aria-hidden="true"
                className="block h-[6px] w-[6px]"
                style={{ boxShadow: "inset 0 0 0 1.2px var(--color-read)" }}
              />
              {m.name}
            </motion.li>
          ))}
        </ul>
      ) : stage?.state === "done" || stage?.state === "failed" ? (
        <p className="text-[12px] leading-[1.55] text-t4">
          The server declares no YAML manifest, so there is nothing to compare its behaviour
          against.
        </p>
      ) : null}
    </div>
  );
}

/**
 * THE INVESTIGATION STAGE.
 *
 * While the audit runs it owns the whole screen: the graph is the only thing
 * worth looking at, and it is showing real work. The moment there is a verdict
 * to read, the graph settles into a band at the top and hands the screen over.
 */
export function Investigation({ settled }: { settled: boolean }) {
  const phase = useStore((s) => s.phase);
  const startedAt = useStore((s) => s.scanStartedAt);
  const running = phase === "scanning" || phase === "synthesizing";
  const now = useTicker(running, 200);
  const enter = useEntrance();

  return (
    <motion.section
      aria-label="Audit progress"
      layout
      transition={{ duration: 0.66, ease: EASE_MOVE }}
      className="relative px-6 sm:px-10 lg:px-14"
    >
      <GraphDescription />

      <motion.div
        layout
        data-settled={settled}
        animate={{ opacity: settled ? 0.66 : 1 }}
        whileHover={settled ? { opacity: 1 } : undefined}
        transition={{ duration: 0.66, ease: EASE_MOVE }}
        className="graph-band flex items-center justify-center overflow-visible"
      >
        <motion.div
          className="h-full w-full"
          initial={enter ? { opacity: 0, scale: 0.94, filter: "blur(8px)" } : false}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.72, ease: EASE_OUT, delay: 0.18 }}
        >
          <Graph />
        </motion.div>
      </motion.div>

      {/* Under the instrument: what the target claims, and what we have done
          about it. Both real, both live. */}
      <motion.div
        layout
        animate={{ opacity: settled ? 0 : 1, height: settled ? 0 : "auto" }}
        transition={{ duration: 0.44, ease: EASE_MOVE }}
        className="overflow-hidden"
      >
        <div className="grid gap-x-14 gap-y-9 pt-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <Declared />
          <Stream />
        </div>
        {startedAt ? (
          <div className="pt-7 pb-2">
            <span className="num text-[11.5px] text-t4 tabular-nums">
              {formatDuration((running ? now : Date.now()) - startedAt)} elapsed
            </span>
          </div>
        ) : null}
      </motion.div>
    </motion.section>
  );
}
