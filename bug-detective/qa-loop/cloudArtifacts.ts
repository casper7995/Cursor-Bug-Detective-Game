import { Agent } from "@cursor/february";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, normalize, sep } from "node:path";
import {
  MINIGAMES,
  type CloudArtifactSnapshot,
  type CloudPlayableArtifactClassification,
  type DownloadedArtifact,
  type MinigameKey,
  type QaCockpitState,
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
  sizeBytes?: unknown;
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
  else if (typeof artifact.sizeBytes === "number")
    out.size = artifact.sizeBytes;
  if (typeof artifact.updatedAt === "string")
    out.updatedAt = artifact.updatedAt;
  else if (typeof artifact.lastModified === "string")
    out.updatedAt = artifact.lastModified;
  return out;
}

function artifactPrefix(runId: string): string {
  return `${qaRunArtifactsRelativePath(runId)}/`;
}

export function looseCloudVideoExt(path: string): ".webm" | ".mp4" | undefined {
  const file = basename(path).toLowerCase();
  if (file.endsWith(".webm")) return ".webm";
  if (file.endsWith(".mp4")) return ".mp4";
  return undefined;
}

/** Minigame token / substring match on base filename (no bug-detective default). */
function inferSlotFromNameWithoutPrefix(path: string): MinigameKey | undefined {
  const file = basename(path).toLowerCase();
  const base = file.replace(/\.(webm|mp4)$/i, "");
  const tokens = base.split(/[^a-z0-9]+/).filter(Boolean);
  for (const slot of MINIGAMES) {
    if (tokens.includes(slot)) return slot;
  }
  for (const slot of MINIGAMES) {
    if (base.includes(slot)) return slot;
  }
  return undefined;
}

/**
 * When `path` is not under the run folder, it may still be listed as a "loose"
 * Cursor SDK artifact (e.g. `artifacts/bug-detective-*.webm`).
 */
function isLoosePlayableListCandidate(path: string, _runId: string): boolean {
  if (looseCloudVideoExt(path) === undefined) return false;
  if (path.startsWith("artifacts/qa-runs/")) return false;
  const file = basename(path).toLowerCase();
  const base = file.replace(/\.(webm|mp4)$/i, "");
  for (const slot of MINIGAMES) {
    if (
      base
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .includes(slot)
    )
      return true;
    if (base.includes(slot)) return true;
  }
  if (base.startsWith("bug-detective-")) return true;
  return false;
}

function isRunArtifact(path: string, runId: string): boolean {
  if (path.startsWith(artifactPrefix(runId))) return true;
  if (path.startsWith("artifacts/qa-runs/")) return false;
  return isLoosePlayableListCandidate(path, runId);
}

function safeStripRunRelativePath(path: string, runId: string): string {
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
  return MINIGAMES.find(
    (slot) => file === `${slot}.webm` || file === `${slot}.mp4`,
  );
}

/**
 * Heuristic classification for playable SDK paths. List/download both use the
 * same function so the cockpit and disk layout stay aligned.
 */
