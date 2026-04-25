import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createCockpitApi,
  createFindingsPrompt,
} from "../../qa-loop/cockpitServer.js";
import {
  createInitialManifest,
  defaultArtifactsDir,
  saveManifest,
} from "../../qa-loop/runStore.js";
import type { QaAssessmentDocument } from "../../qa-loop/types.js";

const assessment: QaAssessmentDocument = {
  version: 1,
  runId: "run-1",
  model: "test-model",
  createdAt: "2026-01-01T00:00:00.000Z",
  byMinigame: {
    runner: {
      minigame: "runner",
      issues: [
        {
          tSec: 3,
          severity: "high",
          summary: "jump feels late",
          evidence: "missed platform",
        },
      ],
      dimensions: {
        clarity: 7,
        controlFeel: 4,
        fun: 6,
        goalReadability: 8,
        visualPolish: 7,
        performanceSmoothness: 8,
        cursorBrandFit: 8,
      },
      score100: 72,
      assessment: "Runner needs tighter jump feedback.",
      recommendedFixes: ["Buffer jump inputs near platform edges."],
    },
    sentence: {
      minigame: "sentence",
      issues: [],
      dimensions: {
        clarity: 9,
        controlFeel: 9,
        fun: 9,
        goalReadability: 9,
        visualPolish: 9,
        performanceSmoothness: 9,
        cursorBrandFit: 9,
      },
      score100: 94,
      assessment: "Readable.",
      recommendedFixes: [],
    },
    errand: {
      minigame: "errand",
      issues: [],
      dimensions: {
        clarity: 9,
        controlFeel: 9,
        fun: 9,
        goalReadability: 9,
        visualPolish: 9,
        performanceSmoothness: 9,
        cursorBrandFit: 9,
      },
      score100: 93,
      assessment: "Readable.",
      recommendedFixes: [],
    },
    tamper: {
      minigame: "tamper",
      issues: [],
      dimensions: {
        clarity: 9,
        controlFeel: 9,
        fun: 9,
        goalReadability: 9,
        visualPolish: 9,
        performanceSmoothness: 9,
        cursorBrandFit: 9,
      },
      score100: 92,
      assessment: "Readable.",
      recommendedFixes: [],
    },
  },
  gate: { passThreshold: 90, allPassed: false, failing: ["runner"] },
};

describe("cockpit API core", () => {
  it("creates and lists manifest-backed runs without binding an HTTP port", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const api = createCockpitApi({ repoRoot });

    const created = await api.handle({
      method: "POST",
      pathname: "/api/runs",
      body: { runId: "run-created", passThreshold: 88 },
    });

    expect(created.status).toBe(200);
    expect(created.body.manifest.runId).toBe("run-created");
    expect(created.body.manifest.cockpit?.phase).toBe("idle");

    const listed = await api.handle({ method: "GET", pathname: "/api/runs" });
    expect(listed.status).toBe(200);
    expect(listed.body.runs.map((run: { runId: string }) => run.runId)).toEqual(
      ["run-created"],
    );
  });

  it("sends Gemini findings back to an existing Cursor cloud agent and records cockpit state", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-1";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const manifest = createInitialManifest(runId);
    manifest.cloud = { planAgentId: "agent-plan-1" };
    manifest.assessmentPath = "artifacts/qa-runs/run-1/assessment.json";
    await saveManifest(runDir, manifest);
    await saveManifest(runDir, manifest);
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(
        join(runDir, "assessment.json"),
        JSON.stringify(assessment, null, 2),
        "utf8",
      ),
    );
    const prompts: { agentId: string; text: string }[] = [];
    const api = createCockpitApi({
      repoRoot,
      sendFollowUpToAgent: async (agentId, text) => {
        prompts.push({ agentId, text });
        return { status: "queued" };
      },
    });

    const sent = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/send-findings`,
    });

    expect(sent.status).toBe(200);
    expect(prompts).toEqual([
      expect.objectContaining({
        agentId: "agent-plan-1",
        text: expect.stringContaining("Runner needs tighter jump feedback."),
      }),
    ]);
    const updated = JSON.parse(
      await readFile(join(runDir, "manifest.json"), "utf8"),
    ) as { state: string; cockpit?: { phase?: string; messages?: string[] } };
    expect(updated.state).toBe("planned");
    expect(updated.cockpit?.phase).toBe("sent-to-cursor");
    expect(updated.cockpit?.messages?.at(-1)).toContain("Sent findings");
  });

  it("builds a concise follow-up prompt with failing scores and recommended fixes", () => {
    const prompt = createFindingsPrompt(
      createInitialManifest("run-1"),
      assessment,
    );

    expect(prompt).toContain("Run: run-1");
    expect(prompt).toContain("Failing: runner");
    expect(prompt).toContain("runner: 72/100");
    expect(prompt).toContain("Buffer jump inputs near platform edges.");
  });
});
