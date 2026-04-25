import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  downloadRunArtifacts,
  listRunArtifacts,
  type ArtifactAgent,
} from "../../qa-loop/cloudArtifacts.js";
import {
  createInitialManifest,
  defaultArtifactsDir,
} from "../../qa-loop/runStore.js";

describe("cloud artifact sync", () => {
  it("filters SDK artifacts to a run and downloads them into the local run directory", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-artifacts-"));
    const runId = "run-a";
    const downloadedPaths: string[] = [];
    const agent: ArtifactAgent = {
      listArtifacts: async () => [
        {
          path: "artifacts/qa-runs/run-a/videos/runner.webm",
          size: 12,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          path: "artifacts/qa-runs/run-a/recorder.log",
          size: 8,
        },
        {
          path: "artifacts/qa-runs/run-b/videos/runner.webm",
          size: 99,
        },
      ],
      downloadArtifact: async (path: string) => {
        downloadedPaths.push(path);
        return Buffer.from(`downloaded:${path}`);
      },
    };

    const listed = await listRunArtifacts(agent, runId);
    expect(listed.map((artifact) => artifact.path)).toEqual([
      "artifacts/qa-runs/run-a/videos/runner.webm",
      "artifacts/qa-runs/run-a/recorder.log",
    ]);

    const result = await downloadRunArtifacts({
      repoRoot,
      runId,
      agent,
      manifest: createInitialManifest(runId),
    });

    expect(downloadedPaths).toEqual([
      "artifacts/qa-runs/run-a/videos/runner.webm",
      "artifacts/qa-runs/run-a/recorder.log",
    ]);
    expect(result.downloaded.map((artifact) => artifact.relativePath)).toEqual([
      "videos/runner.webm",
      "recorder.log",
    ]);
    expect(
      result.manifest.artifactSnapshots?.map((artifact) => artifact.path),
    ).toEqual(listed.map((artifact) => artifact.path));
    expect(
      result.manifest.downloadedArtifacts?.map((artifact) => artifact.status),
    ).toEqual(["downloaded", "downloaded"]);
    expect(result.manifest.videos.runner).toBe(
      join(defaultArtifactsDir(repoRoot, runId), "videos", "runner.webm"),
    );
    await expect(
      readFile(
        join(defaultArtifactsDir(repoRoot, runId), "videos", "runner.webm"),
        "utf8",
      ),
    ).resolves.toContain(
      "downloaded:artifacts/qa-runs/run-a/videos/runner.webm",
    );
  });

  it("records failed downloads without aborting the whole artifact sync", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-artifacts-"));
    const runId = "run-fail";
    const agent: ArtifactAgent = {
      listArtifacts: async () => [
        { path: "artifacts/qa-runs/run-fail/videos/runner.webm" },
        { path: "artifacts/qa-runs/run-fail/videos/sentence.webm" },
      ],
      downloadArtifact: async (path: string) => {
        if (path.endsWith("sentence.webm"))
          throw new Error("sdk download failed");
        return Buffer.from(path);
      },
    };

    const result = await downloadRunArtifacts({
      repoRoot,
      runId,
      agent,
      manifest: createInitialManifest(runId),
    });

    expect(result.downloaded).toHaveLength(1);
    expect(result.failed).toEqual([
      expect.objectContaining({
        path: "artifacts/qa-runs/run-fail/videos/sentence.webm",
        status: "failed",
        error: "sdk download failed",
      }),
    ]);
    expect(result.manifest.videos.runner).toContain("runner.webm");
    expect(result.manifest.videos.sentence).toBeUndefined();
  });
});
