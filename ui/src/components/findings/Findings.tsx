import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../../store";
import type { Finding } from "../../types";
import { declaredAt, SEVERITY_ORDER } from "../../lib/report";
import { cn, useEntrance } from "../../lib/util";
import { ConfidenceMark, SeverityTag } from "../shared/Primitives";
import { EASE_MOVE, EASE_OUT, SEVERITY_COLOR } from "../shared/tokens";

type Sort = "severity" | "proof" | "rule";

/**
 * Evidence, in the language of the lane that produced it. READ is a quotation
 * from the source. RAN is what the server did when it was executed. Where both
 * exist they sit side by side, because the difference between them is the
 * product's entire argument.
 */
function Channel({
  kind,
  body,
  note,
}: {
  kind: "read" | "ran";
  body: string;
  note?: string;
}) {
  const isRan = kind === "ran";
  const colour = isRan ? "var(--color-ran)" : "var(--color-read)";
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn("block h-[7px] w-[7px]", isRan && "rounded-full")}
          style={
            isRan
              ? { background: colour, boxShadow: `0 0 9px ${colour}` }
              : { boxShadow: `inset 0 0 0 1.3px ${colour}` }
          }
        />
        <span
          className="num text-[10px] tracking-[0.18em] uppercase"
          style={{ color: colour }}
        >
          {isRan ? "Ran" : "Read"}
        </span>
        <span className="text-[11.5px] text-t4">
          {isRan ? "executed in isolation" : "quoted from the source"}
        </span>
      </div>
      <pre
        className="num max-w-[88ch] overflow-x-auto rounded-lg px-4 py-3.5 text-[12px] leading-[1.65] break-words whitespace-pre-wrap text-t2"
        style={{
          background: "var(--color-p1)",
          boxShadow: `inset 2px 0 0 ${colour}, inset 0 1px 0 oklch(100% 0 0 / 0.04)`,
        }}
      >
        {body}
      </pre>
      {note ? <p className="mt-2.5 text-[11.5px] leading-[1.55] text-t4">{note}</p> : null}
    </div>
  );
}

