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
    g.pinNotebookPage("sticky", {
      clueToken: "B",
      gameScore: 100,
      solvedAtMs: t0,
    });
    g.pinNotebookPage("clock", {
      clueToken: "C",
      gameScore: 100,
      solvedAtMs: t0,
    });
    expect(g.enterAnswering(t0 + 200)).toBe(false);
    g.pinNotebookPage("photo", {
      clueToken: "D",
      gameScore: 100,
      solvedAtMs: t0,
    });
    expect(g.enterAnswering(t0 + 300)).toBe(true);
    expect(g.phase.kind).toBe("answering");
  });
});
