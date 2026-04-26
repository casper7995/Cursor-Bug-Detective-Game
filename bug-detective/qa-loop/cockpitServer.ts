import "./loadEnv.js";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Run } from "@cursor/february";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  downloadRunArtifacts,
  enrichArtifactSnapshots,
  listRunArtifacts,
  resumeArtifactAgent,
  type ArtifactAgent,
  type DownloadRunArtifactsOptions,
  type DownloadRunArtifactsResult,
} from "./cloudArtifacts.js";
import { runAssessForRunId } from "./cli.js";
import { getAssessModel, getAssessModelOptions } from "./env.js";
import { geminiAssessmentPromptOverviewForRun } from "./geminiAssess.js";
import {
  extractCloudRunId,
  fetchCloudAgentConversation as fetchCloudAgentConversationDefault,
  fetchCloudAgentStatus as fetchCloudAgentStatusDefault,
  getCloudRun as getCloudRunDefault,
  isAgentBusyError,
  resolveCloudAgentDashboardUrl as resolveCloudAgentDashboardUrlDefault,
  sendCustomFollowUpToAgent as sendCustomFollowUpToAgentDefault,
  sendFollowUpToAgent as sendFollowUpToAgentDefault,
  startCustomCloudAgent as startCustomCloudAgentDefault,
  startImplementCloudAgent as startImplementCloudAgentDefault,
  startPlanCloudAgent as startPlanCloudAgentDefault,
  startRecordingCloudAgent as startRecordingCloudAgentDefault,
  waitForPlanRunIfKnown,
  waitRunDone,
  type CloudAgentStart,
  type CloudAgentRun,
  type CloudFollowUpResult,
  type CustomCloudAgentRole,
} from "./cursorAgent.js";
import { planAgentPrompt, recordingAgentPrompt } from "./recordPrompt.js";
import {
  loadAssessment,
  writeShareBundle as writeShareBundleDefault,
} from "./report.js";
import {
  createInitialManifest,
  defaultArtifactsDir,
  listRunManifests,
  loadManifestForRunId,
  newRunId,
  nowIso,
  qaRunArtifactsRelativePath,
  saveManifest,
} from "./runStore.js";
import {
  MINIGAMES,
  type CockpitCloudAgentRole,
  type CloudAgentRole,
  type MinigameKey,
  type QaCloudAgentRef,
  type QaAssessmentDocument,
  type QaCockpitFocusedLoop,
  type QaRunCloud,
  type RunManifestV1,
} from "./types.js";

/** In-process focused loops; used to detect stale `running` state after server restart. */
const activeFocusedLoopRuns = new Set<string>();

export interface CockpitAgentListItem {
  agentId: string;
  role: CockpitCloudAgentRole | string;
  runId?: string;
  displayName?: string;
  status?: string;
  startedAt?: string;
  selectedAt?: string;
  lastPromptPreview?: string;
  source: "builtin" | "custom";
}

type JsonBody = Record<string, unknown>;

export interface CockpitApiRequest {
  method: string;
  pathname: string;
  body?: unknown;
}

export interface CockpitApiResponse {
  status: number;
  body: Record<string, any>;
}

export interface CockpitApiDeps {
  repoRoot: string;
  startRecordingCloudAgent?: (
    repoRoot: string,
    runId: string,
  ) => Promise<CloudAgentStart>;
  startPlanCloudAgent?: (
    repoRoot: string,
    runId: string,
  ) => Promise<CloudAgentStart>;
  startCustomCloudAgent?: (
    repoRoot: string,
    runId: string,
    prompt: string,
    role: CustomCloudAgentRole,
  ) => Promise<CloudAgentStart>;
  startImplementCloudAgent?: (
    repoRoot: string,
    runId: string,
  ) => Promise<CloudAgentStart>;
  sendCustomFollowUpToAgent?: (
    agentId: string,
    text: string,
  ) => Promise<CloudFollowUpResult | unknown>;
  sendFollowUpToAgent?: (
    agentId: string,
    text: string,
  ) => Promise<CloudFollowUpResult | unknown>;
  resumeArtifactAgent?: (agentId: string) => ArtifactAgent;
  runAssessForRunId?: (
    runId: string,
    options?: {
      extraInstructions?: string;
      model?: string;
      includeMinigames?: MinigameKey[];
    },
  ) => Promise<{ allPassed: boolean }>;
  writeShareBundle?: (
    repoRoot: string,
    manifest: RunManifestV1,
    assessment: QaAssessmentDocument,
    options?: {
      includeMinigames?: MinigameKey[];
      followUpInstruction?: string;
    },
  ) => Promise<void>;
  /** Cursor Cloud REST `GET /v0/agents/:id` (tests inject; defaults to `cursorAgent` helper). */
  fetchCloudAgentStatus?: (agentId: string) => Promise<unknown>;
  /** Cursor Cloud REST `GET /v0/agents/:id/conversation`. */
  fetchCloudAgentConversation?: (agentId: string) => Promise<unknown>;
  /** Resolve dashboard URL from status JSON (tests inject; defaults to `resolveCloudAgentDashboardUrl`). */
  resolveCloudAgentDashboardUrl?: (agentId: string, status: unknown) => string;
  /** Rehydrate a cloud run to wait for completion (tests inject; defaults to `getCloudRun` from `cursorAgent`). */
  getCloudRun?: (agentId: string, runId: string) => Promise<Run>;
  /** Tests: mock artifact download without cloud SDK. */
  downloadRunArtifacts?: (
    opts: DownloadRunArtifactsOptions,
  ) => Promise<DownloadRunArtifactsResult>;
}

export interface CockpitApi {
  handle: (request: CockpitApiRequest) => Promise<CockpitApiResponse>;
}

function asBody(value: unknown): JsonBody {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonBody)
    : {};
}

const FOLLOW_UP_INSTRUCTION_MAX_CHARS = 12_000;

/** Optional note appended to the assessment follow-up and saved under `share/` when exporting. */
export function parseFollowUpInstruction(body: JsonBody): string | undefined {
  const raw = body["followUpInstruction"];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    throw new Error("followUpInstruction must be a string");
  }
  const s = raw.trim();
  if (!s) return undefined;
  if (s.length > FOLLOW_UP_INSTRUCTION_MAX_CHARS) {
    throw new Error(
      `followUpInstruction must be at most ${FOLLOW_UP_INSTRUCTION_MAX_CHARS} characters`,
    );
  }
  return s;
}

/**
 * Parses `includeMinigames` from POST bodies for `/share` and `/send-findings`.
 * Omitted or full set → `undefined` (include every minigame). Otherwise ordered subset of {@link MINIGAMES}.
 */
export function parseHandoffMinigames(
  body: JsonBody,
): MinigameKey[] | undefined {
  const raw = body["includeMinigames"];
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error("includeMinigames must be an array of minigame ids");
  }
  const out: MinigameKey[] = [];
  for (const x of raw) {
    if (typeof x !== "string" || !MINIGAMES.includes(x as MinigameKey)) {
      throw new Error(
        `includeMinigames: invalid slot ${JSON.stringify(x)} (expected one of: ${MINIGAMES.join(", ")})`,
      );
    }
    const k = x as MinigameKey;
    if (!out.includes(k)) out.push(k);
  }
  if (out.length === 0) {
    throw new Error("includeMinigames must list at least one minigame");
  }
  if (out.length === MINIGAMES.length) return undefined;
  return MINIGAMES.filter((m) => out.includes(m));
}

function stringField(body: JsonBody, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(body: JsonBody, key: string): number | undefined {
  const value = body[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isMinigameKey(value: string): value is MinigameKey {
  for (const s of MINIGAMES) {
    if (s === value) return true;
  }
  return false;
}

/** POST body: `assignments` map and/or `path` + `slot` array rows. */
function parseArtifactSlotAssignments(
  body: JsonBody,
): Record<string, MinigameKey> {
  const out: Record<string, MinigameKey> = {};
  const assign = body["assignments"];
  if (assign && typeof assign === "object" && !Array.isArray(assign)) {
    for (const [k, v] of Object.entries(assign as Record<string, unknown>)) {
      if (typeof v === "string" && isMinigameKey(v)) {
        out[k] = v;
      }
    }
  }
  const list = body["pathSlotList"];
  if (Array.isArray(list)) {
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const r = row as { path?: unknown; slot?: unknown };
      if (
        typeof r.path === "string" &&
        r.path.length > 0 &&
        typeof r.slot === "string" &&
        isMinigameKey(r.slot)
      ) {
        out[r.path] = r.slot;
      }
    }
  }
  return out;
}

function assertSafeRunId(runId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId))
    throw new Error(`Unsafe run id: ${runId}`);
  return runId;
}

function assertSafeAgentIdParam(agentId: string): string {
  if (!/^[a-zA-Z0-9._:@-]+$/.test(agentId) || agentId.length > 200)
    throw new Error(`Unsafe agent id: ${agentId}`);
  return agentId;
}

