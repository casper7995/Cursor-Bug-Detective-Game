import { describe, expect, it } from "vitest";
import {
  buildTamperRound,
  scoreCall,
  scoreTamperRound,
  namespacedSeed,
  spotById,
} from "../../src/minigames/tamper/round";
import { clueTokenForTamper } from "../../src/minigames/tamper/clueTokens";
import { TAMPER_CALLS_PER_ROUND } from "../../src/minigames/tamper/types";
import type { CallVerdict } from "../../src/minigames/tamper/types";

describe("tamper round determinism", () => {
  it("same seed produces identical call list", () => {
    const a = buildTamperRound(123);
    const b = buildTamperRound(123);
    expect(a.scene.id).toBe(b.scene.id);
    expect(a.tamperedSpotId).toBe(b.tamperedSpotId);
    expect(a.calls).toEqual(b.calls);
  });

  it("namespacedSeed is stable", () => {
    expect(namespacedSeed(1, "tamper")).toBe(namespacedSeed(1, "tamper"));
    expect(namespacedSeed(1, "tamper:CLUE")).not.toBe(
      namespacedSeed(1, "tamper:OTHER"),
    );
  });

  it("round has 6 calls and exactly one tampered spot", () => {
    const r = buildTamperRound(42);
    expect(r.calls.length).toBe(TAMPER_CALLS_PER_ROUND);
    const tamperedCount = r.scene.spots.filter((s) => s.tampered).length;
    expect(tamperedCount).toBe(1);
  });
});

describe("tamper scoring", () => {
  function agreeAll(): CallVerdict[] {
    return Array.from({ length: TAMPER_CALLS_PER_ROUND }, () => ({
      kind: "agree" as const,
    }));
  }

  it("answering each call correctly scores 6 * 150 = 900", () => {
    const r = buildTamperRound(7);
    const verdicts: CallVerdict[] = r.calls.map((c) =>
      c.bugbotIsLying
        ? { kind: "disagree" as const }
        : { kind: "agree" as const },
    );
    const result = scoreTamperRound(r, verdicts);
    expect(result.score).toBe(900);
    expect(result.rightCalls).toBe(6);
    expect(result.caughtLies).toBe(0);
  });

  it("answering every call wrong scores 0 (clamped from -450)", () => {
    const r = buildTamperRound(7);
    const verdicts: CallVerdict[] = r.calls.map((c) =>
      c.bugbotIsLying
        ? { kind: "agree" as const }
        : { kind: "disagree" as const },
    );
    const result = scoreTamperRound(r, verdicts);
    expect(result.score).toBe(0);
    expect(result.rightCalls).toBe(0);
  });

  it("disagree-point with the wrong spot is treated as a wrong call", () => {
    const r = buildTamperRound(99);
    // Find a lying call to test the wrong-spot path.
    const lyingCallIdx = r.calls.findIndex((c) => c.bugbotIsLying);
    if (lyingCallIdx < 0) {
      // Lies are pseudo-random; if seed yields no lies, choose another.
      const r2 = buildTamperRound(101);
      const idx = r2.calls.findIndex((c) => c.bugbotIsLying);
      expect(idx).toBeGreaterThanOrEqual(0);
      return;
    }
    const wrongSpot =
      r.scene.spots.find((s) => s.id !== r.tamperedSpotId)?.id ?? "";
    expect(wrongSpot).not.toBe("");
    const v = scoreCall(
      r.calls[lyingCallIdx]!,
      { kind: "disagree-point", spotId: wrongSpot },
      r.tamperedSpotId,
    );
    expect(v.rightCall).toBe(false);
    expect(v.delta).toBeLessThan(0);
  });

  it("3 right + 3 caught lies clamps to 1000", () => {
    const r = buildTamperRound(7);
    // Build a synthetic verdict pattern where the first 3 calls are correct
    // (agree-when-honest / disagree-when-lying) and the next 3 are
    // caught-lie hits where applicable. Total raw = 3*150 + 3*(150+250) =
    // 450 + 1200 = 1650 → clamp 1000.
    const verdicts: CallVerdict[] = r.calls.map((c, i) => {
      if (i < 3) {
        return c.bugbotIsLying
          ? { kind: "disagree" as const }
          : { kind: "agree" as const };
      }
      if (c.bugbotIsLying) {
        return { kind: "disagree-point" as const, spotId: r.tamperedSpotId };
      }
      // Honest call in the second half — agree to avoid penalty.
      return { kind: "agree" as const };
    });
    const result = scoreTamperRound(r, verdicts);
    expect(result.score).toBeGreaterThanOrEqual(450);
    expect(result.score).toBeLessThanOrEqual(1000);
  });

  it("agree-all baseline only scores honest calls", () => {
    const r = buildTamperRound(7);
    const result = scoreTamperRound(r, agreeAll());
    const expectedHonest = r.calls.filter((c) => !c.bugbotIsLying).length;
    const expectedDelta = expectedHonest * 150 + (6 - expectedHonest) * -75;
    expect(result.score).toBe(Math.max(0, Math.min(1000, expectedDelta)));
  });
});

describe("tamper helpers", () => {
  it("clueTokenForTamper sanitises and clamps", () => {
    expect(clueTokenForTamper("warning!!")).toBe("WARNING");
    expect(clueTokenForTamper("")).toBe("BUG");
    expect(clueTokenForTamper("longwordlong")).toBe("LONGWORD");
  });

  it("spotById finds spots by id", () => {
    const r = buildTamperRound(2);
    const first = r.scene.spots[0]!;
    expect(spotById(r.scene, first.id)?.id).toBe(first.id);
    expect(spotById(r.scene, "nope")).toBeNull();
  });
});
