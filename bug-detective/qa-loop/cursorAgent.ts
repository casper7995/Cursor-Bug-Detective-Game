import { Agent } from "@cursor/february";
import type { AgentOptions, RunResult, SDKAgent } from "@cursor/february";
import {
  recordingAgentPrompt,
  planAgentPrompt,
  implementAgentPrompt,
} from "./recordPrompt.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultArtifactsDir } from "./runStore.js";
import { getCursorApiKey } from "./env.js";

type CloudAgentRun = Awaited<ReturnType<SDKAgent["send"]>>;

export interface CloudAgentStart {
  agentId: string;
  runId?: string;
  run: CloudAgentRun;
}

export type CloudFollowUpResult = CloudAgentRun;

function repoConfig():
  | { url: string; startingRef?: string; prUrl?: string }[]
  | undefined {
  const url = process.env.CURSOR_QA_REPO_URL;
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

function buildCloud(autoCreatePR: boolean): NonNullable<AgentOptions["cloud"]> {
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
  const repos = repoConfig();
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
    cloud: buildCloud(false),
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
    cloud: buildCloud(false),
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
    cloud: buildCloud(true),
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
