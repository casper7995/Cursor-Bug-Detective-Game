import { Agent } from "@cursor/february";
import type { AgentOptions, Run, RunResult, SDKAgent } from "@cursor/february";
import {
  recordingAgentPrompt,
  planAgentPrompt,
  implementAgentPrompt,
} from "./recordPrompt.js";
import type { CloudAgentRole, QaRunCloud } from "./types.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultArtifactsDir } from "./runStore.js";
import { getCursorApiKey } from "./env.js";
import { resolveQaCloudRepoUrl } from "./cloudRepoUrl.js";

export type CloudAgentRun = Awaited<ReturnType<SDKAgent["send"]>>;

export interface CloudAgentStart {
  agentId: string;
  runId?: string;
  run: CloudAgentRun;
}

export type CloudFollowUpResult = CloudAgentRun;

function repoConfig(
  repoRoot: string,
): { url: string; startingRef?: string; prUrl?: string }[] | undefined {
  const url = resolveQaCloudRepoUrl(repoRoot);
  if (!url) return undefined;
  const entry: { url: string; startingRef?: string; prUrl?: string } = { url };
  if (process.env.CURSOR_QA_STARTING_REF)
    entry.startingRef = process.env.CURSOR_QA_STARTING_REF;
  if (process.env.CURSOR_QA_PR_URL) entry.prUrl = process.env.CURSOR_QA_PR_URL;
  return [entry];
}

function cloudName(): string | undefined {
  const n = process.env.CURSOR_QA_CLOUD_ENV_NAME;
  return n && n.length > 0 ? n : undefined;
}

function cloudType(): "cloud" | "pool" | "machine" {
  const t = (process.env.CURSOR_QA_CLOUD_ENV_TYPE ?? "cloud") as string;
  if (t === "cloud" || t === "pool" || t === "machine") return t;
  return "cloud";
}

function buildCloud(
  autoCreatePR: boolean,
  repoRoot: string,
): NonNullable<AgentOptions["cloud"]> {
  const t = cloudType();
  const name = cloudName();
  let env: NonNullable<AgentOptions["cloud"]>["env"];
  switch (t) {
    case "cloud":
      env = name ? { type: "cloud", name } : { type: "cloud" };
      break;
    case "pool":
      env = name ? { type: "pool", name } : { type: "pool" };
      break;
    case "machine":
      env = name ? { type: "machine", name } : { type: "machine" };
      break;
  }
  const repos = repoConfig(repoRoot);
  return { env, ...(repos ? { repos } : {}), autoCreatePR };
}

export function extractCloudRunId(run: unknown): string | undefined {
  if (run === null || typeof run !== "object") return undefined;
  const candidate = run as { runId?: unknown; id?: unknown };
  if (typeof candidate.runId === "string") return candidate.runId;
  if (typeof candidate.id === "string") return candidate.id;
  return undefined;
}

export async function startRecordingCloudAgent(
  repoRoot: string,
  runId: string,
): Promise<CloudAgentStart> {
  const apiKey = getCursorApiKey();
  const outDir = defaultArtifactsDir(repoRoot, runId);
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "cloud-record-boot.txt"),
    `runId=${runId}\n`,
    "utf8",
  );
  const agent = Agent.create({
    apiKey,
    cloud: buildCloud(false, repoRoot),
    name: `bug-detective-qa-record-${runId}`,
  });
  const run = await agent.send(recordingAgentPrompt(runId), {});
  const cloudRunId = extractCloudRunId(run);
  return {
    agentId: agent.agentId,
    ...(cloudRunId ? { runId: cloudRunId } : {}),
    run,
  };
}

export async function startPlanCloudAgent(
  repoRoot: string,
  runId: string,
): Promise<CloudAgentStart> {
  const apiKey = getCursorApiKey();
  const outDir = defaultArtifactsDir(repoRoot, runId);
  await mkdir(outDir, { recursive: true });
  const agent = Agent.create({
    apiKey,
    cloud: buildCloud(false, repoRoot),
    name: `bug-detective-qa-plan-${runId}`,
  });
  const run = await agent.send(planAgentPrompt(runId), {});
  const cloudRunId = extractCloudRunId(run);
  return {
    agentId: agent.agentId,
    ...(cloudRunId ? { runId: cloudRunId } : {}),
    run,
  };
}

export async function startImplementCloudAgent(
  repoRoot: string,
  runId: string,
): Promise<CloudAgentStart> {
  const apiKey = getCursorApiKey();
  const outDir = defaultArtifactsDir(repoRoot, runId);
  await mkdir(outDir, { recursive: true });
  const agent = Agent.create({
    apiKey,
    cloud: buildCloud(true, repoRoot),
    name: `bug-detective-qa-implement-${runId}`,
  });
  const run = await agent.send(implementAgentPrompt(runId), {});
  const cloudRunId = extractCloudRunId(run);
  return {
    agentId: agent.agentId,
    ...(cloudRunId ? { runId: cloudRunId } : {}),
    run,
  };
}

export async function sendFollowUpToAgent(
  agentId: string,
  text: string,
): Promise<CloudFollowUpResult> {
  const apiKey = getCursorApiKey();
  const sdk = Agent as typeof Agent & {
    resume?: (agentId: string, options: { apiKey: string }) => SDKAgent;
  };
  if (typeof sdk.resume !== "function") {
    throw new Error("@cursor/february Agent.resume is unavailable.");
  }
  const agent = sdk.resume(agentId, { apiKey });
  return agent.send(text, {});
}

