import { ToolError, callTool } from "./mcp";
import { buildDraft } from "./draft";
import { findingsFromReport, mergeFindings, summarize, verdictOf, warrantsReport } from "./report";
import { STAGE_BUDGET, useStore } from "../store";
import type { Finding, Manifest } from "../types";

export function isLocalPath(target: string): boolean {
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
 * Every stage transition and every log line below is driven by a real tool
 * result. Nothing is simulated, and no timer stands in for work.
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
  const { setStage, log_, fail } = useStore.getState();

  // ---------------------------------------------------------------- acquire
  let targetPath: string;
  if (local) {
    targetPath = target;
    setStage("clone", { state: "skipped", note: "local path" });
    log_({
      stage: "clone",
      step: "Local target",
      detail: target,
      kind: "info",
      machine: true,
    });
  } else {
    setStage("clone", { state: "active", startedAt: Date.now(), budgetMs: STAGE_BUDGET.clone });
    log_({ stage: "clone", step: "Cloning", detail: target, kind: "info" });
    try {
      const result = await callTool<{ target: string }>("clone_target", { repo_url: target });
      targetPath = result.target;
      setStage("clone", { state: "done", endedAt: Date.now() });
      log_({
        stage: "clone",
        step: "Acquired",
        detail: targetPath,
        kind: "success",
        machine: true,
      });
    } catch (error) {
      setStage("clone", { state: "failed", endedAt: Date.now() });
      log_({ stage: "clone", step: "Clone failed", detail: message(error), kind: "error" });
      fail(message(error));
      return;
    }
  }
  useStore.getState().setTargetPath(targetPath);

  // --------------------------------------------------------------- manifest
  setStage("manifest", { state: "active", startedAt: Date.now() });
  log_({ stage: "manifest", step: "Reading declarations", detail: "*.yaml, *.yml", kind: "info" });
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
    log_({
      stage: "manifest",
      step: manifests.length ? "Declared surface" : "No manifests",
      detail: manifests.length
        ? manifests.map((m) => m.name).join("  ")
        : "The server declares no YAML manifest.",
      kind: manifests.length ? "success" : "warning",
      machine: manifests.length > 0,
    });
    if (result.skipped?.length) {
      log_({
        stage: "manifest",
        step: "Skipped",
        detail: result.skipped.join(", "),
        kind: "warning",
      });
    }
  } catch (error) {
    // Manifest reading is context, not a gate — the scans can still run.
    setStage("manifest", { state: "failed", endedAt: Date.now() });
    log_({ stage: "manifest", step: "Could not read", detail: message(error), kind: "warning" });
  }

  // ------------------------------------------------- static ‖ dynamic lanes
  const now = Date.now();
  setStage("static", { state: "active", startedAt: now, budgetMs: STAGE_BUDGET.static });
  setStage("dynamic", { state: "active", startedAt: now, budgetMs: STAGE_BUDGET.dynamic });
  log_({ stage: "static", step: "Static analysis", detail: "AST rules, VULN-001..007", kind: "info" });
  log_({
    stage: "dynamic",
    step: "Dynamic probes",
    detail: "sandboxed execution, VULN-008..011",
    kind: "info",
  });

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
      log_({
        stage: "static",
        step: "Static complete",
        detail: findings.length
          ? `${findings.length} candidate${findings.length === 1 ? "" : "s"}: ${findings.map((f) => f.id).join(" ")}`
          : "No static rule fired.",
        kind: findings.length ? "warning" : "success",
        machine: findings.length > 0,
      });
      return findings;
    } catch (error) {
      setStage("static", { state: "failed", endedAt: Date.now() });
      log_({ stage: "static", step: "Static failed", detail: message(error), kind: "error" });
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
      log_({
        stage: "dynamic",
        step: "Probes complete",
        detail: findings.length
          ? `${findings.length} confirmed in isolation: ${findings.map((f) => f.id).join(" ")}`
          : "No dynamic probe fired.",
        kind: findings.length ? "warning" : "success",
        machine: findings.length > 0,
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
      log_({
        stage: "dynamic",
        step: unavailable ? "Probes unavailable" : "Probes failed",
        detail: unavailable
          ? "Docker is not available on the probe host. Static analysis only; nothing can be confirmed by execution."
          : detail,
        kind: "warning",
      });
      return [];
    }
  })();

  const [staticFindings, dynamicFindings] = await Promise.all([staticLane, dynamicLane]);

  const staticState = useStore.getState().stages.find((s) => s.id === "static")?.state;
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
  const verdict = verdictOf(summary);
  useStore.getState().setResults(findings, summary, verdict);

  setStage("synthesis", { state: "done", endedAt: Date.now(), note: verdict });
  log_({
    stage: "synthesis",
    step: "Verdict",
    detail:
      verdict === "CLEAN"
        ? "No findings. Nothing to report."
        : `${verdict} risk — ${summary.total} finding${summary.total === 1 ? "" : "s"}, ${
            findings.filter((f) => f.confidence === "confirmed").length
          } confirmed by execution.`,
    kind: verdict === "CLEAN" ? "success" : "warning",
  });

  // ---------------------------------------------------------- human review
  if (warrantsReport(summary)) {
    const draft = buildDraft(target, findings, summary, sampleData);
    useStore.getState().setDraft(draft);
    setStage("review", { state: "awaiting", startedAt: Date.now() });
    useStore.getState().setPhase("awaiting_approval");
    log_({
      stage: "review",
      step: "Human review required",
      detail:
        "A public security report has been drafted. Filing it is irreversible, so the system stops here.",
      kind: "human",
    });
  } else {
    setStage("review", { state: "skipped", note: "not warranted" });
    setStage("file", { state: "skipped", note: "not warranted" });
    useStore.getState().setPhase("complete");
    log_({
      stage: "review",
      step: "No report warranted",
      detail: "No CRITICAL or HIGH finding. Nothing is filed and no approval is needed.",
      kind: "success",
    });
  }
}

/** The one write action in the product. Only ever called from an explicit click. */
export async function fileIssue(): Promise<void> {
  const { draftIssue, log_, setStage, setFiled, setPhase, failFiling } = useStore.getState();
  if (!draftIssue) return;

  setPhase("filing");
  setStage("review", { state: "done", endedAt: Date.now(), note: "authorised" });
  setStage("file", { state: "active", startedAt: Date.now() });
  log_({
    stage: "file",
    step: "Authorised by operator",
    detail: `Filing on ${draftIssue.targetRepo}`,
    kind: "human",
  });

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
    log_({
      stage: "file",
      step: "Filed",
      detail: result.url,
      kind: "success",
      machine: true,
    });
  } catch (error) {
    log_({ stage: "file", step: "Filing failed", detail: message(error), kind: "error" });
    setStage("review", { state: "awaiting" });
    failFiling(message(error));
  }
}

/** Declining is a real outcome, recorded like any other. */
export function declineFiling(): void {
  const { setStage, setPhase, log_, setDraft } = useStore.getState();
  setStage("review", { state: "done", endedAt: Date.now(), note: "declined" });
  setStage("file", { state: "skipped", note: "declined" });
  setPhase("complete");
  setDraft(null);
  log_({
    stage: "file",
    step: "Declined by operator",
    detail: "The report was not filed. The findings above remain available.",
    kind: "human",
  });
}
