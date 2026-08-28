import { test, expect } from "@playwright/test";

/**
 * Each of these is a bug that actually shipped during this project rather than
 * a hypothetical. The background layers are canvases with no accessible name
 * and no text, so nothing else can tell whether they painted at all.
 *
 * The two canvases are matched by DOM order because that order IS the layer
 * contract: BackgroundField renders first (the plasma, z-0), the tubes second
 * (z-1). Anything that reorders them is a regression worth failing on.
 */
const PLASMA = 0;
const TUBES = 1;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("the landing shows its one control", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Paste the repository link." })).toBeVisible();
  await expect(page.getByLabel("Repository of the MCP server to investigate")).toBeVisible();
  // Terminal chrome — the visible marker that the field rendered as a window.
  await expect(page.getByText("target — mcp-vet")).toBeVisible();
});

test("both background layers paint at viewport size", async ({ page }) => {
  const canvases = page.locator("canvas");
  await expect(canvases).toHaveCount(2);

  const viewport = page.viewportSize()!;
  for (const index of [PLASMA, TUBES]) {
    // The tubes canvas is a replaced element: until its library loads and sets
    // an explicit size it sits at the intrinsic 300x150. That is exactly the
    // shape of "the effect never loaded", which is how it reached the user.
    await expect
      .poll(async () => (await canvases.nth(index).boundingBox())?.width ?? 0, { timeout: 20_000 })
      .toBeGreaterThan(viewport.width * 0.9);
  }
});

test("the tubes layer cannot hide the background beneath it", async ({ page }) => {
  // Blending sits on whichever element owns the layer — the canvas or its
  // wrapper — so ask for the effective value rather than pinning the markup.
  const blend = await page.evaluate(() => {
    for (let el: Element | null = document.querySelectorAll("canvas")[1]!; el; el = el.parentElement) {
      const mode = getComputedStyle(el).mixBlendMode;
      if (mode !== "normal") return mode;
    }
    return "normal";
  });
  // Its renderer composites over opaque black. Without screen blending it is a
  // black sheet across the viewport and the plasma looks deleted.
  expect(blend).toBe("screen");

  const [plasmaZ, tubesZ] = await page.evaluate(() => {
    // The z-index lives on the canvas for one layer and on the wrapper for the
    // other, so walk up to whichever element actually carries it.
    const effectiveZ = (start: Element) => {
      for (let el: Element | null = start; el; el = el.parentElement) {
        const z = getComputedStyle(el).zIndex;
        if (z !== "auto") return Number(z);
      }
      return 0;
    };
    const all = [...document.querySelectorAll("canvas")];
    return [effectiveZ(all[0]!), effectiveZ(all[1]!)];
  });
  // Background below, effect above it, content above both.
  expect(Number(plasmaZ)).toBeLessThan(Number(tubesZ));
  expect(Number(tubesZ)).toBeLessThan(10);
});

test("the background still reaches every edge once the parallax has run", async ({ page }) => {
  const box = (await page.locator("canvas").nth(PLASMA).boundingBox())!;
  const viewport = page.viewportSize()!;

  // The property that matters is coverage, not overscan. BackgroundField is
  // inset -140px and drifts up to -120px, and on the landing — which does not
  // scroll — useScroll already reports maximum progress, so this measures the
  // worst case directly: 20px of margin at the bottom. It was a -48px gap when
  // the inset was -10%, which is the bug this pins down.
  expect(box.y).toBeLessThanOrEqual(0);
  expect(box.x).toBeLessThanOrEqual(0);
  expect(box.y + box.height).toBeGreaterThan(viewport.height);
  expect(box.x + box.width).toBeGreaterThan(viewport.width);
});

test("the trail is drawn at viewport size, not document size", async ({ page }) => {
  // The library sizes itself from canvas.parentNode.offsetHeight. Given a
  // parent that is the whole scrollable document it built a drawing surface
  // thousands of pixels tall and rendered the trail scaled up to match, which
  // is what "the trail is too big on the investigation page" actually was.
  const { parentHeight, viewportHeight } = await page.evaluate(() => {
    const canvas = document.querySelectorAll("canvas")[1] as HTMLCanvasElement;
    return {
      parentHeight: canvas.parentElement!.offsetHeight,
      viewportHeight: window.innerHeight,
    };
  });
  // The backing buffer is legitimately 2x for retina; what must not grow is the
  // box the library measures.
  expect(parentHeight).toBe(viewportHeight);
});

test("an invalid target is refused rather than run", async ({ page }) => {
  const input = page.getByLabel("Repository of the MCP server to investigate");
  // A plain string is a valid local path, so it is *accepted* and the probe
  // server decides — this asserted the audit failing, not the field refusing.
  // A non-https URL is the case the field itself rejects, before any tool call.
  await input.fill("http://github.com/owner/repo");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Only https URLs are accepted.");
});
