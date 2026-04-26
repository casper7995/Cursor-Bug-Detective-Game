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
export type CockpitCloudAgentRole = CloudAgentRole | "custom";

export interface QaCloudRunRef {
  role: CloudAgentRole;
  agentId: string;
  runId?: string;
  status?: string;
  startedAt: string;
  completedAt?: string;
}

/** Ad-hoc cloud agents started from the cockpit command center (not record/plan/implement presets). */
export interface QaCustomCloudAgentEntry {
  agentId: string;
  /** Role or name prefix passed at start (e.g. plan, record, my-review). */
  roleLabel: string;
  runId?: string;
  startedAt: string;
}

export interface QaCloudAgentRef {
  role: CockpitCloudAgentRole;
  agentId: string;
  runId?: string;
  displayName?: string;
  status?: string;
  startedAt: string;
  completedAt?: string;
  selectedAt?: string;
  lastPromptPreview?: string;
  /** Full text of the last follow-up (not compact). */
  lastFollowUpText?: string;
  /** From Cloud Agents API or fallback `https://cursor.com/agents?id=…`. */
  dashboardUrl?: string;
  /** Repo-relative path to `agent-conversations/<agentId>.json`. */
  conversationPath?: string;
  lastConversationSyncAt?: string;
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
  selectedAgentId?: string;
  selectedRunId?: string;
  agents?: QaCloudAgentRef[];
  customCloudAgents?: QaCustomCloudAgentEntry[];
  runs?: Partial<Record<CloudAgentRole, QaCloudRunRef>>;
}

/** Inferred or assigned mapping for a playable (`.webm` / `.mp4`) cloud artifact. */
export interface CloudPlayableArtifactClassification {
  ext: ".webm" | ".mp4";
  /** Target minigame when high confidence, from override, or both. */
  slot?: MinigameKey;
  confidence: "high" | "low";
  reason: string;
  /** Set when `cockpit.artifactSlotOverrides[path]` was applied. */
  fromOverride?: boolean;
}

export interface CloudArtifactSnapshot {
  path: string;
  size?: number;
  updatedAt?: string;
  sourceAgentId?: string;
  listedAt: string;
  /** Only set for playable video artifacts. */
  classification?: CloudPlayableArtifactClassification;
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
  | "cloud-agent-running"
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

export type FocusedLoopStage =
  | "idle"
  | "send-findings"
  | "implement"
  | "record"
  | "artifacts"
  | "assess"
  | "score-check";

export type FocusedLoopStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "interrupted";

/** Background minigame tighten loop: send scoped findings → implement → record → download → Gemini (slot-only). */
export interface QaCockpitFocusedLoop {
  slot: MinigameKey;
  targetScore: number;
  attempt: number;
  maxAttempts: number;
  status: FocusedLoopStatus;
  stage: FocusedLoopStage;
  lastScore?: number;
  cancelRequested?: boolean;
  agentIds?: {
    plan?: string;
    implement?: string;
    record?: string;
  };
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  /** When status is done, true if lastScore >= targetScore. */
  success?: boolean;
}

export interface QaCockpitState {
  phase: CockpitPhase;
  lastActionAt?: string;
  messages?: string[];
  jobs?: CockpitJob[];
  /** Single active focused QA loop; server-driven async job. */
  focusedLoop?: QaCockpitFocusedLoop;
  /**
   * User-assigned minigame slot for a cloud path that did not high-confidence
   * infer (or to override). Key = exact SDK `path` string.
   */
  artifactSlotOverrides?: Record<string, MinigameKey>;
  /**
   * Filled after artifact download: newest video by cloud `updatedAt` (fallback: download time).
   * Shown in the cockpit as "Newest download" on the latest clip.
   */
  latestSyncWebm?: {
    relativePath: string;
    slot: MinigameKey;
    cloudUpdatedAt?: string;
    /** Original SDK artifact path when a loose name was mapped to `videos/<slot>.<ext>`. */
    sourceCloudPath?: string;
    /** True when the clip landed in that slot only because of `artifactSlotOverrides`. */
    manualOverride?: boolean;
  };
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