export function listCockpitAgents(
  manifest: RunManifestV1,
): CockpitAgentListItem[] {
  const cloud = manifest.cloud;
  const out: CockpitAgentListItem[] = [];
  const seen = new Set<string>();
  const addBuiltin = (
    agentId: string,
    role: string,
    runId?: string,
    startedAt?: string,
  ) => {
    if (!agentId || seen.has(agentId)) return;
    seen.add(agentId);
    const item: CockpitAgentListItem = { agentId, role, source: "builtin" };
    if (runId !== undefined) item.runId = runId;
    if (startedAt !== undefined) item.startedAt = startedAt;
    out.push(item);
  };
  const roles: CloudAgentRole[] = ["record", "plan", "implement"];
  for (const role of roles) {
    const ref = cloud?.runs?.[role];
    if (ref?.agentId) addBuiltin(ref.agentId, role, ref.runId, ref.startedAt);
  }
  if (cloud?.recordAgentId) {
    addBuiltin(
      cloud.recordAgentId,
      "record",
      cloud.recordRunId,
      cloud.runs?.record?.startedAt,
    );
  }
  if (cloud?.planAgentId) {
    addBuiltin(
      cloud.planAgentId,
      "plan",
      cloud.planRunId,
      cloud.runs?.plan?.startedAt,
    );
  }
  if (cloud?.implementAgentId) {
    addBuiltin(
      cloud.implementAgentId,
      "implement",
      cloud.implementRunId,
      cloud.runs?.implement?.startedAt,
    );
  }
  for (const c of cloud?.customCloudAgents ?? []) {
    if (!c.agentId || seen.has(c.agentId)) continue;
    seen.add(c.agentId);
    const fromAgent = cloud?.agents?.find((x) => x.agentId === c.agentId);
    const item: CockpitAgentListItem = {
      agentId: c.agentId,
      role: c.roleLabel,
      source: "custom",
      startedAt: c.startedAt,
    };
    if (c.runId !== undefined) item.runId = c.runId;
    if (fromAgent?.displayName !== undefined)
      item.displayName = fromAgent.displayName;
    if (fromAgent?.status !== undefined) item.status = fromAgent.status;
    if (fromAgent?.lastPromptPreview !== undefined) {
      item.lastPromptPreview = fromAgent.lastPromptPreview;
    }
    if (fromAgent?.startedAt !== undefined)
      item.startedAt = fromAgent.startedAt;
    if (c.runId === undefined && fromAgent?.runId !== undefined) {
      item.runId = fromAgent.runId;
    }
    out.push(item);
  }
  for (const agent of cloud?.agents ?? []) {
    if (!agent.agentId || seen.has(agent.agentId)) continue;
    seen.add(agent.agentId);
    const item: CockpitAgentListItem = {
      agentId: agent.agentId,
      role: agent.role,
      source: agent.role === "custom" ? "custom" : "builtin",
    };
    if (agent.runId !== undefined) item.runId = agent.runId;
    if (agent.displayName !== undefined) item.displayName = agent.displayName;
    if (agent.status !== undefined) item.status = agent.status;
    if (agent.startedAt !== undefined) item.startedAt = agent.startedAt;
    if (agent.selectedAt !== undefined) item.selectedAt = agent.selectedAt;
    if (agent.lastPromptPreview !== undefined)
      item.lastPromptPreview = agent.lastPromptPreview;
    out.push(item);
  }
  return out;
}

function compactPromptPreview(prompt: string): string {
  const compacted = prompt.trim().replace(/\s+/g, " ");
  return compacted.length > 160 ? `${compacted.slice(0, 157)}...` : compacted;
}

function upsertCockpitAgent(
  manifest: RunManifestV1,
  entry: QaCloudAgentRef,
  opts: { select: boolean },
): QaCloudAgentRef {
  const cloud = manifest.cloud ?? {};
  const existing = cloud.agents?.find(
    (agent) => agent.agentId === entry.agentId,
  );
  const selectedAt = opts.select ? nowIso() : entry.selectedAt;
  const next: QaCloudAgentRef = {
    ...existing,
    ...entry,
    role: existing?.role ?? entry.role,
    agentId: entry.agentId,
    startedAt: existing?.startedAt ?? entry.startedAt,
    ...(selectedAt ? { selectedAt } : {}),
  };
  manifest.cloud = {
    ...cloud,
    agents: [
      ...(cloud.agents ?? []).filter(
        (agent) => agent.agentId !== entry.agentId,
      ),
      next,
    ],
    ...(opts.select ? { selectedAgentId: next.agentId } : {}),
    ...(opts.select && next.runId ? { selectedRunId: next.runId } : {}),
    ...(opts.select ? { latestArtifactAgentId: next.agentId } : {}),
  };
  return next;
}

function routeParts(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map(decodeURIComponent);
}

function appendCockpitMessage(manifest: RunManifestV1, message: string): void {
  const messages = [
    ...(manifest.cockpit?.messages ?? []),
    `${nowIso()} ${message}`,
  ].slice(-20);
  manifest.cockpit = {
    ...manifest.cockpit,
    phase: manifest.cockpit?.phase ?? "idle",
    lastActionAt: nowIso(),
    messages,
  };
}

function roleCloudPatch(
  role: CloudAgentRole,
  start: CloudAgentStart,
): QaRunCloud {
  const runRef = {
    role,
    agentId: start.agentId,
    ...(start.runId ? { runId: start.runId } : {}),
    startedAt: nowIso(),
  };
  switch (role) {
    case "record":
      return {
        recordAgentId: start.agentId,
        ...(start.runId ? { recordRunId: start.runId } : {}),
        latestArtifactAgentId: start.agentId,
        runs: { record: runRef },
      };
    case "plan":
      return {
        planAgentId: start.agentId,
        ...(start.runId ? { planRunId: start.runId } : {}),
        runs: { plan: runRef },
      };
    case "implement":
      return {
        implementAgentId: start.agentId,
        ...(start.runId ? { implementRunId: start.runId } : {}),
        runs: { implement: runRef },
      };
  }
}

function mergeCloud(
  current: QaRunCloud | undefined,
  patch: QaRunCloud,
): QaRunCloud {
  return {
    ...current,
    ...patch,
    runs: { ...current?.runs, ...patch.runs },
  };
}

/**
 * Picks a default cloud agent for artifacts and send-follow-up. Tries, in
 * order: explicit `agentId` in the POST body, stored selection, record (clip
 * producer), then custom/recently touched {@link QaCloudAgentRef} rows, then
 * plan / implement. {@link QaCloudAgentRef} is needed because some flows only
 * upsert `cloud.agents` and never add `customCloudAgents` / top-level ids.
 * Custom is placed before `planAgentId` so a stale plan id does not block
 * continuing a custom demo when `selectedAgentId` was lost.
 */
function defaultCockpitAgentId(
  manifest: RunManifestV1,
  body: JsonBody,
): string | undefined {
  const c = manifest.cloud;
  const fromAgentTable = (): string | undefined => {
    const rows = c?.agents;
    if (!rows?.length) return undefined;
    const withSelected = rows.filter(
      (a) => typeof a.selectedAt === "string" && a.selectedAt.length > 0,
    );
    if (withSelected.length) {
      withSelected.sort((a, b) =>
        (b.selectedAt ?? "").localeCompare(a.selectedAt ?? ""),
      );
      return withSelected[0]?.agentId;
    }
    return rows[rows.length - 1]?.agentId;
  };
  return (
    stringField(body, "agentId") ??
    c?.selectedAgentId ??
    c?.latestArtifactAgentId ??
    c?.recordAgentId ??
    c?.customCloudAgents?.at(-1)?.agentId ??
    fromAgentTable() ??
    c?.planAgentId ??
    c?.implementAgentId
  );
}

function artifactAgentId(manifest: RunManifestV1, body: JsonBody): string {
  const id = defaultCockpitAgentId(manifest, body);
  if (!id)
    throw new Error("No Cursor cloud agent id is available for artifacts.");
  return id;
}

async function loadRun(
  repoRoot: string,
  runId: string,
): Promise<RunManifestV1> {
  return loadManifestForRunId(repoRoot, assertSafeRunId(runId));
}

async function saveRun(
  repoRoot: string,
  manifest: RunManifestV1,
): Promise<void> {
  await saveManifest(defaultArtifactsDir(repoRoot, manifest.runId), manifest);
}

function assessmentPath(repoRoot: string, runId: string): string {
  return join(defaultArtifactsDir(repoRoot, runId), "assessment.json");
}

