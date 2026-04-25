import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MinigameKey, QaRunState, RunManifestV1 } from "./types.js";

const MANIFEST = "manifest.json";

export function defaultArtifactsDir(cwd: string, runId: string): string {
  return join(cwd, "artifacts", "qa-runs", runId);
}

export function newRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function loadManifest(manifestPath: string): Promise<RunManifestV1> {
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw) as RunManifestV1;
}

export async function saveManifest(dir: string, m: RunManifestV1): Promise<void> {
  m.updatedAt = nowIso();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, MANIFEST), JSON.stringify(m, null, 2) + "\n", "utf8");
}

export function createInitialManifest(
  runId: string,
  opts: { maxIterations?: number; passThreshold?: number; videoDir?: string } = {},
): RunManifestV1 {
  const t = nowIso();
  return {
    version: 1,
    runId,
    createdAt: t,
    updatedAt: t,
    state: "init" as QaRunState,
    iteration: 0,
    maxIterations: opts.maxIterations ?? 3,
    videos: {},
    ...(opts.videoDir ? { videoDir: opts.videoDir } : {}),
    pendingNextStep: "assess",
    passThreshold: opts.passThreshold ?? 90,
    scores: {},
    planApproved: false,
  };
}

export function recordVideoPath(manifest: RunManifestV1, slot: MinigameKey, absPath: string): RunManifestV1 {
  return {
    ...manifest,
    videos: { ...manifest.videos, [slot]: absPath },
    state: "recording",
  };
}
