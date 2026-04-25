import { describe, expect, it } from "vitest";
import { makeSeededRng } from "../src/api/seedClient";
import {
  createRunnerSim,
  createRunnerSimWithSeed,
  deriveRunnerSeed,
  effectiveSpeedBaseForTier,
  endlessTierFromMaxClimbM,
  generateInitialPlanks,
  horizontalJumpRange,
  isDeathGapAfterPlankId,
  MAX_JUMP_UP,
  maxGapForSpeed,
  PLANK_LIFE_MS,
  pristineLifeMsForTier,
  RUNNER_SPEED_BASE,
  RUNNER_SPEED_BOOST_MAX,
  stepRunnerSim,
  supportYTop,
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

  it("daily mode advances scroll without immediate death (smoke)", () => {
    const shortCfg = { ...CFG, dailyGoalDistance: 900 };
    let s = createRunnerSim(42, "daily", shortCfg);
    // Keep under ~1s sim time so touched planks have not expired (PLANK_LIFE_MS).
    for (let i = 0; i < 50; i++) {
      s = stepRunnerSim(s, 1 / 60, i % 4 === 0, false, shortCfg);
    }
    expect(s.scroll).toBeGreaterThan(20);
    expect(s.failed).toBe(false);
  });

  it("records touchedAtMs when landing on a plank", () => {
    let s = createRunnerSim(7, "daily", CFG);
    let i = 0;
    while (
      i < 400 &&
      !s.planks.some((p) => p.touchedAtMs !== null) &&
      !s.failed
    ) {
      s = stepRunnerSim(s, 1 / 60, i % 8 === 0, false, CFG);
      i++;
    }
    expect(s.planks.some((p) => p.touchedAtMs !== null)).toBe(true);
  });

  it("expired touched plank no longer supports (elapsed past PLANK_LIFE_MS)", () => {
    const p = {
      id: 0,
      x0: 80,
      x1: 200,
      yTop: 250,
      touchedAtMs: 0,
      bornAtMs: 0,
    };
    expect(supportYTop(0, [p], PLANK_LIFE_MS - 1, 0)).toBe(250);
    expect(supportYTop(0, [p], PLANK_LIFE_MS + 1, 0)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("pristine plank stops supporting after pristineLifeMsForTier since bornAtMs", () => {
    const life = pristineLifeMsForTier(0);
    const p = {
      id: 0,
      x0: 80,
      x1: 200,
      yTop: 250,
      touchedAtMs: null as number | null,
      bornAtMs: 0,
    };
    expect(supportYTop(0, [p], life - 1, life)).toBe(250);
    expect(supportYTop(0, [p], life + 1, life)).toBe(Number.POSITIVE_INFINITY);
  });

  it("effectiveSpeedBaseForTier keeps scaling past tier 5 (tier 10 = +50%)", () => {
    const s0 = effectiveSpeedBaseForTier(0);
    const s10 = effectiveSpeedBaseForTier(10);
    expect(s10 / s0).toBeCloseTo(1.5, 5);
  });

  it("restart seed bumps course deterministically", () => {
    const a = createRunnerSimWithSeed(100, "daily", CFG);
    const b = createRunnerSimWithSeed((100 + 0x9e3779b9) >>> 0, "daily", CFG);
    expect(a.planks[0]).not.toEqual(b.planks[0]);
    const c = createRunnerSimWithSeed(100, "daily", CFG);
    expect(a.planks[0]).toEqual(c.planks[0]);
  });

  it("boost increases scroll over equivalent steps when meter is available", () => {
    let base = createRunnerSim(77, "daily", CFG);
    base = { ...base, boost01: 1 };
    const dt = 1 / 60;
    const noBoost = stepRunnerSim(
      { ...base, scroll: 0 },
      dt,
      false,
      false,
      CFG,
    );
    const withBoost = stepRunnerSim(
      { ...base, scroll: 0 },
      dt,
      false,
      true,
      CFG,
    );
    expect(withBoost.scroll).toBeGreaterThan(noBoost.scroll);
  });

  it("consecutive generated planks respect reachability (gap + vertical step)", () => {
    const rng = () => 0.5;
    const { planks } = generateInitialPlanks(rng, "daily", 40, 2600, 0);
    const maxNormal = maxGapForSpeed(RUNNER_SPEED_BASE);
    for (let i = 0; i < planks.length - 1; i++) {
      const a = planks[i]!;
      const b = planks[i + 1]!;
      const gap = b.x0 - a.x1;
      expect(gap).toBeGreaterThanOrEqual(32);
      if (isDeathGapAfterPlankId(a.id)) {
        expect(gap).toBeGreaterThan(maxNormal);
      } else {
        expect(gap).toBeLessThanOrEqual(maxNormal);
      }
      const dy = Math.abs(b.yTop - a.yTop);
      expect(dy).toBeLessThanOrEqual(MAX_JUMP_UP - 8 + 0.01);
    }
  });

  it("death gaps need boost: wider than base jump, landable at full boost", () => {
    const rng = () => 0.5;
    const { planks } = generateInitialPlanks(rng, "daily", 40, 12000, 0);
    const maxNormal = maxGapForSpeed(RUNNER_SPEED_BASE);
    const maxBoostReach = horizontalJumpRange(RUNNER_SPEED_BOOST_MAX) - 24;
    let sawDeath = false;
    for (let i = 0; i < planks.length - 1; i++) {
      const a = planks[i]!;
      const b = planks[i + 1]!;
      const gap = b.x0 - a.x1;
      if (isDeathGapAfterPlankId(a.id)) {
        sawDeath = true;
        expect(gap).toBeGreaterThan(maxNormal);
        expect(gap).toBeLessThanOrEqual(maxBoostReach + 0.01);
      }
    }
    expect(sawDeath).toBe(true);
  });

  it("endless tier 4 tightens death-gap cadence to 1-in-3 and +20% base speed", () => {
    expect(endlessTierFromMaxClimbM(399)).toBe(3);
    expect(endlessTierFromMaxClimbM(400)).toBe(4);
    expect(isDeathGapAfterPlankId(6, 4)).toBe(true);
    expect(isDeathGapAfterPlankId(5, 4)).toBe(false);
    const s0 = effectiveSpeedBaseForTier(0);
    const s4 = effectiveSpeedBaseForTier(4);
    expect(s4 / s0).toBeCloseTo(1.2, 5);
  });

  it("later planks trend upward (lower yTop) vs early planks", () => {
    const rng = makeSeededRng(deriveRunnerSeed(3));
    const { planks } = generateInitialPlanks(rng, "endless", 40, 2600, 0);
    expect(planks.length).toBeGreaterThanOrEqual(8);
    const head = planks.slice(0, 8);
    const tail = planks.slice(-8);
    const mean = (arr: typeof head) =>
      arr.reduce((acc, p) => acc + p.yTop, 0) / arr.length;
    expect(mean(tail)).toBeLessThan(mean(head));
  });
});
