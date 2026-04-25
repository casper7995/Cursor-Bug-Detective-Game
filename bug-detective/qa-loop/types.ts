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
  | "cloud-recording"
  | "artifacts-ready"
  | "analyzing"
  | "assessed"
  | "planned"
  | "needs-approval"
  | "sent-to-cursor"
  | "implementing"
  | "pr-ready"
  | "passed"
  | "blocked";

export type PendingNextStep = "assess" | "plan" | "implement" | "complete";

export type CloudAgentRole = "record" | "plan" | "implement";

export interface QaCloudRunRef {
  role: CloudAgentRole;
  agentId: string;
  runId?: string;
  status?: string;
  startedAt: string;
  completedAt?: string;
}

export interface QaRunCloud {
  recordAgentId?: string;
  recordRunId?: string;
  planAgentId?: string;
  planRunId?: string;
  implementAgentId?: string;
  implementRunId?: string;
  lastPrUrl?: string;
  latestArtifactAgentId?: string;
  runs?: Partial<Record<CloudAgentRole, QaCloudRunRef>>;
}

export interface CloudArtifactSnapshot {
  path: string;
  size?: number;
  updatedAt?: string;
  sourceAgentId?: string;
  listedAt: string;
}

export type ArtifactDownloadStatus = "pending" | "downloaded" | "failed";

export interface DownloadedArtifact {
  path: string;
  relativePath: string;
  localPath?: string;
  size?: number;
  updatedAt?: string;
  downloadedAt: string;
  status: ArtifactDownloadStatus;
  error?: string;
}

export type CockpitPhase =
  | "idle"
  | "cloud-recording"
  | "artifacts-ready"
  | "downloading"
  | "analyzing"
  | "review-ready"
  | "sent-to-cursor"
  | "implementing"
  | "blocked";

export interface CockpitJob {
  id: string;
  label: string;
  status: "queued" | "running" | "done" | "failed";
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface QaCockpitState {
  phase: CockpitPhase;
  lastActionAt?: string;
  messages?: string[];
  jobs?: CockpitJob[];
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
  artifactSnapshots?: CloudArtifactSnapshot[];
  downloadedArtifacts?: DownloadedArtifact[];
  cockpit?: QaCockpitState;
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
