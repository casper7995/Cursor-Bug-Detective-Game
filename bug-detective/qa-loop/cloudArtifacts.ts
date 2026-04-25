import { Agent } from "@cursor/february";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, normalize, sep } from "node:path";
import {
  MINIGAMES,
  type CloudArtifactSnapshot,
  type DownloadedArtifact,
  type MinigameKey,
  type RunManifestV1,
} from "./types.js";
import { getCursorApiKey } from "./env.js";
import {
  defaultArtifactsDir,
  nowIso,
  qaRunArtifactsRelativePath,
} from "./runStore.js";

export interface ArtifactAgent {
  listArtifacts: () => Promise<unknown[]>;
  downloadArtifact: (path: string) => Promise<Buffer | Uint8Array | string>;
}

interface RawArtifact {
  path?: unknown;
  name?: unknown;
  size?: unknown;
  updatedAt?: unknown;
  lastModified?: unknown;
}

function normalizeSdkArtifact(
  raw: unknown,
  listedAt: string,
): CloudArtifactSnapshot | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const artifact = raw as RawArtifact;
  const path =
    typeof artifact.path === "string"
      ? artifact.path
      : typeof artifact.name === "string"
        ? artifact.name
        : undefined;
  if (!path) return undefined;
  const out: CloudArtifactSnapshot = { path, listedAt };
  if (typeof artifact.size === "number") out.size = artifact.size;
  if (typeof artifact.updatedAt === "string")
    out.updatedAt = artifact.updatedAt;
  else if (typeof artifact.lastModified === "string")
    out.updatedAt = artifact.lastModified;
  return out;
}

function artifactPrefix(runId: string): string {
  return `${qaRunArtifactsRelativePath(runId)}/`;
}

export async function listRunArtifacts(
  agent: ArtifactAgent,
  runId: string,
  sourceAgentId?: string,
): Promise<CloudArtifactSnapshot[]> {
  const listedAt = nowIso();
  const prefix = artifactPrefix(runId);
  const artifacts = await agent.listArtifacts();
  return artifacts
    .map((artifact) => normalizeSdkArtifact(artifact, listedAt))
    .filter((artifact): artifact is CloudArtifactSnapshot => Boolean(artifact))
    .filter((artifact) => artifact.path.startsWith(prefix))
    .map((artifact) => {
      if (!sourceAgentId) return artifact;
      return { ...artifact, sourceAgentId };
    });
}

function safeRelativeArtifactPath(path: string, runId: string): string {
  const prefix = artifactPrefix(runId);
  if (!path.startsWith(prefix)) {
    throw new Error(`Artifact path is outside run ${runId}: ${path}`);
  }
  const relativePath = normalize(path.slice(prefix.length));
  if (
    relativePath.length === 0 ||
    relativePath.startsWith("..") ||
    relativePath.includes(`${sep}..${sep}`) ||
    relativePath.startsWith(sep)
  ) {
    throw new Error(`Unsafe artifact path: ${path}`);
  }
  return relativePath;
}

function artifactVideoSlot(relativePath: string): MinigameKey | undefined {
  const file = basename(relativePath).toLowerCase();
  return MINIGAMES.find((slot) => file === `${slot}.webm`);
}

function toBuffer(data: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === "string") return Buffer.from(data);
  return Buffer.from(data);
}

export interface DownloadRunArtifactsOptions {
  repoRoot: string;
  runId: string;
  agent: ArtifactAgent;
  manifest: RunManifestV1;
  sourceAgentId?: string;
}

export interface DownloadRunArtifactsResult {
  manifest: RunManifestV1;
  artifacts: CloudArtifactSnapshot[];
  downloaded: DownloadedArtifact[];
  failed: DownloadedArtifact[];
}

export async function downloadRunArtifacts(
  opts: DownloadRunArtifactsOptions,
): Promise<DownloadRunArtifactsResult> {
  const { repoRoot, runId, agent, sourceAgentId } = opts;
  const artifacts = await listRunArtifacts(agent, runId, sourceAgentId);
  const runDir = defaultArtifactsDir(repoRoot, runId);
  const downloaded: DownloadedArtifact[] = [];
  const failed: DownloadedArtifact[] = [];
  const manifest: RunManifestV1 = {
    ...opts.manifest,
    artifactSnapshots: artifacts,
    downloadedArtifacts: opts.manifest.downloadedArtifacts
      ? [...opts.manifest.downloadedArtifacts]
      : [],
  };

  for (const artifact of artifacts) {
    const downloadedAt = nowIso();
    const relativePath = safeRelativeArtifactPath(artifact.path, runId);
    const localPath = join(runDir, relativePath);
    try {
      const data = toBuffer(await agent.downloadArtifact(artifact.path));
      await mkdir(dirname(localPath), { recursive: true });
      await writeFile(localPath, data);
      const entry: DownloadedArtifact = {
        path: artifact.path,
        relativePath,
        localPath,
        downloadedAt,
        status: "downloaded",
      };
      if (artifact.size !== undefined) entry.size = artifact.size;
      if (artifact.updatedAt !== undefined)
        entry.updatedAt = artifact.updatedAt;
      downloaded.push(entry);
      const videoSlot = artifactVideoSlot(relativePath);
      if (videoSlot) {
        manifest.videos = { ...manifest.videos, [videoSlot]: localPath };
      }
    } catch (e: unknown) {
      const entry: DownloadedArtifact = {
        path: artifact.path,
        relativePath,
        downloadedAt,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      };
      failed.push(entry);
    }
  }

  manifest.downloadedArtifacts = [
    ...(manifest.downloadedArtifacts ?? []).filter(
      (existing) =>
        !artifacts.some((artifact) => artifact.path === existing.path),
    ),
    ...downloaded,
    ...failed,
  ];
  manifest.state =
    failed.length > 0 && downloaded.length === 0
      ? "blocked"
      : "artifacts-ready";
  manifest.cockpit = {
    ...manifest.cockpit,
    phase:
      failed.length > 0 && downloaded.length === 0
        ? "blocked"
        : "artifacts-ready",
    lastActionAt: nowIso(),
  };
  if (failed.length > 0) {
    manifest.lastError = `${failed.length} artifact download(s) failed`;
  }
  return { manifest, artifacts, downloaded, failed };
}

export function resumeArtifactAgent(
  agentId: string,
  apiKey = getCursorApiKey(),
): ArtifactAgent {
  const sdk = Agent as typeof Agent & {
    resume?: (agentId: string, options: { apiKey: string }) => ArtifactAgent;
  };
  if (typeof sdk.resume !== "function") {
    throw new Error(
      "@cursor/february Agent.resume is unavailable; update the SDK or use a recording agent with artifact helpers.",
    );
  }
  return sdk.resume(agentId, { apiKey });
}
