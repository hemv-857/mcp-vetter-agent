import type { DraftIssue, Finding, Summary } from "../types";

/**
 * What to call the target on screen. A URL names it by owner/repo; a local
 * path names it by its last two segments, because everything left of those is
 * whose machine it is. Returning the absolute path put the identifying end of
 * it past the truncation — the heading read `/Users/someone/Deskt…`.
 */
export function repoSlug(target: string): string {
  try {
    const url = new URL(target);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length >= 2) return `${segments[0]}/${segments[1]!.replace(/\.git$/, "")}`;
  } catch {
    const segments = target.split("/").filter(Boolean);
    if (segments.length >= 2) return segments.slice(-2).join("/");
  }
  return target;
}

function location(finding: Finding): string {
  if (!finding.file) return "";
  return finding.line ? ` — \`${finding.file}:${finding.line}\`` : ` — \`${finding.file}\``;
}

/**
 * Builds the report a maintainer actually receives. Only reported findings go
 * in; nothing is inferred, and confirmed findings are kept distinct from static
 * candidates so the report does not overstate what was proven.
 */
export function buildDraft(
  repoUrl: string,
  findings: Finding[],
  summary: Summary,
  sampleData: boolean,
): DraftIssue {
  const slug = repoSlug(repoUrl);
  const confirmed = findings.filter((f) => f.confidence === "confirmed");
  const candidates = findings.filter((f) => f.confidence !== "confirmed");

  const section = (finding: Finding) =>
    [
      `### ${finding.id} — ${finding.title}`,
      "",
      `**Severity:** ${finding.severity}  `,
      `**OWASP Agentic Top 10:** ${finding.owaspCategory}  `,
      `**Confidence:** ${
        finding.confidence === "confirmed"
          ? `confirmed by a live probe${finding.probe ? ` (${finding.probe})` : ""}`
          : "static candidate, not corroborated by a dynamic probe"
      }${location(finding)}`,
      "",
      "**Evidence**",
      "",
      "```",
      finding.evidence,
      "```",
      "",
      `**Remediation:** ${finding.remediation}`,
      "",
    ].join("\n");

  const body = [
    `An automated security audit of \`${slug}\` reported **${summary.total}** finding${
      summary.total === 1 ? "" : "s"
    } that warrant maintainer attention.`,
    "",
    `| Severity | Count |`,
    `| --- | --- |`,
    `| CRITICAL | ${summary.critical} |`,
    `| HIGH | ${summary.high} |`,
    `| MEDIUM | ${summary.medium} |`,
    `| LOW | ${summary.low} |`,
    "",
    confirmed.length
      ? `${confirmed.length} finding${confirmed.length === 1 ? " was" : "s were"} confirmed by executing the server inside an isolated container. The remainder are static candidates.`
      : "All findings below are static candidates. No dynamic probe corroborated them.",
    "",
    "---",
    "",
    ...(confirmed.length ? ["## Confirmed by dynamic probe", "", ...confirmed.map(section)] : []),
    ...(candidates.length ? ["## Static candidates", "", ...candidates.map(section)] : []),
    "---",
    "",
    sampleData
      ? "> **Note:** this report was generated from replayed sample data, not a live scan of this repository."
      : "Reported by MCP Vetting. Findings map to the OWASP Agentic Top 10. A human reviewed and authorised this report before it was filed.",
  ].join("\n");

  return {
    title: `Security audit: ${summary.critical + summary.high} high-risk finding${
      summary.critical + summary.high === 1 ? "" : "s"
    } in ${slug.split("/").pop() ?? slug}`,
    body,
    labels: ["security", "vulnerability"],
    targetRepo: slug,
    repoUrl,
  };
}
