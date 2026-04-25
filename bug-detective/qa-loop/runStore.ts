import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MinigameKey, QaRunState, RunManifestV1 } from "./types.js";

/** On-disk file name in each `artifacts/qa-runs/<runId>/` directory. */
export const MANIFEST_FILE = "manifest.json";

export function defaultArtifactsDir(cwd: string, runId: string): string {
  return join(cwd, "artifacts", "qa-runs", runId);
}

export function newRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Single source for prompt strings: `artifacts/qa-runs/<runId>`. */
export function qaRunArtifactsRelativePath(runId: string): string {
  return `artifacts/qa-runs/${runId}`;
}

function assertRunManifestV1(x: unknown): RunManifestV1 {
  if (x === null || typeof x !== "object")
    throw new Error("manifest: not a JSON object");
  const o = x as { version?: unknown; runId?: unknown };
  if (o.version !== 1)
    throw new Error(`manifest: expected version 1, got ${String(o.version)}`);
  if (typeof o.runId !== "string" || o.runId.length === 0) {
    throw new Error("manifest: missing or invalid runId");
  }
  return x as RunManifestV1;
}

export async function loadManifest(
  manifestPath: string,
): Promise<RunManifestV1> {
  const raw = await readFile(manifestPath, "utf8");
  return assertRunManifestV1(JSON.parse(raw) as unknown);
}

export async function loadManifestForRunDir(
  runDir: string,
): Promise<RunManifestV1> {
  return loadManifest(join(runDir, MANIFEST_FILE));
}

export async function saveManifest(
  dir: string,
  m: RunManifestV1,
): Promise<void> {
  m.updatedAt = nowIso();
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, MANIFEST_FILE),
    JSON.stringify(m, null, 2) + "\n",
    "utf8",
  );
}

export function createInitialManifest(
  runId: string,
  opts: {
    maxIterations?: number;
    passThreshold?: number;
    videoDir?: string;
  } = {},
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

export function recordVideoPath(
  manifest: RunManifestV1,
  slot: MinigameKey,
  absPath: string,
): RunManifestV1 {
  return {
    ...manifest,
    videos: { ...manifest.videos, [slot]: absPath },
    state: "recording",
  };
}
