import { describe, expect, it } from "vitest";
import { GameState } from "../src/game/gameState";

describe("notebook gating", () => {
  it("submit is blocked until all four pages are pinned", () => {
    const g = new GameState();
    const t0 = 1000;
    g.enterInvestigating(t0);
    expect(g.enterAnswering(t0 + 100)).toBe(false);
    g.pinNotebookPage("runner", {
      clueToken: "A",
      gameScore: 100,
      solvedAtMs: t0,
    });
    g.pinNotebookPage("sentence", {
      clueToken: "B",
      gameScore: 100,
      solvedAtMs: t0,
    });
    g.pinNotebookPage("errand", {
      clueToken: "C",
      gameScore: 100,
      solvedAtMs: t0,
    });
    expect(g.enterAnswering(t0 + 200)).toBe(false);
    g.pinNotebookPage("tamper", {
      clueToken: "D",
      gameScore: 100,
      solvedAtMs: t0,
    });
    expect(g.enterAnswering(t0 + 300)).toBe(true);
    expect(g.phase.kind).toBe("answering");
  });

  it("allows daily runner again after monitor clear and resumes desk from results", () => {
    const g = new GameState();
    const t0 = 5000;
    g.enterInvestigating(t0);
    g.phase = {
      kind: "investigating",
      startedAt: t0,
      notebook: {},
      monitorDailyClear: true,
    };
    expect(g.enterRunner(t0 + 1, "daily")).toBe(true);
    expect(g.phase.kind).toBe("runner");
    g.returnToInvestigatingFromRunner({});
    expect(g.phase.kind).toBe("investigating");
    if (g.phase.kind !== "investigating")
      throw new Error("expected investigating");
    g.phase = {
      kind: "results",
      correct: true,
      score: 100,
      notebook: g.phase.notebook,
      elapsedMs: 10,
      breakdown: {
        weightedSum: 0,
        timePenalty: 0,
        perGame: { runner: 0, sentence: 0, errand: 0, tamper: 0 },
        baseScore: 0,
      },
      monitorDailyClear: true,
    };
    expect(g.resumeInvestigatingFromResults(t0 + 999)).toBe(true);
    expect(g.phase.kind).toBe("investigating");
    if (g.phase.kind !== "investigating")
      throw new Error("expected investigating");
    expect(g.phase.monitorDailyClear).toBe(true);
  });
});
