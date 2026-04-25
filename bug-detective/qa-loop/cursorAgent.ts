import { Agent } from "@cursor/february";
import type { AgentOptions, RunResult } from "@cursor/february";
import { recordingAgentPrompt, planAgentPrompt, implementAgentPrompt } from "./recordPrompt.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultArtifactsDir } from "./runStore.js";

function apiKeyOrThrow(): string {
  const k = process.env.CURSOR_API_KEY;
  if (!k) throw new Error("Missing CURSOR_API_KEY");
  return k;
}

function repoConfig(): { url: string; startingRef?: string; prUrl?: string }[] | undefined {
  const url = process.env.CURSOR_QA_REPO_URL;
  if (!url) return undefined;
  const entry: { url: string; startingRef?: string; prUrl?: string } = { url };
  if (process.env.CURSOR_QA_STARTING_REF) entry.startingRef = process.env.CURSOR_QA_STARTING_REF;
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
  const env =
    t === "cloud"
      ? name
        ? { type: "cloud" as const, name }
        : { type: "cloud" as const }
      : t === "pool"
        ? name
          ? { type: "pool" as const, name }
          : { type: "pool" as const }
        : name
          ? { type: "machine" as const, name }
          : { type: "machine" as const };
  const repos = repoConfig();
  return { env, ...(repos ? { repos } : {}), autoCreatePR };
}

export async function startRecordingCloudAgent(
  repoRoot: string,
  runId: string,
): Promise<{ agentId: string; run: Awaited<ReturnType<ReturnType<typeof Agent.create>["send"]>> }> {
  const apiKey = apiKeyOrThrow();
  const outDir = defaultArtifactsDir(repoRoot, runId);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "cloud-record-boot.txt"), `runId=${runId}\n`, "utf8");
  const agent = Agent.create({ apiKey, cloud: buildCloud(false), name: `bug-detective-qa-record-${runId}` });
  const run = await agent.send(recordingAgentPrompt(runId), {});
  return { agentId: agent.agentId, run };
}

export async function startPlanCloudAgent(
  repoRoot: string,
  runId: string,
): Promise<{ agentId: string; run: Awaited<ReturnType<ReturnType<typeof Agent.create>["send"]>> }> {
  const apiKey = apiKeyOrThrow();
  const outDir = defaultArtifactsDir(repoRoot, runId);
  await mkdir(outDir, { recursive: true });
  const agent = Agent.create({ apiKey, cloud: buildCloud(false), name: `bug-detective-qa-plan-${runId}` });
  const run = await agent.send(planAgentPrompt(runId), {});
  return { agentId: agent.agentId, run };
}

export async function startImplementCloudAgent(
  repoRoot: string,
  runId: string,
): Promise<{ agentId: string; run: Awaited<ReturnType<ReturnType<typeof Agent.create>["send"]>> }> {
  const apiKey = apiKeyOrThrow();
  const outDir = defaultArtifactsDir(repoRoot, runId);
  await mkdir(outDir, { recursive: true });
  const agent = Agent.create({ apiKey, cloud: buildCloud(true), name: `bug-detective-qa-implement-${runId}` });
  const run = await agent.send(implementAgentPrompt(runId), {});
  return { agentId: agent.agentId, run };
}

export async function waitRunDone(run: { wait: () => Promise<RunResult> }): Promise<RunResult> {
  return run.wait();
}