export function createFindingsPrompt(
  manifest: RunManifestV1,
  assessment: QaAssessmentDocument,
  options?: { includeMinigames?: MinigameKey[]; followUpInstruction?: string },
): string {
  const slots: MinigameKey[] =
    options?.includeMinigames && options.includeMinigames.length > 0
      ? MINIGAMES.filter((s) => options.includeMinigames!.includes(s))
      : [...MINIGAMES];
  const fullHandoff = slots.length === MINIGAMES.length;

  const scoreLines = slots.map((slot) => {
    const item = assessment.byMinigame[slot];
    const fixes = item.recommendedFixes.slice(0, 3).map((fix) => `  - ${fix}`);
    return [
      `- ${slot}: ${item.score100}/100`,
      `  Assessment: ${item.assessment}`,
      ...fixes,
    ].join("\n");
  });
  const lines: string[] = [
    "Bug Detective QA findings are ready for Cursor cloud follow-up.",
    `Run: ${manifest.runId}`,
    `Gate (full assessment): ${assessment.gate.allPassed ? "passed" : "failed"} threshold=${assessment.gate.passThreshold}`,
    `Failing (all minigames): ${assessment.gate.failing.join(", ") || "(none)"}`,
  ];
  if (!fullHandoff) {
    lines.push(
      `This follow-up includes only: ${slots.join(", ")} — scores and fixes below are filtered; local assessment.json is still the full run.`,
    );
  }
  lines.push(
    "",
    "Scores and recommended fixes:",
    ...scoreLines,
    "",
    `Please turn these findings into a focused implementation plan or patch. Keep output under artifacts/qa-runs/${manifest.runId}/.`,
  );
  const note = options?.followUpInstruction?.trim();
  if (note) {
    lines.push(
      "",
      "---",
      "Additional instructions (QA cockpit — fold into your plan and next steps):",
      note,
    );
  }
  return lines.join("\n");
}

export interface FocusedLoopStartParams {
  slot: MinigameKey;
  targetScore: number;
  maxAttempts: number;
  followUpInstruction?: string;
}

/** Single-minigame recording instructions for the focused QA loop. */
export function focusedRecordingPrompt(
  runId: string,
  slot: MinigameKey,
): string {
  const base = `artifacts/qa-runs/${runId}`;
  return [
    "You are a recording agent for the Bug Detective QA focused loop.",
    "Use real computer use (terminal + browser / Playwright): do not only describe steps.",
    `Record ONLY the **${slot}** minigame demo (one playable clip).`,
    "The game lives under bug-detective/ (Vite + Playwright).",
    `From bug-detective: npm run qa:record -- --local --scenario ${slot}`,
    `Write output to ${base}/videos/${slot}.webm (or .mp4) and append commands to recorder.log.`,
  ].join("\n");
}

export function parseFocusedLoopStartBody(
  body: JsonBody,
): FocusedLoopStartParams {
  const slotRaw = body["slot"];
  if (
    typeof slotRaw !== "string" ||
    !MINIGAMES.includes(slotRaw as MinigameKey)
  ) {
    throw new Error(`slot must be one of: ${MINIGAMES.join(", ")}`);
  }
  const slot = slotRaw as MinigameKey;
  const targetScore = numberField(body, "targetScore") ?? 90;
  if (
    typeof targetScore !== "number" ||
    !Number.isFinite(targetScore) ||
    targetScore < 0 ||
    targetScore > 100
  ) {
    throw new Error("targetScore must be a number from 0 to 100");
  }
  const maxAttempts = numberField(body, "maxAttempts") ?? 2;
  if (
    typeof maxAttempts !== "number" ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 10
  ) {
    throw new Error("maxAttempts must be an integer from 1 to 10");
  }
  if (body["allowImplement"] !== true) {
    throw new Error(
      "allowImplement must be true (confirm in the UI before starting the loop)",
    );
  }
  const followUpInstruction = parseFollowUpInstruction(body);
  const out: FocusedLoopStartParams = { slot, targetScore, maxAttempts };
  if (followUpInstruction !== undefined) {
    out.followUpInstruction = followUpInstruction;
  }
  return out;
}