export function classifyCloudArtifactPath(
  path: string,
  runId: string,
  options?: { artifactSlotOverrides?: Record<string, MinigameKey> },
): CloudPlayableArtifactClassification | undefined {
  const ext = looseCloudVideoExt(path);
  if (!ext) return undefined;

  const o = options?.artifactSlotOverrides;
  if (o?.[path] !== undefined) {
    return {
      ext,
      slot: o[path],
      confidence: "high",
      reason: "Saved slot assignment",
      fromOverride: true,
    };
  }

  const prefix = artifactPrefix(runId);
  if (path.startsWith(prefix)) {
    const rel = normalize(path.slice(prefix.length));
    const fromCanonical = artifactVideoSlot(rel);
    if (fromCanonical) {
      return {
        ext,
        slot: fromCanonical,
        confidence: "high",
        reason: "Path under this run is `videos/<minigame>.(webm|mp4)`",
      };
    }
    const fromName = inferSlotFromNameWithoutPrefix(basename(rel));
    if (fromName) {
      return {
        ext,
        slot: fromName,
        confidence: "high",
        reason: "File name under this run includes a minigame key",
      };
    }
    const base = basename(rel)
      .toLowerCase()
      .replace(/\.(webm|mp4)$/i, "");
    if (base.startsWith("bug-detective-")) {
      return {
        ext,
        confidence: "low",
        reason:
          "Playable under the run path without a minigame token or `videos/<slot>.*` name; assign a slot in the cockpit",
      };
    }
    return {
      ext,
      confidence: "low",
      reason: "Playable under the run path; could not infer a minigame slot",
    };
  }

  const fromLoose = inferSlotFromNameWithoutPrefix(path);
  if (fromLoose) {
    return {
      ext,
      slot: fromLoose,
      confidence: "high",
      reason: "Loose artifact name includes a minigame key",
    };
  }
  const baseLoose = basename(path)
    .toLowerCase()
    .replace(/\.(webm|mp4)$/i, "");
  if (baseLoose.startsWith("bug-detective-")) {
    return {
      ext,
      confidence: "low",
      reason:
        "Loose bug-detective clip with no minigame token; assign a slot in the cockpit",
    };
  }
  return {
    ext,
    confidence: "low",
    reason: "Could not infer a minigame slot from the file name",
  };
}

export function enrichArtifactSnapshots(
  snapshots: CloudArtifactSnapshot[],
  runId: string,
  artifactSlotOverrides?: Record<string, MinigameKey>,
): CloudArtifactSnapshot[] {
  return snapshots.map((a) => {
    const c = classifyCloudArtifactPath(
      a.path,
      runId,
      artifactSlotOverrides !== undefined
        ? { artifactSlotOverrides }
        : undefined,
    );
    if (!c) {
      const { classification: _drop, ...rest } = a;
      return rest;
    }
    return { ...a, classification: c };
  });
}

type DownloadLayout =
  | { kind: "static"; relativePath: string }
  | {
      kind: "playable";
      relativePath: string;
      videoSlot: MinigameKey;
      manualOverride: boolean;
    }
  | { kind: "needs-slot" };

function layoutDownloadedArtifact(
  path: string,
  runId: string,
  artifactSlotOverrides: Record<string, MinigameKey> | undefined,
): DownloadLayout {
  const ext = looseCloudVideoExt(path);
  if (ext === undefined) {
    return {
      kind: "static",
      relativePath: safeStripRunRelativePath(path, runId),
    };
  }
  const c = classifyCloudArtifactPath(
    path,
    runId,
    artifactSlotOverrides !== undefined ? { artifactSlotOverrides } : undefined,
  );
  if (!c || !c.slot) {
    return { kind: "needs-slot" };
  }
  const prefix = artifactPrefix(runId);
  if (path.startsWith(prefix)) {
    const rel = safeStripRunRelativePath(path, runId);
    const fromCanonical = artifactVideoSlot(rel);
    if (fromCanonical) {
      return {
        kind: "playable",
        relativePath: rel,
        videoSlot: fromCanonical,
        manualOverride: Boolean(c.fromOverride),
      };
    }
  }
  return {
    kind: "playable",
    relativePath: `videos/${c.slot}${ext}`,
    videoSlot: c.slot,
    manualOverride: Boolean(c.fromOverride),
  };
}

function toBuffer(data: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === "string") return Buffer.from(data);
  return Buffer.from(data);
}

export interface ListRunArtifactsOptions {
  artifactSlotOverrides?: Record<string, MinigameKey>;
}

