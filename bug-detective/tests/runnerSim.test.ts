import { describe, expect, it } from "vitest";
import {
  createRunnerSim,
  deriveRunnerSeed,
  stepRunnerSim,
} from "../src/minigames/runner/sim";

const CFG = {
  canvasW: 512,
  canvasH: 320,
  dailyGoalDistance: 2600,
};

describe("runner sim", () => {
  it("deriveRunnerSeed is stable", () => {
    expect(deriveRunnerSeed(12345)).toBe((12345 ^ 0x9e3779b9) >>> 0);
  });

  it("daily course is deterministic for a fixed seed", () => {
    const a = createRunnerSim(99, "daily", CFG);
    const b = createRunnerSim(99, "daily", CFG);
    expect(a.planks.length).toBe(b.planks.length);
    expect(a.planks[0]).toEqual(b.planks[0]);
  });

  it("reaches daily finish with jumps (smoke)", () => {
    let s = createRunnerSim(42, "daily", CFG);
    let steps = 0;
    while (!s.finished && !s.failed && steps < 8000) {
      const jump = steps % 18 === 3;
      s = stepRunnerSim(s, 1 / 60, jump, CFG);
      steps++;
    }
    expect(s.finished).toBe(true);
    expect(s.failed).toBe(false);
  });
});