export function createCockpitApi(deps: CockpitApiDeps): CockpitApi {
  const startRecordingCloudAgent =
    deps.startRecordingCloudAgent ?? startRecordingCloudAgentDefault;
  const startPlanCloudAgent =
    deps.startPlanCloudAgent ?? startPlanCloudAgentDefault;
  const startImplementCloudAgent =
    deps.startImplementCloudAgent ?? startImplementCloudAgentDefault;
  const startCustomCloudAgent =
    deps.startCustomCloudAgent ?? startCustomCloudAgentDefault;
  const sendCustomFollowUpToAgent =
    deps.sendCustomFollowUpToAgent ??
    deps.sendFollowUpToAgent ??
    sendCustomFollowUpToAgentDefault;
  const sendFollowUpToAgent =
    deps.sendFollowUpToAgent ?? sendFollowUpToAgentDefault;
  const resumeAgent = deps.resumeArtifactAgent ?? resumeArtifactAgent;
  const assessRun =
    deps.runAssessForRunId ??
    ((
      rid: string,
      options?: {
        extraInstructions?: string;
        model?: string;
        includeMinigames?: MinigameKey[];
      },
    ) => runAssessForRunId(rid, deps.repoRoot, options));
  const writeShareBundle = deps.writeShareBundle ?? writeShareBundleDefault;
  const fetchCloudAgentStatus =
    deps.fetchCloudAgentStatus ?? fetchCloudAgentStatusDefault;
  const fetchCloudAgentConversation =
    deps.fetchCloudAgentConversation ?? fetchCloudAgentConversationDefault;
  const resolveCloudAgentDashboardUrl =
    deps.resolveCloudAgentDashboardUrl ?? resolveCloudAgentDashboardUrlDefault;
  const getCloudRun = deps.getCloudRun ?? getCloudRunDefault;
  const downloadArtifactsFn = deps.downloadRunArtifacts ?? downloadRunArtifacts;
  /** When tests inject `downloadRunArtifacts`, skip `Agent.resume` with synthetic agent ids. */
  const downloadArtifactsIsMocked = deps.downloadRunArtifacts !== undefined;

  async function deliverAssessmentFollowUp(
    manifest: RunManifestV1,
    assessment: QaAssessmentDocument,
    opts: {
      includeMinigames?: MinigameKey[];
      followUpInstruction?: string;
      agentPick?: JsonBody;
    },
  ): Promise<{ manifest: RunManifestV1; result: CloudFollowUpResult }> {
    const agentPick = opts.agentPick ?? {};
    const handoffSlots = opts.includeMinigames;
    const followUpNote = opts.followUpInstruction;
    let targetAgentId = defaultCockpitAgentId(manifest, agentPick);
    let planRunToFinishFirst: CloudAgentRun | undefined;
    if (!targetAgentId) {
      const planStart = await startPlanCloudAgent(
        deps.repoRoot,
        manifest.runId,
      );
      manifest.cloud = mergeCloud(
        manifest.cloud,
        roleCloudPatch("plan", planStart),
      );
      targetAgentId = planStart.agentId;
      planRunToFinishFirst = planStart.run;
    } else {
      const extPlanRunId =
        manifest.cloud?.runs?.plan?.runId ?? manifest.cloud?.planRunId;
      if (extPlanRunId && manifest.cloud?.planAgentId === targetAgentId) {
        appendCockpitMessage(
          manifest,
          `Waiting for plan cloud run ${extPlanRunId} to finish before sending assessment…`,
        );
        await saveRun(deps.repoRoot, manifest);
      }
      await waitForPlanRunIfKnown(
        targetAgentId,
        manifest.cloud,
        getCloudRun,
        waitRunDone,
      );
    }

    if (planRunToFinishFirst) {
      appendCockpitMessage(
        manifest,
        "Waiting for the plan agent’s first run to finish, then sending your assessment follow-up…",
      );
      await saveRun(deps.repoRoot, manifest);
      await waitRunDone(planRunToFinishFirst);
    }

    const promptOpts: {
      includeMinigames?: MinigameKey[];
      followUpInstruction?: string;
    } = {};
    if (handoffSlots) promptOpts.includeMinigames = handoffSlots;
    if (followUpNote) promptOpts.followUpInstruction = followUpNote;
    const findingsText = createFindingsPrompt(
      manifest,
      assessment,
      Object.keys(promptOpts).length > 0 ? promptOpts : undefined,
    );
    const maxBusy = 25;
    const delayMs = 2000;
    let result: CloudFollowUpResult | undefined;
    for (let i = 0; i < maxBusy; i++) {
      try {
        result = (await sendFollowUpToAgent(
          targetAgentId,
          findingsText,
        )) as CloudFollowUpResult;
        break;
      } catch (e) {
        if (!isAgentBusyError(e) || i === maxBusy - 1) {
          throw e;
        }
        if (i === 0) {
          appendCockpitMessage(
            manifest,
            `Target cloud agent is still busy; retrying every ${delayMs / 1000}s (up to ~${Math.round(
              (maxBusy * delayMs) / 60000,
            )} min). If this persists, open the agent in Cursor and check for a stuck run.`,
          );
          await saveRun(deps.repoRoot, manifest);
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    if (result === undefined) {
      throw new Error("send-findings: no follow-up result from agent");
    }
    manifest.state = "planned";
    manifest.pendingNextStep = "implement";
    if (planRunToFinishFirst !== undefined) {
      // mergeCloud already set plan ids when we started the plan agent
    } else if (manifest.cloud?.planAgentId === targetAgentId) {
      manifest.cloud = { ...manifest.cloud, planAgentId: targetAgentId };
    } else {
      manifest.cloud = {
        ...manifest.cloud,
        selectedAgentId: targetAgentId,
      };
    }
    manifest.cockpit = {
      ...manifest.cockpit,
      phase: "sent-to-cursor",
      lastActionAt: nowIso(),
    };
    let sendMsg = handoffSlots?.length
      ? `Sent assessment follow-up (${handoffSlots.join(", ")} only) to Cursor agent ${targetAgentId}.`
      : `Sent assessment follow-up to Cursor agent ${targetAgentId}.`;
    if (followUpNote) sendMsg += " Custom handoff instructions were appended.";
    appendCockpitMessage(manifest, sendMsg);
    await saveRun(deps.repoRoot, manifest);
    return { manifest, result };
  }

  async function mergeFocusedLoop(
    runId: string,
    patch: Partial<QaCockpitFocusedLoop>,
  ): Promise<void> {
    const m = await loadRun(deps.repoRoot, runId);
    const cur = m.cockpit?.focusedLoop;
    if (!cur) throw new Error("mergeFocusedLoop: missing focusedLoop");
    const next: QaCockpitFocusedLoop = {
      ...cur,
      ...patch,
      updatedAt: nowIso(),
    };
    m.cockpit = {
      ...m.cockpit,
      phase: m.cockpit?.phase ?? "idle",
      focusedLoop: next,
    };
    await saveRun(deps.repoRoot, m);
  }

  async function reconcileStaleFocusedLoopOnLoad(
    manifest: RunManifestV1,
  ): Promise<void> {
    const fl = manifest.cockpit?.focusedLoop;
    if (!fl || fl.status !== "running") return;
    if (activeFocusedLoopRuns.has(manifest.runId)) return;
    const msg =
      "Focused loop was running when the cockpit server restarted; it did not resume automatically.";
    manifest.cockpit = {
      ...manifest.cockpit,
      phase: manifest.cockpit?.phase ?? "idle",
      focusedLoop: {
        ...fl,
        status: "interrupted",
        updatedAt: nowIso(),
        completedAt: nowIso(),
        error: msg,
      },
    };
    appendCockpitMessage(manifest, msg);
    await saveRun(deps.repoRoot, manifest);
  }

  async function applyCancelIfRequested(runId: string): Promise<boolean> {
    const m = await loadRun(deps.repoRoot, runId);
    const cur = m.cockpit?.focusedLoop;
    if (!cur?.cancelRequested || cur.status !== "running") return false;
    const doneAt = nowIso();
    m.cockpit = {
      ...m.cockpit,
      phase: m.cockpit?.phase ?? "idle",
      focusedLoop: {
        ...cur,
        status: "interrupted",
        cancelRequested: false,
        updatedAt: doneAt,
        completedAt: doneAt,
        error:
          "Focused loop stopped: cancel requested (finished current stage).",
      },
    };
    appendCockpitMessage(m, "Focused loop stopped: cancel requested.");
    await saveRun(deps.repoRoot, m);
    return true;
  }

  async function failFocusedLoop(
    runId: string,
    message: string,
    extra?: Partial<QaCockpitFocusedLoop>,
  ): Promise<void> {
    const m = await loadRun(deps.repoRoot, runId);
    const cur = m.cockpit?.focusedLoop;
    if (!cur) return;
    const doneAt = nowIso();
    m.cockpit = {
      ...m.cockpit,
      phase: m.cockpit?.phase ?? "idle",
      focusedLoop: {
        ...cur,
        ...extra,
        status: "failed",
        updatedAt: doneAt,
        completedAt: doneAt,
        error: message,
        success: false,
      },
    };
    appendCockpitMessage(m, `Focused loop failed: ${message}`);
    await saveRun(deps.repoRoot, m);
  }

  async function completeFocusedLoopSuccess(
    runId: string,
    lastScore: number,
  ): Promise<void> {
    const m = await loadRun(deps.repoRoot, runId);
    const cur = m.cockpit?.focusedLoop;
    if (!cur) return;
    const doneAt = nowIso();
    const { error: _cleared, ...curRest } = cur;
    void _cleared;
    m.cockpit = {
      ...m.cockpit,
      phase: m.cockpit?.phase ?? "idle",
      focusedLoop: {
        ...curRest,
        status: "done",
        stage: "score-check",
        lastScore,
        updatedAt: doneAt,
        completedAt: doneAt,
        success: true,
      },
    };
    appendCockpitMessage(
      m,
      `Focused loop finished: ${cur.slot} score ${lastScore} ≥ target ${cur.targetScore}.`,
    );
    await saveRun(deps.repoRoot, m);
  }

  async function runFocusedLoopJob(
    runId: string,
    params: FocusedLoopStartParams,
  ): Promise<void> {
    const { slot, targetScore, maxAttempts, followUpInstruction } = params;
    const baseNote = followUpInstruction?.trim();
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (await applyCancelIfRequested(runId)) return;

        await mergeFocusedLoop(runId, {
          attempt,
          stage: "send-findings",
          status: "running",
        });

        let m0 = await loadRun(deps.repoRoot, runId);
        const assessment0 = await loadAssessment(
          assessmentPath(deps.repoRoot, runId),
        );
        const attemptNote = [
          baseNote,
          `Focused QA auto-loop: attempt ${attempt}/${maxAttempts} for **${slot}**. Target score ${targetScore}/100. Implement, then the cockpit will request a fresh ${slot} recording and re-assess only that minigame.`,
        ]
          .filter(Boolean)
          .join("\n\n");
        const sendRes = await deliverAssessmentFollowUp(m0, assessment0, {
          includeMinigames: [slot],
          followUpInstruction: attemptNote,
        });
        m0 = sendRes.manifest;

        if (await applyCancelIfRequested(runId)) return;

        await mergeFocusedLoop(runId, { stage: "implement" });
        let m1 = await loadRun(deps.repoRoot, runId);
        m1.planApproved = true;
        m1.pendingNextStep = "implement";
        m1.state = "implementing";
        m1.cockpit = {
          ...m1.cockpit,
          phase: "implementing",
          lastActionAt: nowIso(),
        };
        await saveRun(deps.repoRoot, m1);

        const implStart = await startImplementCloudAgent(deps.repoRoot, runId);
        m1 = await loadRun(deps.repoRoot, runId);
        m1.cloud = mergeCloud(m1.cloud, roleCloudPatch("implement", implStart));
        const flImp = m1.cockpit?.focusedLoop;
        if (flImp) {
          m1.cockpit = {
            ...m1.cockpit,
            phase: m1.cockpit?.phase ?? "idle",
            focusedLoop: {
              ...flImp,
              agentIds: {
                ...flImp.agentIds,
                implement: implStart.agentId,
              },
            },
          };
        }
        appendCockpitMessage(
          m1,
          `Focused loop: implementation agent ${implStart.agentId} started.`,
        );
        await saveRun(deps.repoRoot, m1);
        const implWait = await waitRunDone(implStart.run);
        const prUrl = implWait.git?.branches?.[0]?.prUrl;
        let mImp = await loadRun(deps.repoRoot, runId);
        const implStarted = mImp.cloud?.runs?.implement?.startedAt ?? nowIso();
        mImp = {
          ...mImp,
          state: prUrl ? "pr-ready" : mImp.state,
          cloud: {
            ...mImp.cloud,
            ...(prUrl ? { lastPrUrl: prUrl } : {}),
            runs: {
              ...mImp.cloud?.runs,
              implement: {
                role: "implement",
                agentId: implStart.agentId,
                ...(implStart.runId ? { runId: implStart.runId } : {}),
                status: "finished",
                startedAt: implStarted,
                completedAt: nowIso(),
              },
            },
          },
        };
        appendCockpitMessage(
          mImp,
          prUrl
            ? `Focused loop: implement finished; PR ${prUrl}`
            : "Focused loop: implement agent run finished.",
        );
        await saveRun(deps.repoRoot, mImp);

        if (await applyCancelIfRequested(runId)) return;

        await mergeFocusedLoop(runId, { stage: "record" });
        const recStart = await startCustomCloudAgent(
          deps.repoRoot,
          runId,
          focusedRecordingPrompt(runId, slot),
          "record",
        );
        let m2 = await loadRun(deps.repoRoot, runId);
        m2.cloud = mergeCloud(m2.cloud, roleCloudPatch("record", recStart));
        const flRec = m2.cockpit?.focusedLoop;
        if (flRec) {
          m2.cockpit = {
            ...m2.cockpit,
            phase: m2.cockpit?.phase ?? "idle",
            focusedLoop: {
              ...flRec,
              agentIds: { ...flRec.agentIds, record: recStart.agentId },
            },
          };
        }
        m2.state = "cloud-recording";
        m2.cockpit = {
          ...m2.cockpit,
          phase: "cloud-recording",
          lastActionAt: nowIso(),
        };
        appendCockpitMessage(
          m2,
          `Focused loop: recording agent ${recStart.agentId} started for ${slot}.`,
        );
        await saveRun(deps.repoRoot, m2);
        await waitRunDone(recStart.run);

        if (await applyCancelIfRequested(runId)) return;

        await mergeFocusedLoop(runId, { stage: "artifacts" });
        let m3 = await loadRun(deps.repoRoot, runId);
        const artifactAgentId =
          m3.cloud?.recordAgentId ??
          m3.cloud?.latestArtifactAgentId ??
          recStart.agentId;
        m3.cockpit = {
          ...m3.cockpit,
          phase: "downloading",
          lastActionAt: nowIso(),
        };
        await saveRun(deps.repoRoot, m3);
        const dl = await downloadArtifactsFn({
          repoRoot: deps.repoRoot,
          runId,
          agent: downloadArtifactsIsMocked
            ? {
                listArtifacts: async () => [],
                downloadArtifact: async () => Buffer.alloc(0),
              }
            : resumeAgent(artifactAgentId),
          manifest: m3,
          sourceAgentId: artifactAgentId,
        });
        appendCockpitMessage(
          dl.manifest,
          `Focused loop: downloaded ${dl.downloaded.length} artifact(s) for reassessment.`,
        );
        await saveRun(deps.repoRoot, dl.manifest);

        if (await applyCancelIfRequested(runId)) return;

        await mergeFocusedLoop(runId, { stage: "assess" });
        let m4 = await loadRun(deps.repoRoot, runId);
        m4.state = "analyzing";
        m4.cockpit = {
          ...m4.cockpit,
          phase: "analyzing",
          lastActionAt: nowIso(),
        };
        await saveRun(deps.repoRoot, m4);
        await assessRun(runId, { includeMinigames: [slot] });

        await mergeFocusedLoop(runId, { stage: "score-check" });
        const assessmentFinal = await loadAssessment(
          assessmentPath(deps.repoRoot, runId),
        );
        const score = assessmentFinal.byMinigame[slot].score100;
        await mergeFocusedLoop(runId, { lastScore: score });

        if (score >= targetScore) {
          await completeFocusedLoopSuccess(runId, score);
          return;
        }
        if (attempt >= maxAttempts) {
          await failFocusedLoop(
            runId,
            `${slot} score ${score} is below target ${targetScore} after ${maxAttempts} attempt(s). Needs human review.`,
            { lastScore: score, stage: "score-check" },
          );
          return;
        }
        const mRetry = await loadRun(deps.repoRoot, runId);
        appendCockpitMessage(
          mRetry,
          `Focused loop: ${slot} score ${score} < ${targetScore}; continuing (attempt ${attempt}/${maxAttempts}).`,
        );
        await saveRun(deps.repoRoot, mRetry);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      await failFocusedLoop(runId, message);
    }
  }

  return {
    async handle(request) {
      try {
        const parts = routeParts(request.pathname);
        const body = asBody(request.body);

        if (request.method === "GET" && request.pathname === "/api/runs") {
          return {
            status: 200,
            body: { runs: await listRunManifests(deps.repoRoot) },
          };
        }
        if (request.method === "POST" && request.pathname === "/api/runs") {
          const runId = assertSafeRunId(
            stringField(body, "runId") ?? newRunId(),
          );
          await mkdir(defaultArtifactsDir(deps.repoRoot, runId), {
            recursive: true,
          });
          const passThreshold = numberField(body, "passThreshold");
          const manifest = createInitialManifest(
            runId,
            passThreshold === undefined ? {} : { passThreshold },
          );
          await saveRun(deps.repoRoot, manifest);
          return { status: 200, body: { manifest } };
        }
        if (parts[0] !== "api" || parts[1] !== "runs" || !parts[2]) {
          return { status: 404, body: { error: "Not found" } };
        }

        const runId = assertSafeRunId(parts[2]);
        if (request.method === "GET" && parts.length === 3) {
          let manifest = await loadRun(deps.repoRoot, runId);
          await reconcileStaleFocusedLoopOnLoad(manifest);
          manifest = await loadRun(deps.repoRoot, runId);
          let assessment: QaAssessmentDocument | undefined;
          try {
            assessment = await loadAssessment(
              assessmentPath(deps.repoRoot, runId),
            );
          } catch {
            assessment = undefined;
          }
          return {
            status: 200,
            body: {
              manifest,
              assessment,
              recipePrompts: {
                record: recordingAgentPrompt(runId),
                plan: planAgentPrompt(runId),
              },
              assessModel: getAssessModel(),
              assessModels: getAssessModelOptions(),
              geminiAssessmentPromptOverview:
                geminiAssessmentPromptOverviewForRun(runId),
            },
          };
        }
        if (
          request.method === "GET" &&
          parts.length === 4 &&
          parts[3] === "agents"
        ) {
          const manifest = await loadRun(deps.repoRoot, runId);
          return {
            status: 200,
            body: {
              agents: listCockpitAgents(manifest),
              selectedAgentId: manifest.cloud?.selectedAgentId,
              selectedRunId: manifest.cloud?.selectedRunId,
            },
          };
        }
        if (
          request.method === "GET" &&
          parts.length === 4 &&
          parts[3] === "recipe-prompts"
        ) {
          return {
            status: 200,
            body: {
              record: recordingAgentPrompt(runId),
              plan: planAgentPrompt(runId),
            },
          };
        }
        if (
          request.method === "GET" &&
          parts.length === 6 &&
          parts[3] === "agents" &&
          parts[5] === "details"
        ) {
          const agentId = assertSafeAgentIdParam(parts[4] ?? "");
          const manifest = await loadRun(deps.repoRoot, runId);
          const status = await fetchCloudAgentStatus(agentId);
          const conversation = await fetchCloudAgentConversation(agentId);
          const dashboardUrl = resolveCloudAgentDashboardUrl(agentId, status);
          const conversationRel = `${qaRunArtifactsRelativePath(runId)}/agent-conversations/${agentId}.json`;
          const absDir = join(
            deps.repoRoot,
            qaRunArtifactsRelativePath(runId),
            "agent-conversations",
          );
          await mkdir(absDir, { recursive: true });
          const absPath = join(absDir, `${agentId}.json`);
          const selectedRunIdKnown =
            manifest.cloud?.selectedRunId ??
            manifest.cloud?.agents?.find((a) => a.agentId === agentId)?.runId;
          const syncAt = nowIso();
          const localManifest = {
            agentId,
            qaRunId: runId,
            selectedCloudRunId: selectedRunIdKnown,
            dashboardUrl,
            status,
            conversation,
            syncAt,
          };
          await writeFile(
            absPath,
            JSON.stringify(localManifest, null, 2),
            "utf8",
          );
          const existing = manifest.cloud?.agents?.find(
            (a) => a.agentId === agentId,
          );
          const agent = upsertCockpitAgent(
            manifest,
            {
              role: existing?.role ?? "custom",
              agentId,
              ...(existing?.runId ? { runId: existing.runId } : {}),
              displayName: existing?.displayName ?? "Custom command",
              startedAt: existing?.startedAt ?? nowIso(),
              ...(existing?.status ? { status: existing.status } : {}),
              ...(existing?.lastPromptPreview
                ? { lastPromptPreview: existing.lastPromptPreview }
                : {}),
              ...(existing?.lastFollowUpText
                ? { lastFollowUpText: existing.lastFollowUpText }
                : {}),
              dashboardUrl,
              conversationPath: conversationRel,
              lastConversationSyncAt: syncAt,
            },
            { select: true },
          );
          appendCockpitMessage(
            manifest,
            `Refreshed cloud conversation manifest for ${agentId} → ${conversationRel}`,
          );
          await saveRun(deps.repoRoot, manifest);
          return {
            status: 200,
            body: {
              manifest,
              agent,
              status,
              conversation,
              dashboardUrl,
              conversationPath: conversationRel,
            },
          };
        }
        if (request.method !== "POST") {
          return { status: 405, body: { error: "Method not allowed" } };
        }

        const action = parts.slice(3).join("/");
        let manifest = await loadRun(deps.repoRoot, runId);

        if (action === "agents/start") {
          const prompt = stringField(body, "prompt");
          if (!prompt) throw new Error("prompt is required");
          const roleLabel =
            stringField(body, "role") ??
            stringField(body, "displayName") ??
            "custom";
          const friendly = stringField(body, "friendlyName")?.trim() ?? "";
          const displayNameForUi = friendly.length > 0 ? friendly : roleLabel;
          const start = await startCustomCloudAgent(
            deps.repoRoot,
            runId,
            prompt,
            roleLabel,
          );
          const startedAt = nowIso();
          const agent = upsertCockpitAgent(
            manifest,
            {
              role: "custom",
              agentId: start.agentId,
              ...(start.runId ? { runId: start.runId } : {}),
              displayName: displayNameForUi,
              status: start.run.status,
              startedAt,
              lastPromptPreview: compactPromptPreview(prompt),
            },
            { select: true },
          );
          const entry = {
            agentId: start.agentId,
            roleLabel,
            ...(start.runId ? { runId: start.runId } : {}),
            startedAt,
          };
          manifest.cloud = {
            ...manifest.cloud,
            customCloudAgents: [
              ...(manifest.cloud?.customCloudAgents ?? []).filter(
                (existing) => existing.agentId !== start.agentId,
              ),
              entry,
            ],
          };
          manifest.state = "sent-to-cursor";
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "cloud-agent-running",
            lastActionAt: nowIso(),
          };
          appendCockpitMessage(
            manifest,
            `Custom agent ${start.agentId} started (role=${roleLabel}).`,
          );
          await saveRun(deps.repoRoot, manifest);
          return {
            status: 200,
            body: {
              agent,
              agentId: start.agentId,
              ...(start.runId ? { runId: start.runId } : {}),
              manifest,
              result: start.run,
            },
          };
        }

        const followMatch = /^agents\/([^/]+)\/followup$/.exec(action);
        if (followMatch) {
          const targetAgentId = assertSafeAgentIdParam(followMatch[1] ?? "");
          const followPrompt = stringField(body, "prompt");
          if (!followPrompt) throw new Error("prompt is required");
          const result = await sendCustomFollowUpToAgent(
            targetAgentId,
            followPrompt,
          );
          const cloudRunId = extractCloudRunId(result);
          const existing = manifest.cloud?.agents?.find(
            (agent) => agent.agentId === targetAgentId,
          );
          const resultStatus =
            result && typeof result === "object" && "status" in result
              ? String((result as { status?: unknown }).status)
              : "running";
          const agent = upsertCockpitAgent(
            manifest,
            {
              role: existing?.role ?? "custom",
              agentId: targetAgentId,
              ...(cloudRunId ? { runId: cloudRunId } : {}),
              displayName: existing?.displayName ?? "Custom command",
              status: resultStatus,
              startedAt: existing?.startedAt ?? nowIso(),
              lastPromptPreview: compactPromptPreview(followPrompt),
              lastFollowUpText: followPrompt,
            },
            { select: true },
          );
          manifest.state = "sent-to-cursor";
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "cloud-agent-running",
            lastActionAt: nowIso(),
          };
          appendCockpitMessage(
            manifest,
            `Retry/follow-up sent to agent ${targetAgentId}.`,
          );
          await saveRun(deps.repoRoot, manifest);
          return { status: 200, body: { manifest, agent, result } };
        }

        if (action === "agents/select") {
          const selectId = stringField(body, "agentId");
          if (!selectId) throw new Error("agentId is required");
          assertSafeAgentIdParam(selectId);
          const runIdField = stringField(body, "runId");
          const displayName = stringField(body, "displayName");
          const existing = manifest.cloud?.agents?.find(
            (agent) => agent.agentId === selectId,
          );
          const selectedRunId = runIdField ?? existing?.runId;
          const agent = upsertCockpitAgent(
            manifest,
            {
              role: existing?.role ?? "custom",
              agentId: selectId,
              ...(selectedRunId ? { runId: selectedRunId } : {}),
              displayName:
                displayName ?? existing?.displayName ?? "Selected cloud agent",
              startedAt: existing?.startedAt ?? nowIso(),
              ...(existing?.status ? { status: existing.status } : {}),
              ...(existing?.lastPromptPreview
                ? { lastPromptPreview: existing.lastPromptPreview }
                : {}),
            },
            { select: true },
          );
          appendCockpitMessage(
            manifest,
            `Selected artifact agent ${selectId}.`,
          );
          await saveRun(deps.repoRoot, manifest);
          return { status: 200, body: { manifest, agent } };
        }

        if (action === "cloud-record") {
          manifest.state = "cloud-recording";
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "cloud-recording",
            lastActionAt: nowIso(),
          };
          appendCockpitMessage(
            manifest,
            "Started Cursor cloud recording agent.",
          );
          await saveRun(deps.repoRoot, manifest);
          const start = await startRecordingCloudAgent(deps.repoRoot, runId);
          manifest = await loadRun(deps.repoRoot, runId);
          manifest.cloud = mergeCloud(
            manifest.cloud,
            roleCloudPatch("record", start),
          );
          manifest.state = "cloud-recording";
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "cloud-recording",
            lastActionAt: nowIso(),
          };
          appendCockpitMessage(
            manifest,
            `Recording agent ${start.agentId} started.`,
          );
          await saveRun(deps.repoRoot, manifest);
          return {
            status: 200,
            body: { manifest, agentId: start.agentId, runId: start.runId },
          };
        }

        if (action === "artifacts/assign") {
          const parsed = parseArtifactSlotAssignments(body);
          const removeRaw = body["removePaths"];
          const merged: Record<string, MinigameKey> = {
            ...manifest.cockpit?.artifactSlotOverrides,
          };
          if (Array.isArray(removeRaw)) {
            for (const p of removeRaw) {
              if (typeof p === "string" && p.length > 0) {
                Reflect.deleteProperty(merged, p);
              }
            }
          }
          Object.assign(merged, parsed);
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: manifest.cockpit?.phase ?? "idle",
            artifactSlotOverrides: merged,
            lastActionAt: nowIso(),
          };
          if (manifest.artifactSnapshots?.length) {
            manifest.artifactSnapshots = enrichArtifactSnapshots(
              manifest.artifactSnapshots.map((a) => {
                const { classification: _c, ...rest } = a;
                return rest;
              }),
              runId,
              merged,
            );
          }
          appendCockpitMessage(
            manifest,
            `Saved ${Object.keys(parsed).length} artifact slot override(s).`,
          );
          await saveRun(deps.repoRoot, manifest);
          return { status: 200, body: { manifest } };
        }

        if (action === "artifacts/list") {
          const agentId = artifactAgentId(manifest, body);
          const ovr = manifest.cockpit?.artifactSlotOverrides;
          const listArtOpts =
            ovr !== undefined ? { artifactSlotOverrides: ovr } : undefined;
          const artifacts = await listRunArtifacts(
            resumeAgent(agentId),
            runId,
            agentId,
            listArtOpts,
          );
          manifest.artifactSnapshots = artifacts;
          manifest.state = "artifacts-ready";
          manifest.cloud = {
            ...manifest.cloud,
            latestArtifactAgentId: agentId,
          };
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "artifacts-ready",
            lastActionAt: nowIso(),
          };
          appendCockpitMessage(
            manifest,
            `Listed ${artifacts.length} artifact(s) from ${agentId}.`,
          );
          await saveRun(deps.repoRoot, manifest);
          return { status: 200, body: { manifest, artifacts } };
        }

        if (action === "artifacts/download") {
          const agentId = artifactAgentId(manifest, body);
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "downloading",
            lastActionAt: nowIso(),
          };
          await saveRun(deps.repoRoot, manifest);
          const result = await downloadRunArtifacts({
            repoRoot: deps.repoRoot,
            runId,
            agent: resumeAgent(agentId),
            manifest,
            sourceAgentId: agentId,
          });
          result.manifest.cloud = {
            ...result.manifest.cloud,
            latestArtifactAgentId: agentId,
          };
          const listCount = result.manifest.artifactSnapshots?.length ?? 0;
          appendCockpitMessage(
            result.manifest,
            `Refreshed cloud artifact list (${listCount} path(s)) and saved ${result.downloaded.length} file(s) to disk (${result.failed.length} failed). Newest video is highlighted under Video previews for Step 3.`,
          );
          await saveRun(deps.repoRoot, result.manifest);
          return { status: 200, body: result };
        }

        if (action === "analyze") {
          const instRaw = stringField(body, "assessmentInstruction");
          const inst = instRaw?.trim() ?? "";
          const modelRaw = stringField(body, "assessmentModel");
          const model = modelRaw?.trim() ?? "";
          let includeMinigames: MinigameKey[] | undefined;
          try {
            includeMinigames = parseHandoffMinigames(body);
          } catch (e: unknown) {
            return {
              status: 400,
              body: { error: e instanceof Error ? e.message : String(e) },
            };
          }
          const previousState = manifest.state;
          const previousPendingNextStep = manifest.pendingNextStep;
          const previousCockpitPhase = manifest.cockpit?.phase ?? "idle";
          manifest.state = "analyzing";
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "analyzing",
            lastActionAt: nowIso(),
          };
          await saveRun(deps.repoRoot, manifest);
          let assess: { allPassed: boolean };
          try {
            const assessOpts =
              inst || model || includeMinigames
                ? {
                    ...(inst ? { extraInstructions: inst } : {}),
                    ...(model ? { model } : {}),
                    ...(includeMinigames ? { includeMinigames } : {}),
                  }
                : undefined;
            assess = await assessRun(runId, assessOpts);
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            manifest = await loadRun(deps.repoRoot, runId);
            manifest.state = previousState;
            manifest.pendingNextStep = previousPendingNextStep;
            manifest.lastError = compactPromptPreview(message);
            manifest.cockpit = {
              ...manifest.cockpit,
              phase: previousCockpitPhase,
              lastActionAt: nowIso(),
            };
            appendCockpitMessage(
              manifest,
              `Gemini video analysis failed: ${compactPromptPreview(message)}`,
            );
            await saveRun(deps.repoRoot, manifest);
            throw e;
          }
          manifest = await loadRun(deps.repoRoot, runId);
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "review-ready",
            lastActionAt: nowIso(),
          };
          appendCockpitMessage(
            manifest,
            `Gemini assessment complete: allPassed=${assess.allPassed}.`,
          );
          await saveRun(deps.repoRoot, manifest);
          return {
            status: 200,
            body: {
              manifest,
              assessment: await loadAssessment(
                assessmentPath(deps.repoRoot, runId),
              ),
            },
          };
        }

        if (action === "share") {
          let handoffSlots: MinigameKey[] | undefined;
          let followUpNote: string | undefined;
          try {
            handoffSlots = parseHandoffMinigames(body);
            followUpNote = parseFollowUpInstruction(body);
          } catch (e: unknown) {
            return {
              status: 400,
              body: { error: e instanceof Error ? e.message : String(e) },
            };
          }
          const assessment = await loadAssessment(
            assessmentPath(deps.repoRoot, runId),
          );
          const shareOpts: {
            includeMinigames?: MinigameKey[];
            followUpInstruction?: string;
          } = {};
          if (handoffSlots) shareOpts.includeMinigames = handoffSlots;
          if (followUpNote) shareOpts.followUpInstruction = followUpNote;
          await writeShareBundle(
            deps.repoRoot,
            manifest,
            assessment,
            Object.keys(shareOpts).length > 0 ? shareOpts : undefined,
          );
          appendCockpitMessage(
            manifest,
            [
              handoffSlots?.length
                ? `Handoff minigames: ${handoffSlots.join(", ")}.`
                : null,
              followUpNote
                ? "Included follow-up instructions in share/."
                : null,
              "Generated share bundle.",
            ]
              .filter(Boolean)
              .join(" "),
          );
          await saveRun(deps.repoRoot, manifest);
          return {
            status: 200,
            body: {
              manifest,
              shareDir: join(
                defaultArtifactsDir(deps.repoRoot, runId),
                "share",
              ),
            },
          };
        }

        if (action === "plan") {
          const {
            agentId,
            run,
            runId: planR,
          } = await startPlanCloudAgent(deps.repoRoot, runId);
          const started = nowIso();
          let m = await loadRun(deps.repoRoot, runId);
          m = {
            ...m,
            state: "planned",
            cloud: {
              ...m.cloud,
              planAgentId: agentId,
              ...(planR ? { planRunId: planR } : {}),
              runs: {
                ...m.cloud?.runs,
                plan: {
                  role: "plan",
                  agentId,
                  ...(planR ? { runId: planR } : {}),
                  status: "running",
                  startedAt: started,
                },
              },
            },
          };
          await saveRun(deps.repoRoot, m);
          const res = await waitRunDone(run);
          m = await loadRun(deps.repoRoot, runId);
          m = {
            ...m,
            state: "needs-approval",
            planPath: join(qaRunArtifactsRelativePath(runId), "cursor-plan.md"),
            cloud: {
              ...m.cloud,
              planAgentId: agentId,
              ...(planR ? { planRunId: planR } : {}),
              runs: {
                ...m.cloud?.runs,
                plan: {
                  role: "plan",
                  agentId,
                  ...(planR ? { runId: planR } : {}),
                  status: "finished",
                  startedAt: started,
                  completedAt: nowIso(),
                },
              },
            },
          };
          await saveRun(deps.repoRoot, m);
          return { status: 200, body: { runStatus: res.status, manifest: m } };
        }

        if (action === "send-findings") {
          let handoffSlots: MinigameKey[] | undefined;
          let followUpNote: string | undefined;
          try {
            handoffSlots = parseHandoffMinigames(body);
            followUpNote = parseFollowUpInstruction(body);
          } catch (e: unknown) {
            return {
              status: 400,
              body: { error: e instanceof Error ? e.message : String(e) },
            };
          }
          const assessment = await loadAssessment(
            assessmentPath(deps.repoRoot, runId),
          );
          const deliverOpts: {
            includeMinigames?: MinigameKey[];
            followUpInstruction?: string;
            agentPick: JsonBody;
          } = { agentPick: body };
          if (handoffSlots !== undefined) {
            deliverOpts.includeMinigames = handoffSlots;
          }
          if (followUpNote !== undefined) {
            deliverOpts.followUpInstruction = followUpNote;
          }
          const { manifest: mOut, result } = await deliverAssessmentFollowUp(
            manifest,
            assessment,
            deliverOpts,
          );
          return { status: 200, body: { manifest: mOut, result } };
        }

        if (action === "approve-implement") {
          manifest.planApproved = true;
          manifest.pendingNextStep = "implement";
          manifest.state = "implementing";
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: "implementing",
            lastActionAt: nowIso(),
          };
          appendCockpitMessage(
            manifest,
            "Approved findings for implementation.",
          );
          if (body.execute === false) {
            await saveRun(deps.repoRoot, manifest);
            return { status: 200, body: { manifest } };
          }
          const start = await startImplementCloudAgent(deps.repoRoot, runId);
          manifest.cloud = mergeCloud(
            manifest.cloud,
            roleCloudPatch("implement", start),
          );
          appendCockpitMessage(
            manifest,
            `Implementation agent ${start.agentId} started.`,
          );
          await saveRun(deps.repoRoot, manifest);
          const res = await waitRunDone(start.run);
          const prUrl = res.git?.branches?.[0]?.prUrl;
          let mDone = await loadRun(deps.repoRoot, runId);
          const implStarted =
            mDone.cloud?.runs?.implement?.startedAt ?? nowIso();
          const nextLastPrUrl = prUrl ?? mDone.cloud?.lastPrUrl;
          mDone = {
            ...mDone,
            state: prUrl ? "pr-ready" : mDone.state,
            cloud: {
              ...mDone.cloud,
              ...(nextLastPrUrl !== undefined
                ? { lastPrUrl: nextLastPrUrl }
                : {}),
              runs: {
                ...mDone.cloud?.runs,
                implement: {
                  role: "implement",
                  agentId: start.agentId,
                  ...(start.runId ? { runId: start.runId } : {}),
                  status: "finished",
                  startedAt: implStarted,
                  completedAt: nowIso(),
                },
              },
            },
          };
          appendCockpitMessage(
            mDone,
            prUrl
              ? `Implementation finished; PR: ${prUrl}`
              : "Implementation agent run finished.",
          );
          await saveRun(deps.repoRoot, mDone);
          return {
            status: 200,
            body: { runStatus: res.status, prUrl, manifest: mDone },
          };
        }

        if (action === "focused-loop/start") {
          let params: FocusedLoopStartParams;
          try {
            params = parseFocusedLoopStartBody(body);
          } catch (e: unknown) {
            return {
              status: 400,
              body: { error: e instanceof Error ? e.message : String(e) },
            };
          }
          await reconcileStaleFocusedLoopOnLoad(manifest);
          manifest = await loadRun(deps.repoRoot, runId);
          if (
            manifest.cockpit?.focusedLoop?.status === "running" &&
            activeFocusedLoopRuns.has(runId)
          ) {
            return {
              status: 409,
              body: {
                error:
                  "A focused loop is already running for this run. Wait or cancel it first.",
              },
            };
          }
          const startedAt = nowIso();
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: manifest.cockpit?.phase ?? "idle",
            focusedLoop: {
              slot: params.slot,
              targetScore: params.targetScore,
              maxAttempts: params.maxAttempts,
              attempt: 0,
              status: "running",
              stage: "send-findings",
              startedAt,
              updatedAt: startedAt,
              cancelRequested: false,
            },
          };
          appendCockpitMessage(
            manifest,
            `Focused loop started: ${params.slot} → target ${params.targetScore}, max ${params.maxAttempts} attempt(s).`,
          );
          await saveRun(deps.repoRoot, manifest);
          activeFocusedLoopRuns.add(runId);
          void (async () => {
            try {
              await runFocusedLoopJob(runId, params);
            } finally {
              activeFocusedLoopRuns.delete(runId);
            }
          })();
          const out = await loadRun(deps.repoRoot, runId);
          return { status: 200, body: { manifest: out } };
        }

        if (action === "focused-loop/cancel") {
          manifest = await loadRun(deps.repoRoot, runId);
          const fl = manifest.cockpit?.focusedLoop;
          if (!fl || fl.status !== "running") {
            return {
              status: 400,
              body: { error: "No running focused loop to cancel." },
            };
          }
          manifest.cockpit = {
            ...manifest.cockpit,
            phase: manifest.cockpit?.phase ?? "idle",
            focusedLoop: {
              ...fl,
              cancelRequested: true,
              updatedAt: nowIso(),
            },
          };
          appendCockpitMessage(
            manifest,
            "Focused loop cancel requested (stops after current stage).",
          );
          await saveRun(deps.repoRoot, manifest);
          return { status: 200, body: { manifest } };
        }

        return { status: 404, body: { error: "Not found" } };
      } catch (e: unknown) {
        return {
          status: 500,
          body: { error: e instanceof Error ? e.message : String(e) },
        };
      }
    },
  };
}

