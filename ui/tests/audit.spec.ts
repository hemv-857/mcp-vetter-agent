import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

/**
 * The one flow the product exists for: a target goes in, a verdict comes out,
 * and the machine stops at the boundary instead of publishing. This needs a
 * live probe server — there is no mock, because a mocked audit would assert
 * that the console can render a fiction.
 */
const FIXTURE = fileURLToPath(new URL("../../fixtures/vulnerable_server", import.meta.url));

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // The one control is disabled until the console is actually connected, so
  // "can I press investigate" is the same question as "is the probe server up".
  const reachable = await expect(page.getByRole("button", { name: "investigate" }))
    .toBeEnabled({ timeout: 15_000 })
    .then(() => true, () => false);
  test.skip(!reachable, "no probe server on the configured origin");
});

test("an audit reaches a verdict and stops at the human boundary", async ({ page }) => {
  const input = page.getByLabel("Repository of the MCP server to investigate");
  await input.fill(FIXTURE);
  await input.press("Enter");

  await expect(page.getByRole("heading", { name: "High risk" })).toBeVisible({ timeout: 30_000 });

  const gate = page.getByRole("heading", { name: "The system stops here." });
  await expect(gate).toBeVisible();

  // Nothing may leave the machine on its own: no receipt, and the authorize
  // control stays shut until a person acknowledges what filing does.
  await expect(page.getByRole("heading", { name: /^#\d+$/ })).toHaveCount(0);
  const authorize = page.getByRole("button", { name: "Hold to authorize" });
  await expect(authorize).toBeDisabled();
  // The input is sr-only and the label is the pointer target, which is what a
  // person actually presses; a keyboard reader focuses the input and hits Space.
  await page.getByText("I have read this report", { exact: false }).click();
  await expect(page.getByRole("checkbox")).toBeChecked();
  // A local path has no repository to file against, so the gate stays shut for
  // a stated reason rather than opening onto nothing.
  await expect(page.getByText("No repository to file against.", { exact: false })).toBeVisible();
});

test("declining is an outcome, not a dead end", async ({ page }) => {
  const input = page.getByLabel("Repository of the MCP server to investigate");
  await input.fill(FIXTURE);
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "The system stops here." })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Don’t file it" }).click();
  await expect(page.getByRole("heading", { name: "You declined to file." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Investigate another server" })).toBeVisible();
});
