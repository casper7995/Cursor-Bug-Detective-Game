import { describe, expect, it } from "vitest";
import { makeSeededRng } from "../src/api/seedClient";
import {
  deathGapPx,
  deriveRunnerSeed,
  ENDLESS_DEATH_GAP_WARMUP_MIN_CLIMB_M,
  ENDLESS_DEATH_GAP_WARMUP_MIN_PLANK_ID,
  generateInitialPlanks,
  horizontalJumpRange,
  isDeathGapAfterPlankId,
  maxGapForSpeed,
  RUNNER_SPEED_BASE,
  RUNNER_SPEED_BOOST_MAX,
  shouldSuppressEndlessDeathGap,
} from "../src/minigames/runner/sim";

describe("endless death-gap warm-up", () => {
  it("suppresses tier-0 death pits until plank id and climb thresholds", () => {
    expect(shouldSuppressEndlessDeathGap("endless", 0, 19, 100)).toBe(true);
    expect(shouldSuppressEndlessDeathGap("endless", 0, 25, 10)).toBe(true);
    expect(shouldSuppressEndlessDeathGap("endless", 0, 25, 20)).toBe(false);
    expect(shouldSuppressEndlessDeathGap("daily", 0, 5, 0)).toBe(false);
    expect(shouldSuppressEndlessDeathGap("endless", 1, 5, 0)).toBe(false);
  });

  it("endless tier 0 + low climb: warm-up gaps stay within normal jump reach", () => {
    const rng = makeSeededRng(deriveRunnerSeed(202));
    const maxNormal = maxGapForSpeed(RUNNER_SPEED_BASE);
    const { planks } = generateInitialPlanks(rng, "endless", 40, 2600, 0, {
      endlessTier: 0,
      maxClimbMForWarmup: 0,
    });
    for (let i = 0; i < planks.length - 1; i++) {
      const a = planks[i]!;
      const b = planks[i + 1]!;
      const gap = b.x0 - a.x1;
      if (shouldSuppressEndlessDeathGap("endless", 0, a.id, 0)) {
        expect(gap).toBeLessThanOrEqual(maxNormal + 0.01);
      }
    }
  });

  it("after warm-up, death-gap planks exceed normal reach again", () => {
    const rng = makeSeededRng(deriveRunnerSeed(203));
    const maxNormal = maxGapForSpeed(RUNNER_SPEED_BASE);
    // Start ids near the warm-up threshold so a death-slot plank ≥20 appears
    // inside the first endless batch without relying on huge horizontal span.
    const { planks } = generateInitialPlanks(rng, "endless", 40, 2600, 19, {
      endlessTier: 0,
      maxClimbMForWarmup: ENDLESS_DEATH_GAP_WARMUP_MIN_CLIMB_M + 2,
    });
    let sawWide = false;
    for (let i = 0; i < planks.length - 1; i++) {
      const a = planks[i]!;
      const b = planks[i + 1]!;
      const gap = b.x0 - a.x1;
      if (
        isDeathGapAfterPlankId(a.id, 0) &&
        a.id >= ENDLESS_DEATH_GAP_WARMUP_MIN_PLANK_ID
      ) {
        expect(gap).toBeGreaterThan(maxNormal);
        sawWide = true;
        break;
      }
    }
    expect(sawWide).toBe(true);
  });

  it("low-tier death gaps stay within full-boost reach cap", () => {
    const maxDeath = horizontalJumpRange(RUNNER_SPEED_BOOST_MAX) - 16;
    for (const tier of [0, 1, 2, 5] as const) {
      const speed = RUNNER_SPEED_BASE * (1 + 0.05 * Math.max(0, tier));
      const g = deathGapPx(() => 1, speed, tier);
      expect(g).toBeLessThanOrEqual(maxDeath + 0.01);
    }
  });
});