export async function listRunArtifacts(
  agent: ArtifactAgent,
  runId: string,
  sourceAgentId?: string,
  options?: ListRunArtifactsOptions,
): Promise<CloudArtifactSnapshot[]> {
  const listedAt = nowIso();
  const artifacts = await agent.listArtifacts();
  const o = options?.artifactSlotOverrides;
  const base = artifacts
    .map((artifact) => normalizeSdkArtifact(artifact, listedAt))
    .filter((artifact): artifact is CloudArtifactSnapshot => Boolean(artifact))
    .filter((artifact) => isRunArtifact(artifact.path, runId))
    .map((artifact) => {
      if (!sourceAgentId) return artifact;
      return { ...artifact, sourceAgentId };
    });
  return enrichArtifactSnapshots(base, runId, o);
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
  const overrides = opts.manifest.cockpit?.artifactSlotOverrides;
  const listOptions: ListRunArtifactsOptions | undefined =
    overrides !== undefined ? { artifactSlotOverrides: overrides } : undefined;
  const artifacts = await listRunArtifacts(
    agent,
    runId,
    sourceAgentId,
    listOptions,
  );
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

  const ordered = [...artifacts].sort((a, b) =>
    (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""),
  );

  for (const artifact of ordered) {
    const downloadedAt = nowIso();
    const layout = layoutDownloadedArtifact(artifact.path, runId, overrides);
    if (layout.kind === "needs-slot") {
      failed.push({
        path: artifact.path,
        relativePath: "videos/(needs-slot)",
        downloadedAt,
        status: "failed",
        error: "Needs slot assignment",
      });
      continue;
    }
    const { relativePath } = layout;
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
      if (layout.kind === "playable") {
        manifest.videos = {
          ...manifest.videos,
          [layout.videoSlot]: localPath,
        };
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

  const listedPaths = new Set(artifacts.map((a) => a.path));
  manifest.downloadedArtifacts = [
    ...(manifest.downloadedArtifacts ?? []).filter(
      (existing) => !listedPaths.has(existing.path),
    ),
    ...downloaded,
    ...failed,
  ];

  let latestSyncWebm: QaCockpitState["latestSyncWebm"] | undefined;
  let bestT = "";
  for (const d of downloaded) {
    if (d.status !== "downloaded" || !d.localPath) continue;
    const layout = layoutDownloadedArtifact(d.path, runId, overrides);
    if (layout.kind !== "playable") continue;
    const slot = layout.videoSlot;
    const t = d.updatedAt ?? d.downloadedAt;
    if (t >= bestT) {
      bestT = t;
      const mo = Boolean(overrides?.[d.path]);
      latestSyncWebm = {
        relativePath: d.relativePath,
        slot,
        ...(d.updatedAt !== undefined ? { cloudUpdatedAt: d.updatedAt } : {}),
        ...(typeof d.path === "string" && d.path.length > 0
          ? { sourceCloudPath: d.path }
          : {}),
        ...(mo ? { manualOverride: true } : {}),
      };
    }
  }

  const anyOk = downloaded.length > 0;
  manifest.state = !anyOk && failed.length > 0 ? "blocked" : "artifacts-ready";
  const cockpitNext: QaCockpitState = {
    ...manifest.cockpit,
    phase: !anyOk && failed.length > 0 ? "blocked" : "artifacts-ready",
    lastActionAt: nowIso(),
  };
  if (latestSyncWebm !== undefined) {
    cockpitNext.latestSyncWebm = latestSyncWebm;
  } else {
    delete cockpitNext.latestSyncWebm;
  }
  manifest.cockpit = cockpitNext;
  if (failed.length > 0) {
    if (!anyOk) {
      manifest.lastError = `${failed.length} artifact download(s) failed`;
    } else {
      const needsSlot = failed.filter((f) =>
        f.error?.includes("Needs slot"),
      ).length;
      if (needsSlot > 0) {
        manifest.lastError = `${failed.length} artifact(s) not downloaded (${needsSlot} need slot assignment)`;
      } else {
        manifest.lastError = `${failed.length} artifact download(s) failed`;
      }
    }
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
