import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createCockpitApi,
  createFindingsPrompt,
  listCockpitAgents,
  parseFollowUpInstruction,
  parseFocusedLoopStartBody,
  parseHandoffMinigames,
} from "../../qa-loop/cockpitServer.js";
import {
  planAgentPrompt,
  recordingAgentPrompt,
} from "../../qa-loop/recordPrompt.js";
import {
  createInitialManifest,
  defaultArtifactsDir,
  saveManifest,
} from "../../qa-loop/runStore.js";
import type { CloudAgentStart } from "../../qa-loop/cursorAgent.js";
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

  it("GET /api/runs/:id includes recipePrompts (record + plan) for the cockpit UI", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-with-recipes";
    await saveManifest(
      defaultArtifactsDir(repoRoot, runId),
      createInitialManifest(runId),
    );
    const api = createCockpitApi({ repoRoot });

    const res = await api.handle({
      method: "GET",
      pathname: `/api/runs/${runId}`,
    });

    expect(res.status).toBe(200);
    expect(res.body.recipePrompts?.record).toBe(recordingAgentPrompt(runId));
    expect(res.body.recipePrompts?.plan).toBe(planAgentPrompt(runId));
    expect(typeof res.body.geminiAssessmentPromptOverview).toBe("string");
    expect(String(res.body.geminiAssessmentPromptOverview)).toContain(
      "score100 0-100",
    );
    expect(String(res.body.geminiAssessmentPromptOverview)).toContain(runId);
  });

  it("POST /api/runs/:id/analyze passes selected Gemini model to the assessor", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-analyze-model";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    await saveManifest(runDir, createInitialManifest(runId));
    let sawOptions: { extraInstructions?: string; model?: string } | undefined;
    const api = createCockpitApi({
      repoRoot,
      runAssessForRunId: async (_rid, options) => {
        sawOptions = options;
        const m = createInitialManifest(runId);
        m.assessmentPath =
          "artifacts/qa-runs/run-analyze-model/assessment.json";
        await saveManifest(runDir, m);
        await writeFile(
          join(runDir, "assessment.json"),
          JSON.stringify({ ...assessment, runId, model: "gemini-2.5-flash" }),
          "utf8",
        );
        return { allPassed: false };
      },
    });

    const res = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/analyze`,
      body: {
        assessmentInstruction: "watch for dark clips",
        assessmentModel: "gemini-2.5-flash",
      },
    });

    expect(res.status).toBe(200);
    expect(sawOptions).toEqual({
      extraInstructions: "watch for dark clips",
      model: "gemini-2.5-flash",
    });
  });

  it("POST /api/runs/:id/analyze passes includeMinigames to the assessor", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-analyze-scope";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    await saveManifest(runDir, createInitialManifest(runId));
    let sawSlots: string[] | undefined;
    const api = createCockpitApi({
      repoRoot,
      runAssessForRunId: async (_rid, options) => {
        sawSlots = options?.includeMinigames;
        await writeFile(
          join(runDir, "assessment.json"),
          JSON.stringify({ ...assessment, runId }),
          "utf8",
        );
        return { allPassed: false };
      },
    });
    const res = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/analyze`,
      body: { includeMinigames: ["errand"] },
    });
    expect(res.status).toBe(200);
    expect(sawSlots).toEqual(["errand"]);
  });

  it("sends Gemini findings back to an existing Cursor cloud agent and records cockpit state", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-1";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const manifest = createInitialManifest(runId);
    manifest.cloud = { planAgentId: "agent-plan-1" };
    manifest.assessmentPath = "artifacts/qa-runs/run-1/assessment.json";
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
    expect(updated.cockpit?.messages?.at(-1)).toContain(
      "Sent assessment follow-up",
    );
  });

  it("send-findings scopes follow-up text when includeMinigames is set", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-scoped-send";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const manifest = createInitialManifest(runId);
    manifest.cloud = { planAgentId: "agent-plan-1" };
    manifest.assessmentPath = `artifacts/qa-runs/${runId}/assessment.json`;
    await saveManifest(runDir, manifest);
    await writeFile(
      join(runDir, "assessment.json"),
      JSON.stringify(assessment, null, 2),
      "utf8",
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
      body: { includeMinigames: ["errand"] },
    });

    expect(sent.status).toBe(200);
    expect(prompts[0]?.text).toContain("only: errand");
    expect(prompts[0]?.text).toContain("errand: 93/100");
    expect(prompts[0]?.text).not.toContain("runner: 72/100");
    const updated = JSON.parse(
      await readFile(join(runDir, "manifest.json"), "utf8"),
    ) as { cockpit?: { messages?: string[] } };
    expect(updated.cockpit?.messages?.at(-1)).toContain("(errand only)");
  });

  it("send-findings appends followUpInstruction to the message", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-followup-note";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const manifest = createInitialManifest(runId);
    manifest.cloud = { planAgentId: "agent-plan-1" };
    await saveManifest(runDir, manifest);
    await writeFile(
      join(runDir, "assessment.json"),
      JSON.stringify(assessment, null, 2),
      "utf8",
    );
    const prompts: { text: string }[] = [];
    const api = createCockpitApi({
      repoRoot,
      sendFollowUpToAgent: async (_id, text) => {
        prompts.push({ text });
        return { status: "queued" };
      },
    });

    const sent = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/send-findings`,
      body: {
        followUpInstruction: "After fixes, record a new errand demo.",
      },
    });

    expect(sent.status).toBe(200);
    expect(prompts[0]?.text).toContain(
      "After fixes, record a new errand demo.",
    );
    expect(prompts[0]?.text).toContain("Additional instructions (QA cockpit");
  });

  it("share passes includeMinigames to writeShareBundle", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-share-scope";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const manifest = createInitialManifest(runId);
    await saveManifest(runDir, manifest);
    await writeFile(
      join(runDir, "assessment.json"),
      JSON.stringify(assessment, null, 2),
      "utf8",
    );
    const calls: { includeMinigames?: string[] }[] = [];
    const api = createCockpitApi({
      repoRoot,
      writeShareBundle: async (_root, _m, _a, opts) => {
        calls.push(opts ?? {});
      },
    });

    const res = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/share`,
      body: { includeMinigames: ["errand"] },
    });

    expect(res.status).toBe(200);
    expect(calls[0]?.includeMinigames).toEqual(["errand"]);
  });

  it("send-findings uses cloud.agents when customCloudAgents is empty (agents-table only)", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-agents-only";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const manifest = createInitialManifest(runId);
    manifest.cloud = {
      agents: [
        {
          role: "custom",
          agentId: "bug-detective-qa-custom-run-tablesync",
          startedAt: "2026-01-01T00:00:00.000Z",
          selectedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    };
    manifest.assessmentPath = `artifacts/qa-runs/${runId}/assessment.json`;
    await saveManifest(runDir, manifest);
    await writeFile(
      join(runDir, "assessment.json"),
      JSON.stringify(assessment, null, 2),
      "utf8",
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
    expect(prompts[0]?.agentId).toBe("bug-detective-qa-custom-run-tablesync");
  });

  it("send-findings uses last custom cloud agent when record/plan are unset", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-custom-only";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const manifest = createInitialManifest(runId);
    manifest.cloud = {
      customCloudAgents: [
        {
          agentId: "bug-detective-qa-custom-run-moehtkrt-n6neob",
          roleLabel: "custom",
          startedAt: "2026-04-26T00:00:00.000Z",
        },
      ],
    };
    manifest.assessmentPath = `artifacts/qa-runs/${runId}/assessment.json`;
    await saveManifest(runDir, manifest);
    await writeFile(
      join(runDir, "assessment.json"),
      JSON.stringify(assessment, null, 2),
      "utf8",
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
    expect(prompts[0]?.agentId).toBe(
      "bug-detective-qa-custom-run-moehtkrt-n6neob",
    );
  });

  it("send-findings uses recordAgentId when there is no plan agent yet", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-rec-only";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const manifest = createInitialManifest(runId);
    manifest.cloud = { recordAgentId: "agent-record-9" };
    manifest.assessmentPath = `artifacts/qa-runs/${runId}/assessment.json`;
    await saveManifest(runDir, manifest);
    await writeFile(
      join(runDir, "assessment.json"),
      JSON.stringify(assessment, null, 2),
      "utf8",
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
    expect(prompts[0]?.agentId).toBe("agent-record-9");
    const updated = JSON.parse(
      await readFile(join(runDir, "manifest.json"), "utf8"),
    ) as { cloud?: { planAgentId?: string; selectedAgentId?: string } };
    expect(updated.cloud?.planAgentId).toBeUndefined();
    expect(updated.cloud?.selectedAgentId).toBe("agent-record-9");
  });

  it("send-findings waits for the initial plan run before follow-up when starting a new plan agent", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-new-plan";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const manifest = createInitialManifest(runId);
    manifest.assessmentPath = `artifacts/qa-runs/${runId}/assessment.json`;
    await saveManifest(runDir, manifest);
    await writeFile(
      join(runDir, "assessment.json"),
      JSON.stringify(assessment, null, 2),
      "utf8",
    );

    const order: string[] = [];
    const fakeRun = {
      wait: async () => {
        order.push("wait-plan-run");
        return { id: "r1", status: "finished" as const };
      },
    };

    const api = createCockpitApi({
      repoRoot,
      startPlanCloudAgent: async () => {
        order.push("start-plan");
        return {
          agentId: "agent-plan-new",
          runId: "run-cloud-1",
          run: fakeRun as CloudAgentStart["run"],
        };
      },
      sendFollowUpToAgent: async () => {
        order.push("follow-up");
        return { status: "queued" };
      },
    });

    const sent = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/send-findings`,
    });

    expect(sent.status).toBe(200);
    expect(order).toEqual(["start-plan", "wait-plan-run", "follow-up"]);
  });

  it("send-findings retries when follow-up returns agent_busy", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-busy";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const manifest = createInitialManifest(runId);
    manifest.cloud = { planAgentId: "agent-plan-busy" };
    manifest.assessmentPath = `artifacts/qa-runs/${runId}/assessment.json`;
    await saveManifest(runDir, manifest);
    await writeFile(
      join(runDir, "assessment.json"),
      JSON.stringify(assessment, null, 2),
      "utf8",
    );

    let calls = 0;
    const api = createCockpitApi({
      repoRoot,
      sendFollowUpToAgent: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("[agent_busy] Agent already has an active run");
        }
        return { status: "queued" };
      },
    });

    const sent = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/send-findings`,
    });

    expect(sent.status).toBe(200);
    expect(calls).toBe(2);
  }, 12_000);

  it("builds a concise follow-up prompt with failing scores and recommended fixes", () => {
    const prompt = createFindingsPrompt(
      createInitialManifest("run-1"),
      assessment,
    );

    expect(prompt).toContain("Run: run-1");
    expect(prompt).toContain("Failing (all minigames): runner");
    expect(prompt).toContain("runner: 72/100");
    expect(prompt).toContain("Buffer jump inputs near platform edges.");
  });

  it("createFindingsPrompt can scope to selected minigames", () => {
    const prompt = createFindingsPrompt(
      createInitialManifest("run-1"),
      assessment,
      { includeMinigames: ["errand"] },
    );
    expect(prompt).toContain("only: errand");
    expect(prompt).toContain("errand: 93/100");
    expect(prompt).not.toContain("runner: 72/100");
  });

  it("createFindingsPrompt appends followUpInstruction when set", () => {
    const prompt = createFindingsPrompt(
      createInitialManifest("run-1"),
      assessment,
      {
        followUpInstruction: "Re-record runner after patch.",
      },
    );
    expect(prompt).toContain("Re-record runner after patch.");
    expect(prompt).toContain("Additional instructions (QA cockpit");
  });

  it("parseHandoffMinigames validates and normalizes", () => {
    expect(parseHandoffMinigames({})).toBeUndefined();
    expect(parseHandoffMinigames({ includeMinigames: ["errand"] })).toEqual([
      "errand",
    ]);
    expect(
      parseHandoffMinigames({
        includeMinigames: ["tamper", "runner", "sentence", "errand"],
      }),
    ).toBeUndefined();
    expect(() => parseHandoffMinigames({ includeMinigames: [] })).toThrowError(
      /at least one/,
    );
    expect(() =>
      parseHandoffMinigames({ includeMinigames: ["bogus"] }),
    ).toThrowError(/invalid slot/);
    expect(() =>
      parseHandoffMinigames({ includeMinigames: "errand" }),
    ).toThrow();
  });

  it("parseFollowUpInstruction validates", () => {
    expect(parseFollowUpInstruction({})).toBeUndefined();
    expect(
      parseFollowUpInstruction({
        followUpInstruction: "  hello  ",
      }),
    ).toBe("hello");
    expect(() =>
      parseFollowUpInstruction({ followUpInstruction: 1 }),
    ).toThrowError(/string/);
  });

  it("lists cockpit agents from manifest cloud and custom entries", () => {
    const m = createInitialManifest("run-agents");
    m.cloud = {
      planAgentId: "agent-plan-x",
      latestArtifactAgentId: "agent-custom-1",
      customCloudAgents: [
        {
          agentId: "agent-custom-1",
          roleLabel: "review",
          startedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    };
    const agents = listCockpitAgents(m);
    expect(agents.map((a) => a.agentId).sort()).toEqual(
      ["agent-custom-1", "agent-plan-x"].sort(),
    );
    expect(agents.find((a) => a.agentId === "agent-custom-1")?.source).toBe(
      "custom",
    );
  });

  it("GET /api/runs/:id/recipe-prompts returns the same text as recordPrompt for record + plan", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-recipe-api";
    await saveManifest(
      defaultArtifactsDir(repoRoot, runId),
      createInitialManifest(runId),
    );
    const api = createCockpitApi({ repoRoot });

    const res = await api.handle({
      method: "GET",
      pathname: `/api/runs/${runId}/recipe-prompts`,
    });

    expect(res.status).toBe(200);
    expect(res.body.record).toBe(recordingAgentPrompt(runId));
    expect(res.body.plan).toBe(planAgentPrompt(runId));
  });

  it("GET /api/runs/:id/agents returns merged agent rows", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-agents-get";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const manifest = createInitialManifest(runId);
    manifest.cloud = { recordAgentId: "bc-record-1" };
    await saveManifest(runDir, manifest);
    const api = createCockpitApi({ repoRoot });

    const res = await api.handle({
      method: "GET",
      pathname: `/api/runs/${runId}/agents`,
    });

    expect(res.status).toBe(200);
    expect(res.body.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "bc-record-1",
          role: "record",
          source: "builtin",
        }),
      ]),
    );
  });

  it("POST agents/start uses injected startCustomCloudAgent and updates manifest", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-start-custom";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    await saveManifest(runDir, createInitialManifest(runId));
    let sawRole = "";
    const api = createCockpitApi({
      repoRoot,
      startCustomCloudAgent: async (_root, rid, prompt, role) => {
        sawRole = String(role);
        expect(rid).toBe(runId);
        expect(prompt).toBe("Do the thing");
        return {
          agentId: "mock-agent-99",
          runId: "mock-run-zz",
          run: { status: "mocked" },
        } as unknown as CloudAgentStart;
      },
    });

    const res = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/agents/start`,
      body: { prompt: "Do the thing", role: "plan" },
    });

    expect(res.status).toBe(200);
    expect(sawRole).toBe("plan");
    expect(res.body.agentId).toBe("mock-agent-99");
    expect(res.body.result).toEqual({ status: "mocked" });
    expect(res.body.agent).toEqual(
      expect.objectContaining({
        agentId: "mock-agent-99",
        runId: "mock-run-zz",
        displayName: "plan",
        lastPromptPreview: "Do the thing",
      }),
    );
    expect(res.body.manifest.cloud?.selectedAgentId).toBe("mock-agent-99");
    expect(res.body.manifest.cloud?.selectedRunId).toBe("mock-run-zz");
    const disk = JSON.parse(
      await readFile(join(runDir, "manifest.json"), "utf8"),
    ) as {
      cloud?: {
        latestArtifactAgentId?: string;
        customCloudAgents?: { agentId: string; roleLabel: string }[];
      };
    };
    expect(disk.cloud?.latestArtifactAgentId).toBe("mock-agent-99");
    expect(disk.cloud?.customCloudAgents?.at(-1)?.roleLabel).toBe("plan");

    const agents = await api.handle({
      method: "GET",
      pathname: `/api/runs/${runId}/agents`,
    });
    expect(agents.status).toBe(200);
    expect(
      agents.body.agents.some(
        (a: { agentId: string }) => a.agentId === "mock-agent-99",
      ),
    ).toBe(true);
  });

  it("POST agents/start stores friendlyName as displayName in manifest", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-friendly";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    await saveManifest(runDir, createInitialManifest(runId));
    const api = createCockpitApi({
      repoRoot,
      startCustomCloudAgent: async () =>
        ({
          agentId: "bc-friendly-1",
          runId: "cloud-run-aa",
          run: { status: "mocked" },
        }) as unknown as CloudAgentStart,
    });

    const res = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/agents/start`,
      body: {
        prompt: "Check runner",
        role: "custom",
        friendlyName: "Runner smoke review",
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.agent?.displayName).toBe("Runner smoke review");
    const disk = JSON.parse(
      await readFile(join(runDir, "manifest.json"), "utf8"),
    ) as { cloud?: { agents?: { agentId?: string; displayName?: string }[] } };
    const row = disk.cloud?.agents?.find((x) => x.agentId === "bc-friendly-1");
    expect(row?.displayName).toBe("Runner smoke review");
  });

  it("POST agents/:id/followup delegates to sendFollowUpToAgent mock", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-follow";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    await saveManifest(runDir, createInitialManifest(runId));
    const calls: { id: string; text: string }[] = [];
    const api = createCockpitApi({
      repoRoot,
      sendFollowUpToAgent: async (agentId, text) => {
        calls.push({ id: agentId, text });
        return { ok: true };
      },
    });

    const res = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/agents/bc-follow-target/followup`,
      body: { prompt: "Second task" },
    });

    expect(res.status).toBe(200);
    expect(calls).toEqual([{ id: "bc-follow-target", text: "Second task" }]);
    expect(res.body.result).toEqual({ ok: true });
    expect(res.body.agent).toEqual(
      expect.objectContaining({
        agentId: "bc-follow-target",
        lastPromptPreview: "Second task",
        lastFollowUpText: "Second task",
      }),
    );
    const disk = JSON.parse(
      await readFile(join(runDir, "manifest.json"), "utf8"),
    ) as { cockpit?: { messages?: string[] } };
    expect(
      disk.cockpit?.messages?.some((m) => m.includes("Retry/follow-up sent")),
    ).toBe(true);
  });

  it("GET agents/:id/details writes local JSON and updates cloud agent ref", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-details";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    await saveManifest(runDir, createInitialManifest(runId));
    const api = createCockpitApi({
      repoRoot,
      fetchCloudAgentStatus: async () => ({
        id: "bc-x",
        target: { url: "https://cursor.com/agents?id=bc_x_encoded" },
      }),
      fetchCloudAgentConversation: async () => ({
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const res = await api.handle({
      method: "GET",
      pathname: `/api/runs/${runId}/agents/bc-x/details`,
    });

    expect(res.status).toBe(200);
    expect(res.body.dashboardUrl).toBe(
      "https://cursor.com/agents?id=bc_x_encoded",
    );
    expect(res.body.conversationPath).toBe(
      "artifacts/qa-runs/run-details/agent-conversations/bc-x.json",
    );
    const convoFile = join(runDir, "agent-conversations", "bc-x.json");
    const local = JSON.parse(await readFile(convoFile, "utf8")) as {
      agentId: string;
      conversation: { messages: { role: string; content: string }[] };
    };
    expect(local.agentId).toBe("bc-x");
    expect(local.conversation.messages[0]?.content).toBe("hi");
    const m = JSON.parse(
      await readFile(join(runDir, "manifest.json"), "utf8"),
    ) as {
      cloud?: {
        agents?: {
          agentId: string;
          dashboardUrl?: string;
          conversationPath?: string;
        }[];
      };
    };
    const row = m.cloud?.agents?.find((a) => a.agentId === "bc-x");
    expect(row?.dashboardUrl).toBe("https://cursor.com/agents?id=bc_x_encoded");
    expect(row?.conversationPath).toBe(
      "artifacts/qa-runs/run-details/agent-conversations/bc-x.json",
    );
  });

  it("GET agents/:id/details falls back to cursor.com agents URL when status has no target", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-fallback";
    await saveManifest(
      defaultArtifactsDir(repoRoot, runId),
      createInitialManifest(runId),
    );
    const api = createCockpitApi({
      repoRoot,
      fetchCloudAgentStatus: async () => ({}),
      fetchCloudAgentConversation: async () => ({ messages: [] }),
    });

    const res = await api.handle({
      method: "GET",
      pathname: `/api/runs/${runId}/agents/bc-fallback/details`,
    });

    expect(res.status).toBe(200);
    expect(res.body.dashboardUrl).toBe(
      "https://cursor.com/agents?id=bc-fallback",
    );
  });

  it("POST agents/select sets latestArtifactAgentId for artifact list", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-select";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    await saveManifest(runDir, createInitialManifest(runId));
    const resumed: string[] = [];
    const api = createCockpitApi({
      repoRoot,
      resumeArtifactAgent: (agentId) => {
        resumed.push(agentId);
        return {
          listArtifacts: async () => [
            { path: "artifacts/qa-runs/run-select/videos/runner.webm" },
          ],
          downloadArtifact: async () => Buffer.from("unused"),
        };
      },
    });

    const selected = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/agents/select`,
      body: { agentId: "bc-pasted-1" },
    });

    expect(selected.status).toBe(200);
    expect(selected.body.agent).toEqual(
      expect.objectContaining({ agentId: "bc-pasted-1" }),
    );
    expect(selected.body.manifest.cloud?.selectedAgentId).toBe("bc-pasted-1");
    expect(selected.body.manifest.cloud?.latestArtifactAgentId).toBe(
      "bc-pasted-1",
    );

    const listed = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/artifacts/list`,
      body: {},
    });

    expect(listed.status).toBe(200);
    expect(resumed).toEqual(["bc-pasted-1"]);
    expect(listed.body.artifacts).toEqual([
      expect.objectContaining({
        path: "artifacts/qa-runs/run-select/videos/runner.webm",
        sourceAgentId: "bc-pasted-1",
      }),
    ]);
  });

  it("POST artifacts/assign persists cockpit.artifactSlotOverrides and re-classifies list", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-art-assign";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const cloudPath = "artifacts/bug-detective-runner-list.webm";
    const manifest = createInitialManifest(runId);
    manifest.artifactSnapshots = [
      { path: cloudPath, listedAt: "2026-01-01T00:00:00.000Z", size: 1 },
    ];
    await saveManifest(runDir, manifest);
    const api = createCockpitApi({ repoRoot });
    const res = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/artifacts/assign`,
      body: {
        assignments: { [cloudPath]: "sentence" },
      },
    });
    expect(res.status).toBe(200);
    const disk = JSON.parse(
      await readFile(join(runDir, "manifest.json"), "utf8"),
    ) as { cockpit?: { artifactSlotOverrides?: Record<string, string> } };
    expect(disk.cockpit?.artifactSlotOverrides?.[cloudPath]).toBe("sentence");
    const snap = res.body.manifest.artifactSnapshots?.[0] as
      | { classification?: { slot?: string; fromOverride?: boolean } }
      | undefined;
    expect(snap?.classification?.slot).toBe("sentence");
    expect(snap?.classification?.fromOverride).toBe(true);
  });

  it("POST artifacts/download applies manifest artifactSlotOverrides for loose ambiguous paths", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-art-dl-override";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const cloudPath = "artifacts/bug-detective-qa-custom-run-zz.webm";
    const manifest = createInitialManifest(runId);
    manifest.cloud = {
      selectedAgentId: "bc-test-art",
      latestArtifactAgentId: "bc-test-art",
    };
    manifest.cockpit = {
      phase: "idle",
      ...manifest.cockpit,
      artifactSlotOverrides: { [cloudPath]: "tamper" },
    };
    await saveManifest(runDir, manifest);
    const api = createCockpitApi({
      repoRoot,
      resumeArtifactAgent: () => ({
        listArtifacts: async () => [
          {
            path: cloudPath,
            sizeBytes: 4,
            updatedAt: "2026-04-26T12:00:00.000Z",
          },
        ],
        downloadArtifact: async (p: string) => Buffer.from(`data:${p}`),
      }),
    });
    const dl = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/artifacts/download`,
      body: { agentId: "bc-test-art" },
    });
    expect(dl.status).toBe(200);
    expect(dl.body.downloaded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: cloudPath,
          status: "downloaded",
          relativePath: "videos/tamper.webm",
        }),
      ]),
    );
    const m = dl.body.manifest as { videos?: { tamper?: string } };
    expect(m.videos?.tamper).toContain("tamper.webm");
  });

  it("parseFocusedLoopStartBody rejects invalid slot and missing allowImplement", () => {
    expect(() =>
      parseFocusedLoopStartBody({ slot: "nope", allowImplement: true }),
    ).toThrow(/slot must be one of/);
    expect(() =>
      parseFocusedLoopStartBody({ slot: "errand", allowImplement: false }),
    ).toThrow(/allowImplement must be true/);
    expect(() =>
      parseFocusedLoopStartBody({ slot: "errand", allowImplement: true }),
    ).not.toThrow();
  });

  it("GET run marks stale focused loop interrupted when not active in-process", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-cockpit-"));
    const runId = "run-stale-fl";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const started = "2026-04-26T12:00:00.000Z";
    const manifest = createInitialManifest(runId);
    manifest.cockpit = {
      phase: "idle",
      focusedLoop: {
        slot: "errand",
        targetScore: 90,
        attempt: 1,
        maxAttempts: 2,
        status: "running",
        stage: "implement",
        startedAt: started,
        updatedAt: started,
      },
    };
    await saveManifest(runDir, manifest);
    const api = createCockpitApi({ repoRoot });
    const res = await api.handle({
      method: "GET",
      pathname: `/api/runs/${runId}`,
    });
    expect(res.status).toBe(200);
    const fl = res.body.manifest.cockpit?.focusedLoop as
      | { status?: string; error?: string }
      | undefined;
    expect(fl?.status).toBe("interrupted");
    expect(fl?.error).toMatch(/server restarted/i);
  });

  it("focused loop sends scoped assessment and stops when score reaches target", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-fl-"));
    const runId = "run-fl-ok";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const manifest = createInitialManifest(runId);
    manifest.cloud = { planAgentId: "agent-plan-fl" };
    manifest.videos = {
      errand: `artifacts/qa-runs/${runId}/videos/errand.webm`,
    };
    manifest.assessmentPath = `artifacts/qa-runs/${runId}/assessment.json`;
    await saveManifest(runDir, manifest);
    await writeFile(
      join(runDir, "assessment.json"),
      JSON.stringify(assessment, null, 2),
      "utf8",
    );
    const prompts: string[] = [];
    const fakeWait = async () =>
      ({
        status: "finished" as const,
        git: { branches: [{ prUrl: "https://pr.example/foo" }] },
      }) as const;
    const api = createCockpitApi({
      repoRoot,
      sendFollowUpToAgent: async (_id, text) => {
        prompts.push(text);
        return { status: "queued" };
      },
      startImplementCloudAgent: async () => ({
        agentId: "impl-fl",
        runId: "run-impl",
        run: { wait: fakeWait } as unknown as CloudAgentStart["run"],
      }),
      startCustomCloudAgent: async () => ({
        agentId: "rec-fl",
        runId: "run-rec",
        run: { wait: fakeWait } as unknown as CloudAgentStart["run"],
      }),
      downloadRunArtifacts: async (opts) => ({
        manifest: opts.manifest,
        artifacts: [],
        downloaded: [],
        failed: [],
      }),
      runAssessForRunId: async (_rid, options) => {
        expect(options?.includeMinigames).toEqual(["errand"]);
        await writeFile(
          join(runDir, "assessment.json"),
          JSON.stringify({
            ...assessment,
            byMinigame: {
              ...assessment.byMinigame,
              errand: { ...assessment.byMinigame.errand, score100: 95 },
            },
          }),
          "utf8",
        );
        return { allPassed: true };
      },
    });
    const res = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/focused-loop/start`,
      body: {
        slot: "errand",
        targetScore: 90,
        maxAttempts: 2,
        allowImplement: true,
      },
    });
    expect(res.status).toBe(200);
    for (let i = 0; i < 80; i++) {
      const disk = JSON.parse(
        await readFile(join(runDir, "manifest.json"), "utf8"),
      ) as { cockpit?: { focusedLoop?: { status?: string } } };
      if (disk.cockpit?.focusedLoop?.status === "done") break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const final = JSON.parse(
      await readFile(join(runDir, "manifest.json"), "utf8"),
    ) as {
      cockpit?: {
        focusedLoop?: { status?: string; success?: boolean };
      };
    };
    expect(final.cockpit?.focusedLoop?.status).toBe("done");
    expect(final.cockpit?.focusedLoop?.success).toBe(true);
    expect(prompts[0]).toContain("only: errand");
    expect(prompts[0]).not.toContain("runner: 72");
  }, 15_000);

  it("focused loop fails after maxAttempts when score stays below target", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-fl-fail"));
    const runId = "run-fl-low";
    const runDir = defaultArtifactsDir(repoRoot, runId);
    const manifest = createInitialManifest(runId);
    manifest.cloud = { planAgentId: "agent-plan-fl2" };
    manifest.videos = {
      errand: `artifacts/qa-runs/${runId}/videos/errand.webm`,
    };
    manifest.assessmentPath = `artifacts/qa-runs/${runId}/assessment.json`;
    await saveManifest(runDir, manifest);
    await writeFile(
      join(runDir, "assessment.json"),
      JSON.stringify(assessment, null, 2),
      "utf8",
    );
    const fakeWait = async () =>
      ({ status: "finished" as const, git: { branches: [] } }) as const;
    const api = createCockpitApi({
      repoRoot,
      sendFollowUpToAgent: async () => ({ status: "queued" }),
      startImplementCloudAgent: async () => ({
        agentId: "impl-fl2",
        runId: "r2",
        run: { wait: fakeWait } as unknown as CloudAgentStart["run"],
      }),
      startCustomCloudAgent: async () => ({
        agentId: "rec-fl2",
        runId: "r3",
        run: { wait: fakeWait } as unknown as CloudAgentStart["run"],
      }),
      downloadRunArtifacts: async (opts) => ({
        manifest: opts.manifest,
        artifacts: [],
        downloaded: [],
        failed: [],
      }),
      runAssessForRunId: async () => {
        await writeFile(
          join(runDir, "assessment.json"),
          JSON.stringify({
            ...assessment,
            byMinigame: {
              ...assessment.byMinigame,
              errand: { ...assessment.byMinigame.errand, score100: 70 },
            },
          }),
          "utf8",
        );
        return { allPassed: false };
      },
    });
    const res = await api.handle({
      method: "POST",
      pathname: `/api/runs/${runId}/focused-loop/start`,
      body: {
        slot: "errand",
        targetScore: 90,
        maxAttempts: 1,
        allowImplement: true,
      },
    });
    expect(res.status).toBe(200);
    for (let i = 0; i < 100; i++) {
      const disk = JSON.parse(
        await readFile(join(runDir, "manifest.json"), "utf8"),
      ) as { cockpit?: { focusedLoop?: { status?: string } } };
      if (disk.cockpit?.focusedLoop?.status === "failed") break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const final = JSON.parse(
      await readFile(join(runDir, "manifest.json"), "utf8"),
    ) as {
      cockpit?: {
        focusedLoop?: { status?: string; error?: string; lastScore?: number };
      };
    };
    expect(final.cockpit?.focusedLoop?.status).toBe("failed");
    expect(final.cockpit?.focusedLoop?.lastScore).toBe(70);
    expect(final.cockpit?.focusedLoop?.error).toMatch(/below target/);
  }, 20_000);
});
