import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useStore } from "../../store";
import { runAudit, validateTarget } from "../../lib/scan";
import { cn } from "../../lib/util";
import { EASE_OUT } from "../shared/tokens";

/**
 * The one thing to do on the landing stage, and the brightest element in the
 * viewport. Not a marketing hero input — an instrument's entry: it reports its
 * own readiness, refuses a malformed target, and hands off to the investigation.
 */
export function TargetField() {
  const repoUrl = useStore((s) => s.repoUrl);
  const setRepoUrl = useStore((s) => s.setRepoUrl);
  const recent = useStore((s) => s.recent);
  const phase = useStore((s) => s.phase);
  const connected = useStore((s) => s.connected);

  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const still = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const busy = phase === "scanning" || phase === "synthesizing" || phase === "filing";
  const problem = touched ? validateTarget(repoUrl) : null;
  const canRun = connected && !busy;
  const suggestions = recent.filter((r) => r !== repoUrl.trim());
  const showList = open && focused && suggestions.length > 0;

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) {
        e.preventDefault();
        start(repoUrl);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canRun, repoUrl]);

  function start(target: string) {
    setTouched(true);
    setOpen(false);
    if (validateTarget(target)) {
      inputRef.current?.focus();
      return;
    }
    void runAudit(target);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showList && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((i) => (i + d + suggestions.length) % suggestions.length);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const picked = showList && highlight >= 0 ? suggestions[highlight] : undefined;
      if (picked) {
        setRepoUrl(picked);
        start(picked);
      } else start(repoUrl);
    }
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <motion.div
        // Narrow viewports stack the control under the field rather than
        // squeezing a repository URL into 110px of remaining room.
        className="field relative flex flex-col rounded-xl sm:h-[72px] sm:flex-row sm:items-stretch"
        // The ring and surface are CSS `:focus-within`; motion only carries the
        // physical lift, on a spring so it has weight rather than a linear fade.
        animate={{ y: focused ? -2 : 0 }}
        transition={{ type: "spring", duration: 0.42, bounce: 0.18 }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3.5 py-4 pl-5 sm:py-0">
          <motion.span
            className="keep-motion block rounded-full"
            animate={{
              width: 6,
              height: 6,
              backgroundColor: busy
                ? "var(--color-read)"
                : problem
                  ? "var(--color-high)"
                  : connected
                    ? "var(--color-ran)"
                    : "var(--color-p3)",
              opacity: busy && !still ? [1, 0.28, 1] : 1,
            }}
            transition={
              busy && !still
                ? {
                    opacity: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
                    backgroundColor: { duration: 0.2 },
                  }
                : { duration: 0.2 }
            }
          />
          <span className="label hidden shrink-0 sm:block">Target</span>

          <label htmlFor="target" className="sr-only">
            Repository of the MCP server to investigate
          </label>
          <input
            id="target"
            name="target"
            ref={inputRef}
            value={repoUrl}
            onChange={(e) => {
              setRepoUrl(e.target.value);
              setHighlight(-1);
            }}
            onFocus={() => {
              setFocused(true);
              setOpen(true);
            }}
            onBlur={() => {
              setFocused(false);
              setTouched(true);
            }}
            onKeyDown={onKeyDown}
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            placeholder="github.com/owner/mcp-server"
            role="combobox"
            aria-expanded={showList}
            aria-controls={showList ? "recent" : undefined}
            aria-activedescendant={showList && highlight >= 0 ? `recent-${highlight}` : undefined}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? "target-error" : undefined}
            className="min-w-0 flex-1 bg-transparent pr-2 pl-0 font-mono text-[16px] sm:pl-4 tracking-[-0.012em] text-t1 outline-none placeholder:text-t4"
          />
        </div>

        {/* Colour is CSS, never an animation target. Driving the primary
            control's background through motion meant that any starved frame
            left it stranded mid-interpolation — measured once at alpha 0.18
            with the wrong text colour, i.e. the one button that starts the
            product rendered as a washed-out smear. A transition degrades to
            the correct end state; an animation does not. */}
        <button
          type="button"
          onClick={() => start(repoUrl)}
          disabled={!canRun}
          className={cn(
            "press group relative m-[7px] flex h-[52px] shrink-0 items-center justify-between gap-3",
            "w-[calc(100%-14px)] rounded-[9px] pr-[7px] pl-6 text-[14px] font-semibold whitespace-nowrap",
            "sm:h-auto sm:w-auto",
            "transition-[background-color,color,box-shadow,filter] duration-200 ease-[var(--ease-out)]",
            "hover:not-disabled:brightness-[1.07]",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
          style={{
            backgroundColor: busy ? "var(--color-p3)" : "var(--color-ran)",
            color: busy ? "var(--color-t2)" : "var(--color-bg)",
            boxShadow: busy
              ? "inset 0 1px 0 oklch(100% 0 0 / 0.06)"
              : "inset 0 1px 0 oklch(100% 0 0 / 0.32), 0 10px 34px -12px color-mix(in oklch, var(--color-ran) 75%, transparent)",
          }}
        >
          {busy ? "Investigating…" : "Investigate"}
          {/* the arrow is never naked — it sits in its own well and leans on hover */}
          <span
            aria-hidden="true"
            className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[7px] transition-transform duration-200 ease-[var(--ease-out)] group-hover:not-disabled:translate-x-[2px] sm:h-[44px] sm:w-[44px]"
            style={{ background: busy ? "transparent" : "oklch(0% 0 0 / 0.16)" }}
          >
            {busy ? (
              <span
                className="keep-motion block h-[13px] w-[13px] rounded-full border-[1.6px] border-current border-t-transparent"
                style={still ? undefined : { animation: "spin 780ms linear infinite" }}
              />
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2.5 7h9M7.5 3l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        </button>
      </motion.div>

      <AnimatePresence>
        {showList ? (
          <motion.ul
            id="recent"
            role="listbox"
            aria-label="Recent targets"
            initial={{ opacity: 0, y: -8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99, transition: { duration: 0.13 } }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="contain-scroll absolute top-[calc(100%+10px)] right-0 left-0 z-30 origin-top overflow-hidden rounded-xl p-1.5"
            style={{
              background: "var(--color-p2)",
              boxShadow: "0 0 0 1px var(--color-line-2), 0 28px 60px -30px oklch(0% 0 0 / 0.95)",
            }}
          >
            {suggestions.map((entry, i) => (
              <li key={entry}>
                <button
                  type="button"
                  id={`recent-${i}`}
                  role="option"
                  aria-selected={i === highlight}
                  onPointerEnter={() => setHighlight(i)}
                  onClick={() => {
                    setRepoUrl(entry);
                    start(entry);
                  }}
                  className={cn(
                    "block w-full truncate rounded-lg px-3.5 py-2.5 text-left font-mono text-[12.5px] transition-colors duration-150",
                    i === highlight ? "bg-p3 text-t1" : "text-t3",
                  )}
                >
                  {entry}
                </button>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {problem ? (
          <motion.p
            id="target-error"
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            className="absolute top-[calc(100%+12px)] left-1 text-[12px]"
            style={{ color: "var(--color-high)" }}
          >
            {problem}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
