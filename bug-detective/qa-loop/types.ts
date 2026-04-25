export type MinigameKey = "runner" | "sentence" | "errand" | "tamper";
/** Same union as `MinigameKey` — kept for older docs / plan text. */
export type MinigameKind = MinigameKey;
export const MINIGAMES: readonly MinigameKey[] = [
  "runner",
  "sentence",
  "errand",
  "tamper",
] as const;

export type QaRunState =
  | "init"
  | "recording"
  | "assessed"
  | "planned"
  | "needs-approval"
  | "implementing"
  | "pr-ready"
  | "passed"
  | "blocked";

export type PendingNextStep = "assess" | "plan" | "implement" | "complete";

export interface QaRunCloud {
  recordAgentId?: string;
  planAgentId?: string;
  implementAgentId?: string;
  lastPrUrl?: string;
}

export interface RunManifestV1 {
  readonly version: 1;
  runId: string;
  createdAt: string;
  updatedAt: string;
  state: QaRunState;
  iteration: number;
  maxIterations: number;
  videos: Partial<Record<MinigameKey, string>>;
  videoDir?: string;
  pendingNextStep: PendingNextStep;
  passThreshold: number;
  scores: Partial<Record<MinigameKey, number>>;
  planApproved: boolean;
  allPassed?: boolean;
  assessmentPath?: string;
  planPath?: string;
  lastError?: string;
  cloud?: QaRunCloud;
}

export interface MinigameIssue {
  tSec: number;
  severity: "low" | "med" | "high";
  summary: string;
  evidence: string;
}

export interface MinigameDimensionScores {
  clarity: number;
  controlFeel: number;
  fun: number;
  goalReadability: number;
  visualPolish: number;
  performanceSmoothness: number;
  cursorBrandFit: number;
}

export interface MinigameAssessment {
  minigame: MinigameKey;
  issues: MinigameIssue[];
  dimensions: MinigameDimensionScores;
  score100: number;
  assessment: string;
  recommendedFixes: string[];
}

export interface QaAssessmentDocument {
  readonly version: 1;
  runId: string;
  model: string;
  createdAt: string;
  byMinigame: Record<MinigameKey, MinigameAssessment>;
  gate: { passThreshold: number; allPassed: boolean; failing: MinigameKey[] };
}
