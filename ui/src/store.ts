import { create } from "zustand";
import type {
  Connection,
  DraftIssue,
  Finding,
  FiledIssue,
  Health,
  Manifest,
  Phase,
  Stage,
  StageId,
  StageState,
  Summary,
  Verdict,
} from "./types";

const RECENT_KEY = "mcp-vetting.recent";

export const STAGE_ORDER: StageId[] = [
  "clone",
  "manifest",
  "static",
  "dynamic",
  "synthesis",
  "review",
  "file",
];

export const STAGE_LABEL: Record<StageId, string> = {
  clone: "Acquire target",
  manifest: "Read declarations",
  static: "Static analysis",
  dynamic: "Dynamic probes",
  synthesis: "Synthesis",
  review: "Human review",
  file: "File report",
};

/** Real tool timeouts from probe_server/server.py — progress is measured against these. */
export const STAGE_BUDGET: Partial<Record<StageId, number>> = {
  clone: 120_000,
  static: 30_000,
  dynamic: 300_000,
};

function freshStages(): Stage[] {
  return STAGE_ORDER.map((id) => ({ id, state: "pending" as StageState }));
}

/**
 * A run writes its target into `?target=`. Reading it back is what makes that
 * link worth anything: arriving at one prefills the field. Prefill only — a
 * link never starts a scan, because a scan clones and executes a stranger's
 * code.
 */
function readTarget(): string {
  try {
    return new URLSearchParams(window.location.search).get("target") ?? "";
  } catch {
    return "";
  }
}

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

interface AuditState {
  // connection
  connection: Connection;
  connected: boolean;
  health: Health | null;

  // input
  repoUrl: string;
  recent: string[];

  // progress
  phase: Phase;
  stages: Stage[];
  targetPath: string | null;
  scanStartedAt: number | null;

  // output
  manifests: Manifest[];
  findings: Finding[];
  summary: Summary | null;
  verdict: Verdict | null;
  /** True when the probe server replayed a captured report instead of scanning. */
  sampleData: boolean;

  // the write path
  draftIssue: DraftIssue | null;
  filedIssue: FiledIssue | null;
  approvalAcknowledged: boolean;

  error: string | null;
  errorTitle: string | null;

  // actions
  setConnection: (connection: Connection, health?: Health | null) => void;
  setRepoUrl: (url: string) => void;
  rememberUrl: (url: string) => void;
  beginScan: (url: string) => void;
  setStage: (id: StageId, patch: Partial<Omit<Stage, "id">>) => void;
  setTargetPath: (path: string) => void;
  setManifests: (manifests: Manifest[]) => void;
  setResults: (findings: Finding[], summary: Summary, verdict: Verdict) => void;
  setSampleData: (sample: boolean) => void;
  setPhase: (phase: Phase) => void;
  setDraft: (draft: DraftIssue | null) => void;
  updateDraft: (patch: Partial<Pick<DraftIssue, "title" | "body">>) => void;
  setAcknowledged: (value: boolean) => void;
  setFiled: (filed: FiledIssue) => void;
  fail: (message: string) => void;
  failFiling: (message: string) => void;
  clearError: () => void;
  reset: () => void;
}

export const useStore = create<AuditState>()((set, get) => ({
  connection: "connecting",
  connected: false,
  health: null,

  repoUrl: readTarget(),
  recent: readRecent(),

  phase: "idle",
  stages: freshStages(),
  targetPath: null,
  scanStartedAt: null,

  manifests: [],
  findings: [],
  summary: null,
  verdict: null,
  sampleData: false,

  draftIssue: null,
  filedIssue: null,
  approvalAcknowledged: false,

  error: null,
  errorTitle: null,

  setConnection: (connection, health) =>
    set((state) => ({
      connection,
      connected: connection === "connected",
      health: health === undefined ? state.health : health,
    })),

  setRepoUrl: (repoUrl) => set({ repoUrl }),

  rememberUrl: (url) =>
    set((state) => {
      const recent = [url, ...state.recent.filter((entry) => entry !== url)].slice(0, 5);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
      } catch {
        /* non-fatal */
      }
      return { recent };
    }),

  beginScan: (repoUrl) =>
    set({
      repoUrl,
      phase: "scanning",
      stages: freshStages(),
      targetPath: null,
      scanStartedAt: Date.now(),
      manifests: [],
      findings: [],
      summary: null,
      verdict: null,
      sampleData: false,
      draftIssue: null,
      filedIssue: null,
      approvalAcknowledged: false,
      error: null,
      errorTitle: null,
    }),

  setStage: (id, patch) =>
    set((state) => ({
      stages: state.stages.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)),
    })),

  setTargetPath: (targetPath) => set({ targetPath }),
  setManifests: (manifests) => set({ manifests }),
  setResults: (findings, summary, verdict) => set({ findings, summary, verdict }),
  setSampleData: (sampleData) => set({ sampleData }),
  setPhase: (phase) => set({ phase }),
  setDraft: (draftIssue) => set({ draftIssue }),

  updateDraft: (patch) =>
    set((state) => ({ draftIssue: state.draftIssue ? { ...state.draftIssue, ...patch } : null })),

  setAcknowledged: (approvalAcknowledged) => set({ approvalAcknowledged }),
  setFiled: (filedIssue) => set({ filedIssue, phase: "filed" }),

  /**
   * Filing failed, but the operator is still standing at the gate: keep the
   * draft and their acknowledgement so a retry is one hold away.
   */
  failFiling: (message) =>
    set((state) => ({
      error: message,
      errorTitle: "The report was not filed",
      phase: "awaiting_approval",
      stages: state.stages.map((stage) =>
        stage.id === "file" ? { ...stage, state: "failed" } : stage,
      ),
    })),

  fail: (message) => {
    const { stages } = get();
    set({
      error: message,
      errorTitle: "The audit stopped",
      phase: "error",
      stages: stages.map((stage) => (stage.state === "active" ? { ...stage, state: "failed" } : stage)),
    });
  },

  clearError: () => set({ error: null, errorTitle: null }),

  reset: () =>
    set({
      phase: "idle",
      stages: freshStages(),
      targetPath: null,
      scanStartedAt: null,
      manifests: [],
      findings: [],
      summary: null,
      verdict: null,
      sampleData: false,
      draftIssue: null,
      filedIssue: null,
      approvalAcknowledged: false,
      error: null,
      errorTitle: null,
    }),
}));
