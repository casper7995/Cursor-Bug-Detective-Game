import { describe, it, expect } from "vitest";
import { WRONG_ANSWER_FLOOR, computeScore } from "../src/game/score";
import type { NotebookState } from "../src/game/notebook";

function nb(partial: NotebookState): NotebookState {
  const now = 1;
  const page = (gameScore: number) => ({
    clueToken: "X",
    gameScore,
    solvedAtMs: now,
  });
  return {
    runner: partial.runner ?? page(1000),
    sentence: partial.sentence ?? page(1000),
    errand: partial.errand ?? page(1000),
    tamper: partial.tamper ?? page(1000),
  };
}

describe("computeScore", () => {
  it("wrong answer always returns 0", () => {
    expect(
      computeScore({
        correct: false,
        elapsedMs: 0,
        notebook: nb({}),
      }).score,
    ).toBe(WRONG_ANSWER_FLOOR);
  });

  it("all games 1000, 0s → weighted sum 1000 + base 1000", () => {
    expect(
      computeScore({ correct: true, elapsedMs: 0, notebook: nb({}) }).score,
    ).toBe(2000);
  });

  it("applies 25 pts per full minute elapsed", () => {
    expect(
      computeScore({ correct: true, elapsedMs: 60_000, notebook: nb({}) })
        .score,
    ).toBe(1975);
    expect(
      computeScore({ correct: true, elapsedMs: 119_999, notebook: nb({}) })
        .score,
    ).toBe(1975);
  });

  it("weighted game scores: exact mix", () => {
    const notebook: NotebookState = {
      runner: { clueToken: "a", gameScore: 300, solvedAtMs: 1 },
      sentence: { clueToken: "b", gameScore: 400, solvedAtMs: 1 },
      errand: { clueToken: "c", gameScore: 500, solvedAtMs: 1 },
      tamper: { clueToken: "d", gameScore: 600, solvedAtMs: 1 },
    };
    const { score, breakdown } = computeScore({
      correct: true,
      elapsedMs: 0,
      notebook,
    });
    // Equal 0.25 weights → (300+400+500+600)/4 = 450; final = 450 + 1000.
    expect(breakdown.weightedSum).toBeCloseTo(450, 5);
    expect(score).toBe(1450);
  });
});
