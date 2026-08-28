export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

type FindingSource = "static" | "dynamic";

/** Static rules say "maybe". Only a live probe in isolation says "yes". */
export type Confidence = "candidate" | "confirmed" | "needs_review";

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  owaspCategory: string;
  source: FindingSource;
  confidence: Confidence;
  evidence: string;
  remediation: string;
  file?: string;
  line?: number;
  probe?: string;
  /** Evidence from the static lane — what reading the source showed. */
  read?: string;
  /** Evidence from the dynamic lane — what running it in isolation showed. */
  ran?: string;
}

export interface Summary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export type Verdict = "HIGH" | "MEDIUM" | "LOW" | "CLEAN";

/** The stages of the investigation, in order. Drives the spine. */
export type StageId =
  | "clone"
  | "manifest"
  | "static"
  | "dynamic"
  | "synthesis"
  | "review"
  | "file";

export type StageState =
  | "pending"
  | "active"
  | "done"
  | "skipped"
  | "failed"
  | "awaiting";

export interface Stage {
  id: StageId;
  state: StageState;
  startedAt?: number;
  endedAt?: number;
  /** Real timeout budget of the underlying tool, in ms. Drives honest progress. */
  budgetMs?: number;
  note?: string;
}

export interface Manifest {
  name: string;
  body: string;
}

export interface DraftIssue {
  title: string;
  body: string;
  labels: string[];
  targetRepo: string;
  repoUrl: string;
}

export interface FiledIssue {
  url: string;
  number: number;
  repo: string;
}

export interface Health {
  status: string;
  dockerAvailable: boolean;
  devFixtures: boolean;
  githubConfigured: boolean;
}

export type Connection = "connecting" | "connected" | "disconnected";

export type Phase =
  | "idle"
  | "scanning"
  | "synthesizing"
  | "awaiting_approval"
  | "filing"
  | "filed"
  | "complete"
  | "error";
