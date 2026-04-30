import { describe, expect, it } from "vitest";
import { makeSeededRng } from "../src/api/seedClient";
import {
  createRunnerSim,
  createRunnerSimWithSeed,
  DEFAULT_DAILY_GOAL_SCROLL,
  boostSpeedForTier,
  deriveRunnerSeed,
  effectiveSpeedBaseForTier,
  endlessTierFromMaxClimbM,
  generateInitialPlanks,
  horizontalJumpRange,
  horizontalRunSpeedPxPerSec,
  isDeathGapAfterPlankId,
  maxBoostReachForTier,
  maxBoostReachPx,
  MAX_JUMP_UP,
  maxGapForSpeed,
  plankWidthTightenForEndlessTier,
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
  dailyGoalDistance: DEFAULT_DAILY_GOAL_SCROLL,
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

  it("narrow underfoot span does not bridge a small visible gap", () => {
    const life = pristineLifeMsForTier(0);
    // scroll=0 → foot center x = 96 + 22 = 118; underfoot ~108–128
    const a = {
      id: 0,
      x0: 0,
      x1: 100,
      yTop: 250,
      touchedAtMs: null as number | null,
      bornAtMs: 0,
    };
    const b = {
      id: 1,
      x1: 400,
      x0: 130,
      yTop: 250,
      touchedAtMs: null as number | null,
      bornAtMs: 0,
    };
    expect(supportYTop(0, [a, b], life * 0.5, life)).toBe(
      Number.POSITIVE_INFINITY,
    );
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

  it("effectiveSpeedBaseForTier keeps scaling past tier 5 (tier 10 = +70%)", () => {
    const s0 = effectiveSpeedBaseForTier(0);
    const s10 = effectiveSpeedBaseForTier(10);
    expect(s10 / s0).toBeCloseTo(1.7, 5);
  });

  it("boost never reduces speed when base tier already exceeds max boost", () => {
    const highTier = 22;
    const s0 = effectiveSpeedBaseForTier(highTier);
    const cap = boostSpeedForTier(highTier);
    expect(s0).toBeGreaterThan(RUNNER_SPEED_BOOST_MAX);
    const withBoost = horizontalRunSpeedPxPerSec(highTier, 1, true);
    expect(withBoost).toBe(cap);
  });

  it("full boost at low tier reaches RUNNER_SPEED_BOOST_MAX", () => {
    const v = horizontalRunSpeedPxPerSec(0, 1, true);
    expect(v).toBe(RUNNER_SPEED_BOOST_MAX);
    expect(boostSpeedForTier(0)).toBe(RUNNER_SPEED_BOOST_MAX);
  });

  it("held-boost top speed and boost reach keep rising with tier", () => {
    expect(boostSpeedForTier(5)).toBeGreaterThan(boostSpeedForTier(0));
    expect(boostSpeedForTier(12)).toBeGreaterThan(boostSpeedForTier(5));
    expect(maxBoostReachForTier(4)).toBeGreaterThan(maxBoostReachForTier(0));
    expect(horizontalRunSpeedPxPerSec(0, 1, true)).toBeLessThan(
      horizontalRunSpeedPxPerSec(10, 1, true),
    );
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
    const { planks } = generateInitialPlanks(
      rng,
      "daily",
      40,
      DEFAULT_DAILY_GOAL_SCROLL,
      0,
    );
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
    const { planks } = generateInitialPlanks(rng, "daily", 40, 12_000, 0);
    const maxNormal = maxGapForSpeed(RUNNER_SPEED_BASE);
    const maxBoostReach = maxBoostReachPx();
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

  it("endless tier 4 uses period-2 death slots and +28% base speed", () => {
    expect(endlessTierFromMaxClimbM(399)).toBe(3);
    expect(endlessTierFromMaxClimbM(400)).toBe(4);
    expect(isDeathGapAfterPlankId(6, 4)).toBe(true);
    expect(isDeathGapAfterPlankId(5, 4)).toBe(false);
    const s0 = effectiveSpeedBaseForTier(0);
    const s4 = effectiveSpeedBaseForTier(4);
    expect(s4 / s0).toBeCloseTo(1.28, 5);
  });

  it(
    "endless: scripted boost+jump reaches 160m for some seed (live sim)",
    { timeout: 60_000 },
    () => {
      const maxSteps = 200_000;
      for (let seed = 0; seed < 2000; seed++) {
        let s = createRunnerSimWithSeed(
          seed,
          "endless",
          CFG,
          "calendar-tomorrow",
        );
        for (let i = 0; i < maxSteps; i++) {
          const wantBoost = true;
          const wantJump = s.grounded && i % 10 === 0;
          s = stepRunnerSim(s, 1 / 120, wantJump, wantBoost, CFG);
          if (s.failed) break;
          if (s.maxClimbM >= 160) {
            return;
          }
        }
      }
      throw new Error(
        "no seed 0..1999 reached 160m in 200k steps with scripted policy",
      );
    },
  );

  it("daily initial course staggers pristine bornAt for far-ahead snippets", () => {
    const rng = makeSeededRng(deriveRunnerSeed(404));
    const { planks } = generateInitialPlanks(
      rng,
      "daily",
      40,
      DEFAULT_DAILY_GOAL_SCROLL,
      0,
      { nowMs: 0, scrollForPristine: 0 },
    );
    const scrollRef = 0;
    for (const p of planks) {
      const dist = p.x0 - (scrollRef + 96);
      if (dist <= 0) {
        expect(p.bornAtMs).toBe(0);
        continue;
      }
      const expectedBorn = (dist / boostSpeedForTier(0)) * 1000;
      expect(
        Math.abs(p.bornAtMs - expectedBorn),
        `plank id=${p.id}`,
      ).toBeLessThan(2.5);
    }
  });

  it(
    "daily: scripted sim reaches the goal line without void fail (some seed)",
    { timeout: 90_000 },
    () => {
      for (let seed = 0; seed < 400; seed++) {
        let s = createRunnerSimWithSeed(
          seed,
          "daily",
          CFG,
          "calendar-tomorrow",
        );
        for (let i = 0; i < 300_000; i++) {
          const wantBoost = true;
          const wantJump = s.grounded && i % 10 === 0;
          s = stepRunnerSim(s, 1 / 120, wantJump, wantBoost, CFG);
          if (s.failed) break;
          if (s.dailyLineCrossed) return;
        }
      }
      throw new Error(
        "no daily seed 0..399 reached goal line without void in 300k steps",
      );
    },
  );

  it("pristine on far-ahead endless planks is staggered by travel time (batch)", () => {
    const makeSeededRng = (seed: number) => {
      let t = seed >>> 0;
      return () => {
        t = (t * 1664525 + 1013904223) >>> 0;
        return t / 0x100000000;
      };
    };
    const rng = makeSeededRng(12345);
    const scroll0 = 5000;
    const now0 = 30_000;
    const { planks } = generateInitialPlanks(
      () => rng(),
      "endless",
      scroll0 + 8000,
      2600,
      5,
      {
        endlessTier: 2,
        nowMs: now0,
        scrollForPristine: scroll0,
        maxClimbMForWarmup: 200,
      },
    );
    for (const p of planks) {
      const dist = p.x0 - (scroll0 + 96);
      if (dist <= 0) continue;
      const expectedBorn = now0 + (dist / boostSpeedForTier(2)) * 1000;
      expect(
        Math.abs(p.bornAtMs - expectedBorn),
        `plank id=${p.id} bornAt stagger`,
      ).toBeLessThan(2.5);
    }
  });

  it("later planks trend upward (lower yTop) vs early planks", () => {
    const rng = makeSeededRng(deriveRunnerSeed(3));
    const { planks } = generateInitialPlanks(
      rng,
      "endless",
      40,
      DEFAULT_DAILY_GOAL_SCROLL,
      0,
    );
    expect(planks.length).toBeGreaterThanOrEqual(8);
    const head = planks.slice(0, 8);
    const tail = planks.slice(-8);
    const mean = (arr: typeof head) =>
      arr.reduce((acc, p) => acc + p.yTop, 0) / arr.length;
    expect(mean(tail)).toBeLessThan(mean(head));
  });

  it("generation allows yTop below the old 80px floor when the climb profile wants it", () => {
    const rng = makeSeededRng(deriveRunnerSeed(88));
    const { planks } = generateInitialPlanks(rng, "endless", 6000, 2600, 0, {
      continueFromYTop: 78,
      endlessTier: 1,
      nowMs: 0,
      scrollForPristine: 0,
      maxClimbMForWarmup: 30,
    });
    expect(planks.length).toBeGreaterThan(0);
    expect(planks.some((p) => p.yTop < 80)).toBe(true);
  });

  it("plankWidthTightenForEndlessTier shrinks rng width factor at high tier (floor 0.5)", () => {
    expect(plankWidthTightenForEndlessTier(0)).toBe(1);
    expect(plankWidthTightenForEndlessTier(24)).toBeLessThan(
      plankWidthTightenForEndlessTier(0),
    );
    expect(plankWidthTightenForEndlessTier(30)).toBe(0.5);
  });

  it("jump buffer fires the jump on land when pressed just before grounding", () => {
    let s = createRunnerSim(123, "daily", CFG);
    // Step the sim airborne by jumping once, then keep wantJump=false to fall.
    s = stepRunnerSim(s, 1 / 60, true, false, CFG);
    // Now in the air, vy<0 (rising). Build a small fall back to ground.
    for (let i = 0; i < 6; i++) {
      s = stepRunnerSim(s, 1 / 60, false, false, CFG);
    }
    // Press jump while airborne (buffer it).
    const justBeforeLand = stepRunnerSim(s, 1 / 60, true, false, CFG);
    expect(justBeforeLand.bufferedJumpAtMs).toBeGreaterThan(-Infinity);
    // Release, then keep simulating. When player grounds within 100ms of the
    // buffered press, the jump should fire (consume buffer, vy<0, airborne).
    let r = justBeforeLand;
    let firedRebound = false;
    for (let i = 0; i < 12; i++) {
      r = stepRunnerSim(r, 1 / 60, false, false, CFG);
      if (!r.grounded && r.playerVy < 0) {
        firedRebound = true;
        break;
      }
    }
    expect(firedRebound).toBe(true);
  });

  it("createRunnerSim seeds coyote/buffer fields with neutral values", () => {
    const s = createRunnerSim(7, "daily", CFG);
    expect(s.lastGroundedAtMs).toBe(0);
    expect(s.bufferedJumpAtMs).toBe(-Infinity);
    expect(s.prevWantJump).toBe(false);
  });
});
