import { describe, it, expect } from "vitest";
import {
  BASE_SCORE,
  CLUE_PENALTY_PER_HOVER,
  TIME_PENALTY_PER_SEC,
  WRONG_ANSWER_FLOOR,
  computeScore,
} from "../src/game/score";

describe("computeScore", () => {
  it("wrong answer always returns WRONG_ANSWER_FLOOR (0)", () => {
    expect(
      computeScore({ correct: false, elapsedMs: 0, cluesUsed: 0 }),
    ).toBe(WRONG_ANSWER_FLOOR);
    expect(
      computeScore({ correct: false, elapsedMs: 5000, cluesUsed: 4 }),
    ).toBe(WRONG_ANSWER_FLOOR);
  });

  it("perfect run (correct, 0s, 0 clues) returns BASE_SCORE", () => {
    expect(
      computeScore({ correct: true, elapsedMs: 0, cluesUsed: 0 }),
    ).toBe(BASE_SCORE);
  });

  it("subtracts TIME_PENALTY_PER_SEC * floor(elapsedSec)", () => {
    // 30s elapsed → -30*4 = -120
    expect(
      computeScore({ correct: true, elapsedMs: 30_000, cluesUsed: 0 }),
    ).toBe(BASE_SCORE - 30 * TIME_PENALTY_PER_SEC);
    // 30.9s elapsed → still -30*4 (floor)
    expect(
      computeScore({ correct: true, elapsedMs: 30_900, cluesUsed: 0 }),
    ).toBe(BASE_SCORE - 30 * TIME_PENALTY_PER_SEC);
  });

  it("subtracts CLUE_PENALTY_PER_HOVER * cluesUsed", () => {
    expect(
      computeScore({ correct: true, elapsedMs: 0, cluesUsed: 3 }),
    ).toBe(BASE_SCORE - 3 * CLUE_PENALTY_PER_HOVER);
  });

  it("never returns a negative score", () => {
    // 90s elapsed (-360) + 20 clues (-1000) = -360 against base 1000 → 0 floor.
    expect(
      computeScore({ correct: true, elapsedMs: 90_000, cluesUsed: 20 }),
    ).toBe(0);
  });

  it("at exactly 90s + 0 clues, score = 1000 - 90*4 = 640", () => {
    expect(
      computeScore({ correct: true, elapsedMs: 90_000, cluesUsed: 0 }),
    ).toBe(BASE_SCORE - 90 * TIME_PENALTY_PER_SEC);
  });

  it("realistic mid-round: correct, 22s, 2 clues → 1000 - 88 - 100 = 812", () => {
    expect(
      computeScore({ correct: true, elapsedMs: 22_000, cluesUsed: 2 }),
    ).toBe(812);
  });
});
