import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyCloudArtifactPath,
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
      "artifacts/qa-runs/run-a/recorder.log",
      "artifacts/qa-runs/run-a/videos/runner.webm",
    ]);
    expect(result.downloaded.map((artifact) => artifact.relativePath)).toEqual([
      "recorder.log",
      "videos/runner.webm",
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
    expect(result.manifest.cockpit?.latestSyncWebm).toEqual({
      relativePath: "videos/runner.webm",
      slot: "runner",
      cloudUpdatedAt: "2026-01-01T00:00:00.000Z",
      sourceCloudPath: "artifacts/qa-runs/run-a/videos/runner.webm",
    });
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

  it("maps loose cloud demo video artifacts into the local run videos directory", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-artifacts-"));
    const runId = "run-cloud-loose";
    const agent: ArtifactAgent = {
      listArtifacts: async () => [
        {
          path: "artifacts/bug-detective-runner-demo.webm",
          sizeBytes: 1405300,
          updatedAt: "2026-04-25T15:31:13.000Z",
        },
      ],
      downloadArtifact: async (path: string) => Buffer.from(path),
    };

    const listed = await listRunArtifacts(agent, runId);
    expect(listed.map((artifact) => artifact.path)).toEqual([
      "artifacts/bug-detective-runner-demo.webm",
    ]);
    expect(listed[0]?.size).toBe(1405300);
    expect(listed[0]?.classification?.confidence).toBe("high");
    expect(listed[0]?.classification?.slot).toBe("runner");

    const result = await downloadRunArtifacts({
      repoRoot,
      runId,
      agent,
      manifest: createInitialManifest(runId),
    });

    expect(result.downloaded.map((artifact) => artifact.relativePath)).toEqual([
      "videos/runner.webm",
    ]);
    expect(result.manifest.videos.runner).toBe(
      join(defaultArtifactsDir(repoRoot, runId), "videos", "runner.webm"),
    );
    expect(result.manifest.cockpit?.latestSyncWebm).toEqual(
      expect.objectContaining({
        slot: "runner",
        relativePath: "videos/runner.webm",
        sourceCloudPath: "artifacts/bug-detective-runner-demo.webm",
        cloudUpdatedAt: "2026-04-25T15:31:13.000Z",
      }),
    );
  });

  it("classifies errand in a loose bug-detective mp4 with high confidence", () => {
    const runId = "run-x";
    const c = classifyCloudArtifactPath(
      "artifacts/bug-detective-errand-smoke.mp4",
      runId,
    );
    expect(c?.confidence).toBe("high");
    expect(c?.slot).toBe("errand");
  });

  it("does not map ambiguous bug-detective qa run slug to runner; lists low confidence", async () => {
    const runId = "run-moehtkrt-n6neob";
    const cloudPath =
      "artifacts/bug-detective-qa-custom-run-moehtkrt-n6neob.webm";
    const c = classifyCloudArtifactPath(cloudPath, runId);
    expect(c?.confidence).toBe("low");
    expect(c?.slot).toBeUndefined();

    const repoRoot = await mkdtemp(join(tmpdir(), "qa-artifacts-"));
    const agent: ArtifactAgent = {
      listArtifacts: async () => [
        {
          path: cloudPath,
          sizeBytes: 99,
          updatedAt: "2026-04-26T12:00:00.000Z",
        },
      ],
      downloadArtifact: async (path: string) => Buffer.from(`blob:${path}`),
    };

    const listed = await listRunArtifacts(agent, runId);
    expect(listed.map((a) => a.path)).toEqual([cloudPath]);
    expect(listed[0]?.classification?.confidence).toBe("low");

    const result = await downloadRunArtifacts({
      repoRoot,
      runId,
      agent,
      manifest: createInitialManifest(runId),
    });

    expect(result.downloaded).toHaveLength(0);
    expect(result.failed).toEqual([
      expect.objectContaining({
        path: cloudPath,
        status: "failed",
        error: "Needs slot assignment",
      }),
    ]);
    expect(result.manifest.videos.runner).toBeUndefined();
  });

  it("maps ambiguous slug to errand when manifest has cockpit.artifactSlotOverrides", async () => {
    const runId = "run-moehtkrt-n6neob";
    const cloudPath =
      "artifacts/bug-detective-qa-custom-run-moehtkrt-n6neob.webm";
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-artifacts-"));
    const m = createInitialManifest(runId);
    m.cockpit = {
      phase: "idle",
      ...m.cockpit,
      artifactSlotOverrides: { [cloudPath]: "errand" },
    };
    const agent: ArtifactAgent = {
      listArtifacts: async () => [
        {
          path: cloudPath,
          sizeBytes: 99,
          updatedAt: "2026-04-26T12:00:00.000Z",
        },
      ],
      downloadArtifact: async (path: string) => Buffer.from(`blob:${path}`),
    };

    const c = classifyCloudArtifactPath(cloudPath, runId, {
      artifactSlotOverrides: m.cockpit.artifactSlotOverrides!,
    });
    expect(c?.slot).toBe("errand");
    expect(c?.fromOverride).toBe(true);

    const result = await downloadRunArtifacts({
      repoRoot,
      runId,
      agent,
      manifest: m,
    });
    expect(result.downloaded[0]?.relativePath).toBe("videos/errand.webm");
    expect(result.manifest.videos.errand).toBe(
      join(defaultArtifactsDir(repoRoot, runId), "videos", "errand.webm"),
    );
    expect(result.manifest.cockpit?.latestSyncWebm).toEqual(
      expect.objectContaining({
        slot: "errand",
        sourceCloudPath: cloudPath,
        manualOverride: true,
      }),
    );
  });

  it("maps loose cloud mp4 demo artifacts into the local runner slot", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-artifacts-"));
    const runId = "run-moehtkrt-n6neob";
    const cloudPath = "artifacts/bug-detective-runner-computer-use-demo.mp4";
    const agent: ArtifactAgent = {
      listArtifacts: async () => [
        {
          path: cloudPath,
          sizeBytes: 7113204,
          updatedAt: "2026-04-26T03:15:27.000Z",
        },
        {
          path: "artifacts/bug-detective-runner-demo.webm",
          sizeBytes: 1405300,
          updatedAt: "2026-04-25T15:31:13.000Z",
        },
      ],
      downloadArtifact: async (path: string) => Buffer.from(`blob:${path}`),
    };

    const listed = await listRunArtifacts(agent, runId);
    expect(listed.map((a) => a.path)).toEqual([
      "artifacts/bug-detective-runner-computer-use-demo.mp4",
      "artifacts/bug-detective-runner-demo.webm",
    ]);

    const result = await downloadRunArtifacts({
      repoRoot,
      runId,
      agent,
      manifest: createInitialManifest(runId),
    });

    expect(result.downloaded.map((artifact) => artifact.relativePath)).toEqual([
      "videos/runner.webm",
      "videos/runner.mp4",
    ]);
    expect(result.manifest.videos.runner).toBe(
      join(defaultArtifactsDir(repoRoot, runId), "videos", "runner.mp4"),
    );
    expect(result.manifest.cockpit?.latestSyncWebm).toEqual(
      expect.objectContaining({
        slot: "runner",
        relativePath: "videos/runner.mp4",
        sourceCloudPath: cloudPath,
        cloudUpdatedAt: "2026-04-26T03:15:27.000Z",
      }),
    );
  });
});
