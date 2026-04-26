import { describe, expect, it } from "vitest";
import { makeSeededRng } from "../src/api/seedClient";
import {
  deriveRunnerSeed,
  effectiveSpeedBaseForTier,
  generateInitialPlanks,
  isDeathGapAfterPlankId,
  maxBaseReachPx,
  maxBoostReachForTier,
  maxGapForSpeed,
  MAX_JUMP_UP,
  shouldSuppressEndlessDeathGap,
} from "../src/minigames/runner/sim";

function checkPlankChain(
  planks: { x0: number; x1: number; yTop: number; id: number }[],
  mode: "daily" | "endless",
  endlessTier: number,
  maxClimbMForWarmup: number,
): void {
  const speed = effectiveSpeedBaseForTier(endlessTier);
  const maxNormal = maxGapForSpeed(speed);
  const minBoost = maxBaseReachPx(speed) + 5;
  const capBoost = maxBoostReachForTier(endlessTier);
  for (let i = 0; i < planks.length - 1; i++) {
    const a = planks[i]!;
    const b = planks[i + 1]!;
    const gap = b.x0 - a.x1;
    expect(gap).toBeGreaterThanOrEqual(32);
    const wantDeath =
      isDeathGapAfterPlankId(a.id, endlessTier) &&
      !shouldSuppressEndlessDeathGap(
        mode,
        endlessTier,
        a.id,
        maxClimbMForWarmup,
      );
    if (wantDeath) {
      expect(gap).toBeGreaterThan(maxNormal);
      expect(gap).toBeLessThanOrEqual(capBoost);
      if (minBoost <= capBoost) {
        expect(gap).toBeGreaterThanOrEqual(minBoost - 0.5);
      }
    } else {
      expect(gap).toBeLessThanOrEqual(maxNormal + 0.5);
    }
    const dy = Math.abs(b.yTop - a.yTop);
    expect(dy).toBeLessThanOrEqual(MAX_JUMP_UP - 8);
  }
}

describe("runner reachability (generated chains)", () => {
  it("scans many daily seeds: every gap is in-range for tier-0 base speed", () => {
    for (let seed = 0; seed < 60; seed++) {
      const rng = makeSeededRng(deriveRunnerSeed(seed));
      const { planks } = generateInitialPlanks(rng, "daily", 40, 12_000, 0, {
        nowMs: 0,
        scrollForPristine: 0,
      });
      checkPlankChain(planks, "daily", 0, 0);
    }
  });

  it("endless warm-up and mid-tier: gaps stay inside base or boost reach", () => {
    for (const tier of [0, 1, 2, 3, 4] as const) {
      for (let seed = 0; seed < 30; seed++) {
        const rng = makeSeededRng(deriveRunnerSeed(300 + seed + tier * 100));
        const { planks } = generateInitialPlanks(rng, "endless", 40, 2600, 0, {
          endlessTier: tier,
          nowMs: 0,
          maxClimbMForWarmup: tier === 0 ? 0 : 30,
          scrollForPristine: 0,
        });
        checkPlankChain(planks, "endless", tier, tier === 0 ? 0 : 30);
      }
    }
  });

  it("chained endless batches keep reachability at the stitch", () => {
    const rng = makeSeededRng(deriveRunnerSeed(9001));
    const a = generateInitialPlanks(rng, "endless", 40, 2600, 0, {
      endlessTier: 1,
      nowMs: 0,
      maxClimbMForWarmup: 25,
      scrollForPristine: 0,
    });
    const last = a.planks[a.planks.length - 1]!;
    const b = generateInitialPlanks(
      rng,
      "endless",
      a.nextCursor,
      2600,
      a.nextPlankId,
      {
        continueFromYTop: last.yTop,
        endlessTier: 2,
        nowMs: 12_000,
        maxClimbMForWarmup: 50,
        scrollForPristine: 5000,
      },
    );
    checkPlankChain(a.planks, "endless", 1, 25);
    checkPlankChain(b.planks, "endless", 2, 50);
    const firstB = b.planks[0]!;
    const gapStitch = firstB.x0 - last.x1;
    const speedA = effectiveSpeedBaseForTier(1);
    const maxNormalA = maxGapForSpeed(speedA);
    const wantDeathStitch =
      isDeathGapAfterPlankId(last.id, 1) &&
      !shouldSuppressEndlessDeathGap("endless", 1, last.id, 25);
    expect(gapStitch).toBeGreaterThanOrEqual(32);
    if (wantDeathStitch) {
      expect(gapStitch).toBeGreaterThan(maxNormalA);
      expect(gapStitch).toBeLessThanOrEqual(maxBoostReachForTier(1) + 0.5);
    } else {
      expect(gapStitch).toBeLessThanOrEqual(maxNormalA + 0.5);
    }
    expect(Math.abs(firstB.yTop - last.yTop)).toBeLessThanOrEqual(
      MAX_JUMP_UP - 8,
    );
  });
});
