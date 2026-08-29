import { useStore } from "../../store";
import { cn } from "../../lib/util";

/**
 * One readout per capability the probe server actually reports. A missing
 * capability is stated, never hidden — an audit is worth less when a lane
 * cannot run, and the operator has to know that before they read a verdict.
 *
 * A degraded environment should look deliberate, not broken: the dot carries
 * the alarm, the label stays quiet, and the reason is one hover away.
 */
function Readout({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <span className="group relative flex items-center gap-[7px]" tabIndex={0}>
      <span
        aria-hidden="true"
        className="block h-[5px] w-[5px] shrink-0 rounded-full"
        style={{
          background: ok ? "var(--color-ran)" : "var(--color-t3)",
          boxShadow: ok ? "0 0 7px var(--color-ran)" : "0 0 7px var(--color-t3)",
        }}
      />
      <span className="label" style={{ color: ok ? "var(--color-t4)" : "var(--color-t3)" }}>
        {label}
        {ok ? "" : ": cloud"}
      </span>
      <span className="sr-only">: {detail}</span>
      <span
        // The sr-only span above already carries this text, so the visual
        // tooltip is hidden from assistive tech rather than read out twice.
        aria-hidden="true"
        // Opens DOWNWARD. These readouts live in the sticky top bar, a dozen
        // pixels from the top of the viewport, so a tooltip above them opened
        // off the top of the screen and was unreadable.
        //
        // Centred on its own readout, not flush left. Left-flush, the last
        // readout in the bar reached past the right edge — which widened the
        // document and dragged every `fixed inset-0` stage off screen on a
        // phone. Width is clamped to the viewport for the same reason.
        className="pointer-events-none absolute top-[calc(100%+10px)] left-1/2 z-40 w-[min(26ch,calc(100vw-2rem))] -translate-x-1/2 origin-top scale-[0.96] rounded-md px-3 py-2.5 text-[11.5px] leading-[1.5] text-t2 opacity-0 transition-[opacity,transform] duration-150 ease-[var(--ease-out)] group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"
        style={{ background: "var(--color-p2)", boxShadow: "0 0 0 1px var(--color-line-2)" }}
      >
        {detail}
      </span>
    </span>
  );
}

export function Capabilities({ className }: { className?: string }) {
  const health = useStore((s) => s.health);
  if (!health) return null;

  return (
    <div className={cn("flex items-center gap-5 sm:gap-6", className)}>
      <Readout
        label="scanner"
        ok={!health.devFixtures}
        detail={
          health.devFixtures
            ? "The scanning engine is not installed. Reports are replayed from a captured sample, not scanned live."
            : "The scanning engine is installed. Scans run live against the target."
        }
      />
      <Readout
        label="sandbox"
        ok={health.dockerAvailable}
        detail={
          health.dockerAvailable
            ? "Docker is available. The target can be executed in isolation, so findings can be confirmed."
            : "Running in cloud mode. Static analysis and dry-run probes are active."
        }
      />
      <Readout
        label="filing"
        ok={health.githubConfigured}
        detail={
          health.githubConfigured
            ? "The probe server holds a GITHUB_TOKEN, so an authorized report can be filed."
            : "The probe server has no GITHUB_TOKEN. A report can be drafted but not filed."
        }
      />
    </div>
  );
}