export async function waitRunDone(run: {
  wait: () => Promise<RunResult>;
}): Promise<RunResult> {
  return run.wait();
}

/** True when the Cloud API / SDK rejected a follow-up because a run is still active. */
export function isAgentBusyError(e: unknown): boolean {
  const s = e instanceof Error ? e.message : String(e);
  return /agent_busy|already has an active run/i.test(s);
}

/**
 * If the manifest records a plan cloud run for this agent, block until that run
 * reaches a terminal state. Skips when no run id is known or getRun/wait fails
 * (stale id); callers should still use follow-up retry for busy errors.
 */
export async function waitForPlanRunIfKnown(
  planAgentId: string,
  cloud: QaRunCloud | undefined,
  getRun: (agentId: string, runId: string) => Promise<Run>,
  wait: typeof waitRunDone,
): Promise<void> {
  if (!cloud || cloud.planAgentId !== planAgentId) return;
  const runId = cloud.runs?.plan?.runId ?? cloud.planRunId;
  if (!runId) return;
  try {
    const run = await getRun(planAgentId, runId);
    if (run.status !== "running") return;
    if (!run.supports("wait")) return;
    await wait(run);
  } catch {
    // Stale/unknown run id; send may still succeed or busy-retry applies.
  }
}

export type CustomCloudAgentRole = CloudAgentRole | string;

function autoCreatePrForCustomRole(role: CustomCloudAgentRole): boolean {
  return role === "implement";
}

function cloudAgentName(runId: string, role: CustomCloudAgentRole): string {
  const label =
    String(role)
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(0, 48) || "custom";
  return `bug-detective-qa-${label}-${runId}`;
}

/**
 * Start a cloud agent with a caller-defined prompt and naming derived from `role`.
 * record/plan: autoCreatePR false; implement: true; other labels: false (same as record/plan).
 */
export async function startCustomCloudAgent(
  repoRoot: string,
  runId: string,
  prompt: string,
  role: CustomCloudAgentRole,
): Promise<CloudAgentStart> {
  const apiKey = getCursorApiKey();
  const outDir = defaultArtifactsDir(repoRoot, runId);
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "cloud-command-boot.txt"),
    `runId=${runId}\nrole=${String(role)}\n`,
    "utf8",
  );
  const agent = Agent.create({
    apiKey,
    cloud: buildCloud(autoCreatePrForCustomRole(role), repoRoot),
    name: cloudAgentName(runId, role),
  });
  const run = await agent.send(prompt, {});
  const cloudRunId = extractCloudRunId(run);
  return {
    agentId: agent.agentId,
    ...(cloudRunId ? { runId: cloudRunId } : {}),
    run,
  };
}

export const sendCustomFollowUpToAgent = sendFollowUpToAgent;

export async function getCloudRun(
  agentId: string,
  runId: string,
): Promise<Run> {
  const apiKey = getCursorApiKey();
  const sdk = Agent as typeof Agent & {
    getRun?: (
      runId: string,
      options: { runtime: "cloud"; agentId: string; apiKey: string },
    ) => Promise<Run>;
  };
  if (typeof sdk.getRun !== "function") {
    throw new Error("@cursor/february Agent.getRun is unavailable.");
  }
  return sdk.getRun(runId, { runtime: "cloud", agentId, apiKey });
}

const CURSOR_CLOUD_API = "https://api.cursor.com/v0";

function cursorBasicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

async function cursorRestGet(
  apiKey: string,
  pathAfterV0: string,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const url = `${CURSOR_CLOUD_API}${pathAfterV0}`;
  const res = await fetch(url, {
    headers: { Authorization: cursorBasicAuthHeader(apiKey) },
  });
  let json: unknown;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

/**
 * Cloud Agents REST: `GET /v0/agents/:id` (status, target.url for dashboard).
 */
export async function fetchCloudAgentStatus(agentId: string): Promise<unknown> {
  const apiKey = getCursorApiKey();
  const out = await cursorRestGet(
    apiKey,
    `/agents/${encodeURIComponent(agentId)}`,
  );
  if (!out.ok) {
    throw new Error(
      `Cloud agent status HTTP ${out.status}: ${JSON.stringify(out.json)}`,
    );
  }
  return out.json;
}

/**
 * Cloud Agents REST: `GET /v0/agents/:id/conversation`.
 */
export async function fetchCloudAgentConversation(
  agentId: string,
): Promise<unknown> {
  const apiKey = getCursorApiKey();
  const out = await cursorRestGet(
    apiKey,
    `/agents/${encodeURIComponent(agentId)}/conversation`,
  );
  if (!out.ok) {
    throw new Error(
      `Cloud agent conversation HTTP ${out.status}: ${JSON.stringify(out.json)}`,
    );
  }
  return out.json;
}

/**
 * Prefer `target.url` from status response; else `https://cursor.com/agents?id=<id>`.
 */
export function resolveCloudAgentDashboardUrl(
  agentId: string,
  status: unknown,
): string {
  if (status && typeof status === "object") {
    const t = (status as { target?: { url?: unknown } }).target;
    if (t && typeof t.url === "string" && t.url.length > 0) return t.url;
  }
  return `https://cursor.com/agents?id=${encodeURIComponent(agentId)}`;
}