const here = dirname(fileURLToPath(import.meta.url));

function safeFileUnderRoot(root: string, relUrlPath: string): string {
  const decoded = decodeURIComponent(relUrlPath);
  const abs = resolve(join(root, decoded));
  const rootAbs = resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    throw new Error("Path escapes root");
  }
  return abs;
}

async function readServerBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const ch of req) {
    chunks.push(
      typeof ch === "string"
        ? Buffer.from(ch, "utf8")
        : Buffer.isBuffer(ch)
          ? ch
          : Buffer.from(ch as Uint8Array),
    );
  }
  if (chunks.length === 0) return undefined;
  const s = Buffer.concat(chunks).toString("utf8");
  if (!s.trim()) return undefined;
  return JSON.parse(s) as unknown;
}

const staticMime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webm": "video/webm",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const apiJsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
} as const;

const sseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "Access-Control-Allow-Origin": "*",
} as const;

function writeSse(
  res: ServerResponse,
  event: string,
  data: Record<string, unknown>,
): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function streamCloudRunEvents(
  repoRoot: string,
  url: URL,
  res: ServerResponse,
): Promise<void> {
  const parts = routeParts(url.pathname);
  const runId = assertSafeRunId(parts[2] ?? "");
  const agentId = assertSafeAgentIdParam(parts[4] ?? "");
  let manifest = await loadRun(repoRoot, runId);
  const selectedRunId =
    url.searchParams.get("runId") ??
    manifest.cloud?.selectedRunId ??
    manifest.cloud?.agents?.find((agent) => agent.agentId === agentId)?.runId;
  if (!selectedRunId) {
    res.writeHead(400, apiJsonHeaders);
    res.end(JSON.stringify({ error: "runId is required for event streaming" }));
    return;
  }

  res.writeHead(200, sseHeaders);
  writeSse(res, "status", {
    status: "connecting",
    agentId,
    runId: selectedRunId,
  });
  try {
    const run = await getCloudRunDefault(agentId, selectedRunId);
    writeSse(res, "status", {
      status: run.status,
      agentId,
      runId: selectedRunId,
    });
    for await (const message of run.stream()) {
      writeSse(res, "message", { message });
    }
    const result = run.supports("wait") ? await run.wait() : undefined;
    const finalStatus = result?.status ?? run.status;
    manifest = await loadRun(repoRoot, runId);
    const existing = manifest.cloud?.agents?.find(
      (agent) => agent.agentId === agentId,
    );
    upsertCockpitAgent(
      manifest,
      {
        role: existing?.role ?? "custom",
        agentId,
        runId: selectedRunId,
        displayName: existing?.displayName ?? "Custom command",
        status: finalStatus,
        startedAt: existing?.startedAt ?? nowIso(),
        completedAt: nowIso(),
        ...(existing?.lastPromptPreview
          ? { lastPromptPreview: existing.lastPromptPreview }
          : {}),
      },
      { select: true },
    );
    appendCockpitMessage(
      manifest,
      `Agent ${agentId} stream finished with status ${finalStatus}.`,
    );
    await saveRun(repoRoot, manifest);
    writeSse(res, "done", { status: finalStatus, result });
  } catch (e: unknown) {
    writeSse(res, "run-error", {
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    res.end();
  }
}

export async function startCockpitServer(opts: {
  readonly repoRoot: string;
  readonly port: number;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const api = createCockpitApi({ repoRoot: opts.repoRoot });
  const staticDir = join(here, "cockpit");
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      let pathname = url.pathname;
      if (pathname === "/") pathname = "/index.html";

      if (pathname.startsWith("/api/")) {
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          });
          res.end();
          return;
        }
        const parts = routeParts(url.pathname);
        if (
          req.method === "GET" &&
          parts[0] === "api" &&
          parts[1] === "runs" &&
          parts[3] === "agents" &&
          parts[4] &&
          parts[5] === "events"
        ) {
          await streamCloudRunEvents(opts.repoRoot, url, res);
          return;
        }
        try {
          const body =
            req.method === "POST" || req.method === "PUT"
              ? await readServerBody(req)
              : undefined;
          const out = await api.handle({
            method: req.method ?? "GET",
            pathname: url.pathname,
            body,
          });
          res.writeHead(out.status, apiJsonHeaders);
          res.end(JSON.stringify(out.body));
        } catch (e: unknown) {
          const err = e instanceof Error ? e.message : String(e);
          res.writeHead(500, apiJsonHeaders);
          res.end(JSON.stringify({ error: err }));
        }
        return;
      }

      if (pathname.startsWith("/local/")) {
        try {
          const rel = pathname.slice("/local/".length);
          const filePath = safeFileUnderRoot(opts.repoRoot, rel);
          if (!existsSync(filePath)) {
            res.writeHead(404);
            res.end();
            return;
          }
          const st = await stat(filePath);
          if (!st.isFile()) {
            res.writeHead(404);
            res.end();
            return;
          }
          const ext = extname(filePath);
          const headers: Record<string, string> = {
            "Content-Type": staticMime[ext] ?? "application/octet-stream",
            "Content-Length": String(st.size),
          };
          if (ext === ".webm" || ext === ".mp4") {
            headers["Cache-Control"] = "no-store, max-age=0";
            headers["Pragma"] = "no-cache";
          }
          res.writeHead(200, headers);
          createReadStream(filePath).pipe(res);
        } catch {
          res.writeHead(400);
          res.end();
        }
        return;
      }

      try {
        const filePath = safeFileUnderRoot(staticDir, pathname.slice(1));
        if (existsSync(filePath)) {
          const st = await stat(filePath);
          if (st.isFile()) {
            const ext = extname(filePath);
            const headers: Record<string, string> = {
              "Content-Type": staticMime[ext] ?? "text/plain",
              "Content-Length": String(st.size),
            };
            if (ext === ".html" || ext === ".css" || ext === ".js") {
              headers["Cache-Control"] = "no-store, max-age=0";
            }
            res.writeHead(200, headers);
            createReadStream(filePath).pipe(res);
            return;
          }
        }
      } catch {
        /* path outside static dir */
      }
      res.writeHead(404);
      res.end("Not found");
    })();
  });
  return new Promise((resolveP, rejectP) => {
    const onError = (err: Error) => {
      server.off("error", onError);
      rejectP(err);
    };
    server.once("error", onError);
    server.listen(opts.port, "127.0.0.1", () => {
      server.off("error", onError);
      resolveP({
        url: `http://127.0.0.1:${opts.port}/`,
        close: () =>
          new Promise((resC, rejC) => {
            server.close((cerr) => (cerr ? rejC(cerr) : resC()));
          }),
      });
    });
  });
}

