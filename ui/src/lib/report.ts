import type { Confidence, Finding, Severity, Summary, Verdict } from "../types";

/**
 * Rule catalogue from docs/API_REFERENCE.md. Used only to fill gaps: whatever
 * the scanner reports for a finding always wins over this table.
 */
const RULES: Record<string, { title: string; severity: Severity; owasp: string }> = {
  "VULN-001": { title: "Unsafe execution in tool handler", severity: "HIGH", owasp: "A3: Injection" },
  "VULN-002": { title: "Hardcoded credentials", severity: "HIGH", owasp: "A2: Cryptographic Failures" },
  "VULN-003": { title: "Missing input validation", severity: "MEDIUM", owasp: "A6: Vulnerable Components" },
  "VULN-004": { title: "Unrestricted file access", severity: "HIGH", owasp: "A1: Broken Access Control" },
  "VULN-005": { title: "Excessive permissions", severity: "MEDIUM", owasp: "A5: Security Misconfiguration" },
  "VULN-006": { title: "Insecure prompt construction", severity: "MEDIUM", owasp: "A3: Injection" },
  "VULN-007": { title: "Missing authentication", severity: "HIGH", owasp: "A7: Auth Failures" },
  "VULN-008": { title: "Out-of-scope execution", severity: "CRITICAL", owasp: "A7: Breakout" },
  "VULN-009": { title: "Oversized arguments", severity: "MEDIUM", owasp: "A4: Insecure Design" },
  "VULN-010": { title: "Injection payloads", severity: "HIGH", owasp: "A3: Injection" },
  "VULN-011": { title: "Malformed schema input", severity: "MEDIUM", owasp: "A4: Insecure Design" },
};

/** Rules 008-011 are the Docker-sandboxed probes. */
const DYNAMIC_RULES = new Set(["VULN-008", "VULN-009", "VULN-010", "VULN-011"]);

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asSeverity(value: unknown, fallback: Severity): Severity {
  const upper = asString(value).toUpperCase();
  return upper === "CRITICAL" || upper === "HIGH" || upper === "MEDIUM" || upper === "LOW"
    ? upper
    : fallback;
}

/**
 * The probe server's report shape is not fully settled: docs/API_REFERENCE.md
 * documents `id`, the engine's own tests assert `rule_id`. Accept both rather
 * than betting on one, and never drop a finding because a key was missing.
 */
function normalizeFinding(raw: unknown, scanType: "static" | "full"): Finding | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const id = asString(record.rule_id) || asString(record.id) || asString(record.rule);
  if (!id) return null;
  const rule = RULES[id];

  const declaredSource = asString(record.source).toLowerCase();
  const source =
    declaredSource === "dynamic" || declaredSource === "static"
      ? (declaredSource as "dynamic" | "static")
      : DYNAMIC_RULES.has(id) && scanType === "full"
        ? "dynamic"
        : "static";

  const declaredConfidence = asString(record.confidence ?? record.status).toLowerCase();
  let confidence: Confidence = source === "dynamic" ? "confirmed" : "candidate";
  if (declaredConfidence === "confirmed") confidence = "confirmed";
  else if (declaredConfidence === "needs_review") confidence = "needs_review";
  else if (declaredConfidence === "candidate") confidence = "candidate";

  const line = record.line;

  return {
    id,
    title: asString(record.title) || rule?.title || id,
    severity: asSeverity(record.severity, rule?.severity ?? "MEDIUM"),
    owaspCategory:
      asString(record.owasp_category) || asString(record.owasp) || rule?.owasp || "Unmapped",
    source,
    confidence,
    evidence: asString(record.evidence) || asString(record.snippet) || "No evidence captured.",
    remediation: asString(record.remediation) || asString(record.fix) || "No remediation supplied.",
    file: asString(record.file) || asString(record.path) || undefined,
    line: typeof line === "number" ? line : undefined,
    probe: asString(record.probe) || undefined,
  };
}

export function findingsFromReport(
  report: Record<string, unknown>,
  scanType: "static" | "full",
): Finding[] {
  const raw = Array.isArray(report.findings) ? report.findings : [];
  return raw
    .map((entry) => normalizeFinding(entry, scanType))
    .filter((entry): entry is Finding => entry !== null);
}

/**
 * A dynamic probe corroborating a static candidate is the same defect, not two —
 * but both exposures are kept. READ is what the source showed, RAN is what
 * executing it showed, and the interface is built on the difference between
 * them, so discarding either would discard the product's whole argument.
 */
export function mergeFindings(a: Finding[], b: Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();

  for (const finding of [...a, ...b]) {
    const key = `${finding.id}:${finding.file ?? ""}:${finding.line ?? ""}`;
    const existing = byKey.get(key);
    const side = finding.source === "dynamic" ? "ran" : "read";

    if (!existing) {
      byKey.set(key, { ...finding, [side]: finding.evidence });
      continue;
    }

    // Merge the two exposures of one defect. Confirmed wins the headline fields.
    const winner =
      existing.confidence !== "confirmed" && finding.confidence === "confirmed"
        ? { ...finding }
        : { ...existing };

    byKey.set(key, {
      ...winner,
      read: existing.read ?? finding.read ?? (side === "read" ? finding.evidence : undefined),
      ran: existing.ran ?? finding.ran ?? (side === "ran" ? finding.evidence : undefined),
    });
  }

  return [...byKey.values()].sort(
    (x, y) =>
      SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity] || x.id.localeCompare(y.id),
  );
}

export function summarize(findings: Finding[]): Summary {
  const summary: Summary = { total: findings.length, critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) {
    if (finding.severity === "CRITICAL") summary.critical += 1;
    else if (finding.severity === "HIGH") summary.high += 1;
    else if (finding.severity === "MEDIUM") summary.medium += 1;
    else summary.low += 1;
  }
  return summary;
}

export function verdictOf(summary: Summary): Verdict {
  if (summary.critical > 0 || summary.high > 0) return "HIGH";
  if (summary.medium > 0) return "MEDIUM";
  if (summary.low > 0) return "LOW";
  return "CLEAN";
}

/** A public security report is only warranted by a CRITICAL or HIGH finding. */
export function warrantsReport(summary: Summary): boolean {
  return summary.critical > 0 || summary.high > 0;
}

