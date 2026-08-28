import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "../../lib/util";

/**
 * Ribbons of light that follow the cursor, between the plasma and the content.
 *
 * Sourced from threejs-components, but installed and pinned rather than pulled
 * from a CDN at runtime the way the reference does: an `import()` of a
 * jsdelivr URL is an unpinned third party in the critical path of a security
 * console, it cannot be code-split or cached with the rest of the app, and it
 * simply fails behind a proxy. As a real dependency it is a lazy chunk like
 * any other.
 *
 * The library binds its pointer listeners to document.body, not to the canvas,
 * so the canvas MUST stay pointer-events:none — it covers the whole viewport,
 * and the effect keeps working regardless.
 *
 * It also constructs itself with `size: "parent"`, meaning it takes its
 * dimensions from canvas.parentNode.offsetHeight. The canvas therefore needs a
 * parent that is exactly the viewport: rendered as a bare child of the app root
 * it inherited the whole scrollable document, so on a long page the drawing
 * surface was thousands of pixels tall and the trail came out scaled up to
 * match. Hence the wrapper below — it is load-bearing, not markup habit.
 */

// The console's own two channel hues plus a navy from the plasma behind it.
// Not the reference's magenta and gold: in a system where seven hues carry
// meaning, #f5365c is the colour of a critical finding, and painting it across
// the background of a security tool says something untrue.
const TUBE_COLORS = ["#6dc3f0", "#57d8b4", "#3b5a8c"];
const LIGHT_COLORS = ["#6dc3f0", "#57d8b4", "#8fd8ff", "#4b5a7f"];
// The reference runs 200. Dimmed only slightly, and only here — dimming at the
// source AND at the layer's opacity AND choosing in-family colours was three
// reductions stacked on one effect, which is how it ended up invisible.
const LIGHT_INTENSITY = 180;

export function TubesCursor({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const still = usePrefersReducedMotion();

  useEffect(() => {
    // Decorative motion that tracks the pointer. Under reduced motion it is
    // not dimmed, it is never downloaded.
    if (still) return;

    let handle: { dispose(): void } | null = null;
    let cancelled = false;

    import("threejs-components/build/cursors/tubes1.min.js")
      .then(({ default: createTubes }) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        handle = createTubes(canvas, {
          tubes: {
            colors: TUBE_COLORS,
            lights: { intensity: LIGHT_INTENSITY, colors: LIGHT_COLORS },
          },
        });
      })
      // A decorative layer must never take the page with it. Anything here —
      // a blocked chunk, a WebGL failure, a throw inside init — leaves the
      // console running with one fewer ornament.
      .catch((error) => console.error("TubesCursor failed to initialise:", error));

    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, [still]);

  return (
    <div aria-hidden="true" className={className}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