const cockpitRepoRoot = resolve(here, "..");

void (async () => {
  const entry = process.argv[1]
    ? pathToFileURL(resolve(process.argv[1])).href
    : "";
  if (entry && entry === import.meta.url) {
    const port = Number(process.env.QA_COCKPIT_PORT ?? "5875");
    if (Number.isNaN(port) || port < 1) {
      // eslint-disable-next-line no-console
      console.error("Invalid QA_COCKPIT_PORT");
      process.exit(1);
    }
    try {
      const s = await startCockpitServer({ repoRoot: cockpitRepoRoot, port });
      const u = s.url;
      // eslint-disable-next-line no-console
      console.log(`
═══════════════════════════════════════════════════════
  Bug Detective QA COMMAND COCKPIT  (static UI + /api)
  Use this URL only: ${u}
  Not Vite: npm run dev is the 3D game (other port).
  Tip: hard-refresh (Cmd+Shift+R) if styles look stale.
═══════════════════════════════════════════════════════
`);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === "EADDRINUSE") {
        // eslint-disable-next-line no-console
        console.error(
          `Port ${port} is already in use. A cockpit may already be running — open http://127.0.0.1:${port}/\n` +
            `or stop the other process, then run npm run qa:cockpit again.`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.error(err);
      }
      process.exit(1);
    }
  }
})();
