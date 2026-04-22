/**
 * Headless proof that the daily runner can reach the configured goal distance
 * under a simple scripted policy (boost + periodic jumps).
 */
import { describe, it } from "vitest";
import { pickAnomaly } from "../src/scene/anomalies";
import {
  createRunnerSimWithSeed,
  stepRunnerSim,
  type RunnerSimConfig,
} from "../src/minigames/runner/sim";
import type { RunnerMode } from "../src/minigames/runner/types";

const CFG: RunnerSimConfig = {
  canvasW: 512,
  canvasH: 320,
  dailyGoalDistance: 2600,
};

const DT = 1 / 120;

function tryDailyClear(seed: number): { ok: boolean; maxScroll: number } {
  const picked = pickAnomaly(seed);
  let state = createRunnerSimWithSeed(
    seed,
    "daily" as RunnerMode,
    CFG,
    picked.def.id,
  );
  const maxSteps = 2_000_000;
  for (let i = 0; i < maxSteps; i++) {
    const wantBoost = true;
    const wantJump = state.grounded && i % 10 === 0;
    state = stepRunnerSim(state, DT, wantJump, wantBoost, CFG);
    if (state.failed) {
      return { ok: false, maxScroll: state.maxScroll };
    }
    if (state.finished) {
      return {
        ok: state.maxScroll >= CFG.dailyGoalDistance,
        maxScroll: state.maxScroll,
      };
    }
  }
  return { ok: false, maxScroll: state.maxScroll };
}

describe("runner golden path (sim)", () => {
  it("finds a seed that clears daily 2600m (scripted boost + jumps)", () => {
    let best = { seed: 0, maxScroll: 0 };
    for (let seed = 1; seed <= 20_000; seed++) {
      const r = tryDailyClear(seed);
      if (r.maxScroll > best.maxScroll) best = { seed, maxScroll: r.maxScroll };
      if (r.ok) return;
    }
    throw new Error(
      `no seed 1..20000 cleared daily goal=${CFG.dailyGoalDistance}; best maxScroll=${best.maxScroll} @ seed=${best.seed}`,
    );
  });
});