function Row({ finding, index }: { finding: Finding; index: number }) {
  const [open, setOpen] = useState(false);
  const manifests = useStore((s) => s.manifests);
  const enter = useEntrance();
  const id = `finding-${finding.id}`;
  const panelId = `${id}-detail`;

  const declared = useMemo(() => declaredAt(finding, manifests), [finding, manifests]);
  const proven = finding.confidence === "confirmed";
  const colour = SEVERITY_COLOR[finding.severity];

  return (
    <motion.li
      id={id}
      layout="position"
      transition={{ duration: 0.42, ease: EASE_MOVE }}
      initial={enter ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      // eslint-disable-next-line react-hooks/exhaustive-deps
      className="row-skip"
      style={{ scrollMarginTop: 84 }}
    >
      <motion.div
        transition={{ delay: 0.72 + index * 0.035, duration: 0.36, ease: EASE_OUT }}
        initial={enter ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className={cn(
            "group relative grid w-full items-center gap-x-7 gap-y-2 rounded-lg py-3 pr-4 pl-5 text-left",
            "transition-colors duration-150 hover:bg-p1",
            // one scannable line on a desktop stage; two on anything narrower
            "grid-cols-[minmax(0,1fr)_auto_14px]",
            "lg:grid-cols-[minmax(0,1fr)_86px_minmax(0,190px)_minmax(0,170px)_128px_14px]",
          )}
        >
          {/* severity is a spine, not a badge */}
          <span
            aria-hidden="true"
            className="absolute top-2.5 bottom-2.5 left-0 w-[2px] rounded-full transition-[width] duration-150 group-hover:w-[3px]"
            style={{ background: colour }}
          />

          <span className="flex min-w-0 items-baseline gap-3">
            <span className="truncate text-[14px] font-medium text-t1">{finding.title}</span>
            <span className="num shrink-0 text-[11px] text-t4">{finding.id}</span>
          </span>

          <span className="hidden lg:block">
            <SeverityTag severity={finding.severity} />
          </span>
          <span className="hidden truncate text-[12px] text-t3 lg:block">
            {finding.owaspCategory}
          </span>
          <span className="num hidden truncate text-[12px] text-t4 lg:block">
            {finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : "—"}
          </span>

          {/* the meta that does not fit a narrow row folds under the title */}
          <span className="col-span-3 flex flex-wrap items-center gap-x-4 gap-y-1 lg:hidden">
            <SeverityTag severity={finding.severity} />
            <span className="text-[11.5px] text-t3">{finding.owaspCategory}</span>
            {finding.file ? (
              <span className="num text-[11.5px] text-t4">
                {finding.file}
                {finding.line ? `:${finding.line}` : ""}
              </span>
            ) : null}
          </span>

          <span className="shrink-0 justify-self-end lg:justify-self-start">
            <ConfidenceMark confidence={finding.confidence} />
          </span>

          <motion.span
            aria-hidden="true"
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            className="shrink-0 text-t4 transition-colors group-hover:text-t2"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path
                d="M3 5l3.5 3.5L10 5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              id={panelId}
              key="detail"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: { duration: 0.22, ease: EASE_MOVE } }}
              transition={{ duration: 0.36, ease: EASE_MOVE }}
              className="overflow-hidden"
            >
              <div className="grid gap-x-10 gap-y-9 px-5 pt-4 pb-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
                <div className="flex min-w-0 flex-col gap-8">
                  {/* Both exposures where both exist; otherwise the one there is. */}
                  {finding.read || finding.ran ? (
                    <div
                      className={cn(
                        "grid gap-x-8 gap-y-8",
                        finding.read && finding.ran && "lg:grid-cols-2",
                      )}
                    >
                      {finding.read ? <Channel kind="read" body={finding.read} /> : null}
                      {finding.ran ? (
                        <Channel
                          kind="ran"
                          body={finding.ran}
                          note={finding.probe ? `probe: ${finding.probe}` : undefined}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <Channel
                      kind={finding.source === "dynamic" ? "ran" : "read"}
                      body={finding.evidence}
                      note={finding.probe ? `probe: ${finding.probe}` : undefined}
                    />
                  )}

                  {declared ? (
                    <div className="min-w-0">
                      <div className="mb-3 flex items-center gap-2.5">
                        <span className="num text-[10px] tracking-[0.18em] text-t4 uppercase">
                          Declared here
                        </span>
                      </div>
                      <pre className="num overflow-x-auto rounded-lg px-4 py-3.5 text-[12px] leading-[1.65] text-t3 whitespace-pre-wrap">
                        {declared}
                      </pre>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-8">
                  <div>
                    <span className="label">What it means</span>
                    <p className="mt-3 text-[13px] leading-[1.62] text-t2">
                      {proven
                        ? "The server did this when it was executed in an isolated container. It is reproduced behaviour, not an inference from the source."
                        : "A static rule matched the source. Nothing executed the server to reproduce it, so it remains a candidate."}
                    </p>
                  </div>
                  <div>
                    <span className="label">Remediation</span>
                    <p className="mt-3 text-[13px] leading-[1.62] text-t2">
                      {finding.remediation}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </motion.li>
  );
}

export function Findings() {
  const findings = useStore((s) => s.findings);
  const phase = useStore((s) => s.phase);
  const [sort, setSort] = useState<Sort>("severity");
  const enter = useEntrance();

  const sorted = useMemo(() => {
    const copy = [...findings];
    if (sort === "rule") return copy.sort((a, b) => a.id.localeCompare(b.id));
    if (sort === "proof")
      return copy.sort(
        (a, b) =>
          Number(b.confidence === "confirmed") - Number(a.confidence === "confirmed") ||
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
      );
    return copy.sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id),
    );
  }, [findings, sort]);

  if (findings.length === 0 || phase === "scanning" || phase === "synthesizing") return null;

  return (
    <motion.section
      aria-labelledby="findings-title"
      initial={enter ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.6 }}
      className="px-6 pt-24 sm:px-10 lg:px-14"
    >
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-4">
        <h2 id="findings-title" className="flex items-baseline gap-3">
          <span className="label">Findings</span>
          <span className="num text-[12px] text-t3">{findings.length}</span>
        </h2>

        <div
          role="group"
          aria-label="Sort findings"
          className="flex items-center gap-0.5 rounded-full p-0.5"
          style={{ background: "var(--color-p1)" }}
        >
          {(["severity", "proof", "rule"] as Sort[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              aria-pressed={sort === s}
              className="press relative rounded-full px-3.5 py-2"
            >
              {sort === s ? (
                <motion.span
                  layoutId="sort-pill"
                  className="absolute inset-0 rounded-full"
                  style={{ background: "var(--color-p3)" }}
                  transition={{ duration: 0.28, ease: EASE_MOVE }}
                />
              ) : null}
              <span
                className="label relative"
                style={{ color: sort === s ? "var(--color-t1)" : undefined }}
              >
                {s}
              </span>
            </button>
          ))}
        </div>
      </div>

      <ul className="flex flex-col">
        {sorted.map((f, i) => (
          <Row key={`${f.id}-${f.file ?? ""}-${f.line ?? ""}`} finding={f} index={i} />
        ))}
      </ul>
    </motion.section>
  );
}
