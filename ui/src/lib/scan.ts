import { ToolError, callTool } from "./mcp";
import { buildDraft } from "./draft";
import { findingsFromReport, mergeFindings, summarize, verdictOf, warrantsReport } from "./report";
import { STAGE_BUDGET, useStore } from "../store";
import type { Finding, Manifest } from "../types";

function isLocalPath(target: string): boolean {
  return !/^https?:\/\//i.test(target);
}

export function validateTarget(target: string): string | null {
  const value = target.trim();
  if (!value) return "Enter a repository URL.";
  if (isLocalPath(value)) return null; // the probe server accepts local paths too
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "That is not a valid URL.";
  }
  if (url.protocol !== "https:") return "Only https URLs are accepted.";
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return "The URL must point at a repository (owner/repo).";
  return null;
}

const message = (error: unknown): string =>
  error instanceof ToolError || error instanceof Error ? error.message : String(error);

/**
 * clone → manifest → (static ‖ dynamic) → synthesis → human review.
 *
 * Every stage transition below is driven by a real tool result. Nothing is
 * simulated, and no timer stands in for work.
 */
export async function runAudit(rawTarget: string): Promise<void> {
  const store = useStore.getState();
  const target = rawTarget.trim();
  const local = isLocalPath(target);

  store.beginScan(target);
  if (!local) store.rememberUrl(target);

  // Reflect the audited target in the URL so a run can be linked to. Prefill
  // only — arriving at such a link never starts a scan on its own.
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("target", target);
    window.history.replaceState(null, "", url);
  } catch {
    /* history is unavailable in some embedded contexts */
  }
  const { setStage, fail } = useStore.getState();

  // ---------------------------------------------------------------- acquire
  let targetPath: string;
  if (local) {
    targetPath = target;
    setStage("clone", { state: "skipped", note: "local path" });
  } else {
    setStage("clone", { state: "active", startedAt: Date.now(), budgetMs: STAGE_BUDGET.clone });
    try {
      const result = await callTool<{ target: string }>("clone_target", { repo_url: target });
      targetPath = result.target;
      setStage("clone", { state: "done", endedAt: Date.now() });
    } catch (error) {
      setStage("clone", { state: "failed", endedAt: Date.now() });
      fail(message(error));
      return;
    }
  }
  useStore.getState().setTargetPath(targetPath);

  // --------------------------------------------------------------- manifest
  setStage("manifest", { state: "active", startedAt: Date.now() });
  try {
    const result = await callTool<{ manifests: Record<string, string>; skipped: string[] }>(
      "read_target_manifest",
      { target_dir: targetPath },
    );
    const manifests: Manifest[] = Object.entries(result.manifests ?? {}).map(([name, body]) => ({
      name,
      body,
    }));
    useStore.getState().setManifests(manifests);
    setStage("manifest", { state: "done", endedAt: Date.now(), note: `${manifests.length} files` });
    if (result.skipped?.length) {
    }
  } catch (error) {
    // Manifest reading is context, not a gate — the scans can still run.
    setStage("manifest", { state: "failed", endedAt: Date.now() });
  }

  // ------------------------------------------------- static ‖ dynamic lanes
  const now = Date.now();
  setStage("static", { state: "active", startedAt: now, budgetMs: STAGE_BUDGET.static });
  setStage("dynamic", { state: "active", startedAt: now, budgetMs: STAGE_BUDGET.dynamic });

  let sampleData = false;

  const staticLane = (async (): Promise<Finding[]> => {
    try {
      const report = await callTool<Record<string, unknown>>("static_audit", {
        target_dir: targetPath,
      });
      if (report.sample_data === true) sampleData = true;
      const findings = findingsFromReport(report, "static");
      setStage("static", {
        state: "done",
        endedAt: Date.now(),
        note: `${findings.length} candidates`,
      });
      return findings;
    } catch (error) {
      setStage("static", { state: "failed", endedAt: Date.now() });
      return [];
    }
  })();

  const dynamicLane = (async (): Promise<Finding[]> => {
    try {
      const report = await callTool<Record<string, unknown>>("full_audit", {
        target_dir: targetPath,
        allow_degraded: true,
      });
      if (report.sample_data === true) sampleData = true;
      const findings = findingsFromReport(report, "full").filter((f) => f.source === "dynamic");
      setStage("dynamic", {
        state: "done",
        endedAt: Date.now(),
        note: `${findings.length} confirmed`,
      });
      return findings;
    } catch (error) {
      const detail = message(error);
      const unavailable = /docker/i.test(detail);
      setStage("dynamic", {
        state: unavailable ? "skipped" : "failed",
        endedAt: Date.now(),
        note: unavailable ? "no sandbox" : undefined,
      });
      return [];
    }
  })();

  const [staticFindings, dynamicFindings] = await Promise.all([staticLane, dynamicLane]);

  const staticState = useStore.getState().stages.find((s) => s.id === "static")?.state;
  const dynamicState = useStore.getState().stages.find((s) => s.id === "dynamic")?.state;
  if (staticState === "failed" && dynamicFindings.length === 0) {
    fail("The scan engine returned no usable report. Nothing could be analysed.");
    return;
  }

  // -------------------------------------------------------------- synthesis
  setStage("synthesis", { state: "active", startedAt: Date.now() });
  useStore.getState().setPhase("synthesizing");
  useStore.getState().setSampleData(sampleData);

  const findings = mergeFindings(staticFindings, dynamicFindings);
  const summary = summarize(findings);
  let verdict = verdictOf(summary);

  // A CLEAN verdict is misleading when no dynamic probe actually ran — only
  // static analysis was performed. Surface that as DEGRADED so the operator
  // knows the absence of findings may just mean the sandbox was unavailable.
  if (verdict === "CLEAN" && (dynamicState === "skipped" || dynamicState === "failed")) {
    verdict = "DEGRADED";
  }

  useStore.getState().setResults(findings, summary, verdict);

  setStage("synthesis", { state: "done", endedAt: Date.now(), note: verdict });

  // ---------------------------------------------------------- human review
  if (warrantsReport(summary)) {
    const draft = buildDraft(target, findings, summary, sampleData);
    useStore.getState().setDraft(draft);
    setStage("review", { state: "awaiting", startedAt: Date.now() });
    useStore.getState().setPhase("awaiting_approval");
  } else {
    setStage("review", { state: "skipped", note: "not warranted" });
    setStage("file", { state: "skipped", note: "not warranted" });
    useStore.getState().setPhase("complete");
  }
}

/** The one write action in the product. Only ever called from an explicit click. */
export async function fileIssue(): Promise<void> {
  const { draftIssue, setStage, setFiled, setPhase, failFiling } = useStore.getState();
  if (!draftIssue) return;

  setPhase("filing");
  setStage("review", { state: "done", endedAt: Date.now(), note: "authorised" });
  setStage("file", { state: "active", startedAt: Date.now() });

  try {
    const result = await callTool<{ url: string; number: number; repo: string }>(
      "file_github_issue",
      {
        repo_url: draftIssue.repoUrl,
        title: draftIssue.title,
        body: draftIssue.body,
        labels: draftIssue.labels,
      },
    );
    setStage("file", { state: "done", endedAt: Date.now(), note: `#${result.number}` });
    setFiled(result);
  } catch (error) {
    setStage("review", { state: "awaiting" });
    failFiling(message(error));
  }
}

/** Declining is a real outcome, recorded like any other. */
export function declineFiling(): void {
  const { setStage, setPhase, setDraft } = useStore.getState();
  setStage("review", { state: "done", endedAt: Date.now(), note: "declined" });
  setStage("file", { state: "skipped", note: "declined" });
  setPhase("complete");
  setDraft(null);
}
