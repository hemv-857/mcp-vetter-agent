import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useStore } from "../../store";
import { runAudit, validateTarget } from "../../lib/scan";
import { cn } from "../../lib/util";
import { EASE_OUT } from "../shared/tokens";

/**
 * Window chrome and readiness lamp in one. These are the mac traffic lights,
 * but the hues are the console's own — critical, medium and ran are already a
 * red, an amber and a green — so the idiom costs the palette nothing.
 */
const LAMPS = [
  { key: "red", token: "var(--color-critical)" },
  { key: "amber", token: "var(--color-medium)" },
  { key: "green", token: "var(--color-ran)" },
] as const;

/**
 * The one thing to do on the landing stage, and the brightest element in the
 * viewport. Not a marketing hero input — an instrument's entry: it reports its
 * own readiness, refuses a malformed target, and hands off to the investigation.
 *
 * Dressed as a terminal window, because that is what the operator is actually
 * doing: naming a target and running something against it. The three lights are
 * mac window chrome and the readiness lamp at once — all three always carry
 * their hue so the chrome reads, and the one that matches the current state is
 * the one that is lit. That is the same fact the old single dot reported, in
 * the idiom of the window it now sits in.
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

  // Exactly one light is lit, and it is the same state machine the dot ran on.
  const lamp = busy ? "amber" : problem || !connected ? "red" : "green";
  const status = busy
    ? "Investigating"
    : problem
      ? "Target is not valid"
      : connected
        ? "Probe server ready"
        : "Probe server offline";

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
        className="field relative flex flex-col overflow-hidden rounded-xl"
        // The ring and surface are CSS `:focus-within`; motion only carries the
        // physical lift, on a spring so it has weight rather than a linear fade.
        animate={{ y: focused ? -2 : 0 }}
        transition={{ type: "spring", duration: 0.42, bounce: 0.18 }}
      >
        {/* Title bar */}
        <div
          className="flex items-center gap-3 border-b px-4 py-2.5"
          style={{
            borderColor: "var(--color-line)",
            background: "oklch(0% 0 0 / 0.24)",
          }}
        >
          <span aria-hidden="true" className="flex shrink-0 items-center gap-[7px]">
            {LAMPS.map(({ key, token }) => (
              <motion.span
                key={key}
                className="keep-motion block h-[10px] w-[10px] rounded-full"
                style={{ background: token }}
                // All three keep their hue so the chrome still reads as a
                // window; only the one matching the state comes up to full.
                animate={{
                  opacity: lamp === key ? (busy && !still ? [1, 0.42, 1] : 1) : 0.26,
                  boxShadow: lamp === key ? `0 0 8px ${token}` : `0 0 0px ${token}`,
                }}
                transition={
                  busy && !still && lamp === key
                    ? {
                        opacity: {
                          duration: 1.6,
                          repeat: Infinity,
                          ease: "easeInOut",
                        },
                      }
                    : { duration: 0.2 }
                }
              />
            ))}
          </span>
          <span className="label mx-auto truncate">target — mcp-vet</span>
          {/* Balances the lamps so the title sits optically centred. */}
          <span aria-hidden="true" className="w-[41px] shrink-0" />
          <span role="status" aria-live="polite" className="sr-only">
            {status}
          </span>
        </div>

        {/* Prompt line. Narrow viewports stack the control under the field
            rather than squeezing a repository URL into 110px of remaining
            room. */}
        <div className="flex flex-col sm:flex-row sm:items-stretch">
          <div className="flex min-w-0 flex-1 items-center gap-2 py-3.5 pl-4 sm:py-4">
            <span
              aria-hidden="true"
              className="shrink-0 font-mono text-[15px] leading-none"
              style={{ color: "var(--color-ran)" }}
            >
              $
            </span>
            <span
              aria-hidden="true"
              className="shrink-0 font-mono text-[15px] leading-none text-t3"
            >
              vet
            </span>

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
              className="min-w-0 flex-1 bg-transparent pr-2 pl-0 font-mono text-[16px] tracking-[-0.012em] text-t1 outline-none placeholder:text-t4"
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
              "press group relative m-[7px] flex h-[48px] shrink-0 items-center justify-center gap-2.5",
              "w-[calc(100%-14px)] rounded-[7px] px-5 font-mono text-[13px] whitespace-nowrap",
              "sm:h-auto sm:w-auto",
              "transition-[background-color,color,box-shadow] duration-200 ease-[var(--ease-out)]",
              "hover:not-disabled:bg-[color-mix(in_oklch,var(--color-read)_22%,transparent)]",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
            // Minimal, because it lives inside a terminal window and a glossy
            // filled pill was the one thing in that window pretending to be a
            // web page. A rule and a tinted ground is what a prompt's own
            // action looks like; the weight it loses as a slab it wins back
            // from being the only blue rule on the surface.
            style={{
              backgroundColor: busy
                ? "var(--color-p3)"
                : "color-mix(in oklch, var(--color-read) 11%, transparent)",
              color: busy ? "var(--color-t2)" : "var(--color-read)",
              boxShadow: busy
                ? "inset 0 0 0 1px var(--color-line-2)"
                : "inset 0 0 0 1px color-mix(in oklch, var(--color-read) 42%, transparent)",
            }}
          >
            {busy ? "investigating…" : "investigate"}
            <span
              aria-hidden="true"
              className="grid shrink-0 place-items-center transition-transform duration-200 ease-[var(--ease-out)] group-hover:not-disabled:translate-x-[2px]"
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
        </div>
      </motion.div>

      <AnimatePresence>
        {showList ? (
          <motion.ul
            id="recent"
            role="listbox"
            aria-label="Recent targets"
            initial={{ opacity: 0, y: -8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: -6,
              scale: 0.99,
              transition: { duration: 0.13 },
            }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="contain-scroll absolute top-[calc(100%+10px)] right-0 left-0 z-30 origin-top overflow-hidden rounded-xl p-1.5"
            style={{
              background: "var(--color-p2)",
              boxShadow: "0 0 0 1px var(--color-line-2), 0 28px 60px -30px oklch(0% 0 0 / 0.95)",
            }}
          >
            {suggestions.map((entry, i) => (
              // The listbox owns options, not list items: the <li> is markup
              // for the CSS, so it steps out of the accessibility tree.
              <li key={entry} role="presentation">
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
            className="absolute top-[calc(100%+12px)] left-1 font-mono text-[12px]"
            style={{ color: "var(--color-high)" }}
          >
            <span aria-hidden="true">vet: </span>
            {problem}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
