import { describe, expect, it, beforeEach } from "vitest";
import {
  clearSessionScores,
  getSessionScoreboardView,
  recordMinigameScore,
  recordRunnerEndlessClimb,
  __testGetSlot,
  __testGetRunnerEndless,
} from "../../src/game/sessionScoreboard";

beforeEach(() => {
  clearSessionScores();
});

describe("sessionScoreboard", () => {
  it("records latest and best; increments attempts", () => {
    expect(__testGetSlot("tamper").attempts).toBe(0);
    const a = recordMinigameScore("tamper", 400, 1);
    expect(a.newBest).toBe(true);
    expect(__testGetSlot("tamper").bestScore).toBe(400);
    expect(__testGetSlot("tamper").latestScore).toBe(400);
    expect(__testGetSlot("tamper").attempts).toBe(1);

    const b = recordMinigameScore("tamper", 500, 2);
    expect(b.newBest).toBe(true);
    expect(__testGetSlot("tamper").bestScore).toBe(500);
    expect(__testGetSlot("tamper").latestScore).toBe(500);
    expect(__testGetSlot("tamper").attempts).toBe(2);

    const c = recordMinigameScore("tamper", 300, 3);
    expect(c.newBest).toBe(false);
    expect(__testGetSlot("tamper").bestScore).toBe(500);
    expect(__testGetSlot("tamper").latestScore).toBe(300);
    expect(__testGetSlot("tamper").attempts).toBe(3);
  });

  it("clears all slots and runner endless on clearSessionScores", () => {
    recordMinigameScore("runner", 800, 1);
    recordMinigameScore("sentence", 600, 2);
    recordRunnerEndlessClimb(99, 3);
    expect(__testGetSlot("runner").attempts).toBe(1);
    expect(__testGetRunnerEndless().climbAttempts).toBe(1);

    clearSessionScores();
    expect(__testGetSlot("runner").attempts).toBe(0);
    expect(__testGetSlot("sentence").attempts).toBe(0);
    expect(__testGetRunnerEndless().climbAttempts).toBe(0);
  });

  it("tracks runner endless climb without changing clue-slot scores from endless alone", () => {
    recordRunnerEndlessClimb(50, 1);
    expect(__testGetSlot("runner").attempts).toBe(0);
    const e = __testGetRunnerEndless();
    expect(e.bestClimbM).toBe(50);
    expect(e.latestClimbM).toBe(50);
    expect(e.climbAttempts).toBe(1);

    const g = recordRunnerEndlessClimb(30, 2);
    expect(g.newBest).toBe(false);
    expect(__testGetRunnerEndless().bestClimbM).toBe(50);
    expect(__testGetRunnerEndless().latestClimbM).toBe(30);
  });

  it("getSessionScoreboardView includes formatted RUNNER line with clue and endless", () => {
    recordMinigameScore("runner", 400, 1);
    recordRunnerEndlessClimb(12, 2);
    const v = getSessionScoreboardView();
    const run = v.rows.find((r) => r.slot === "runner");
    expect(run?.line).toContain("clue");
    expect(run?.line).toContain("endless");
    expect(run?.line).toContain("12m");
  });
});
