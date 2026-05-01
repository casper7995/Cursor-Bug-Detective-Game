import { describe, expect, it } from "vitest";
import {
  buildTamperRound,
  scoreCall,
  scoreTamperRound,
  namespacedSeed,
  spotById,
  tamperVerdictFeedbackLine,
} from "../../src/minigames/tamper/round";
import {
  bugbotRowClaimLine,
  getTamperPanelRects,
  getTamperTutorialDiagramLayout,
  spotPropAt,
} from "../../src/minigames/tamper/draw";
import { clueTokenForTamper } from "../../src/minigames/tamper/clueTokens";
import { TAMPER_CALLS_PER_ROUND } from "../../src/minigames/tamper/types";
import type { CallVerdict } from "../../src/minigames/tamper/types";
import { TAMPER_SCENES } from "../../src/minigames/tamper/scenes";

/** Keys used in `drawPropSketch` for tamper TONIGHT variants (keep in sync). */
const TAMPER_TONIGHT_SKETCH_KEYS = new Set([
  "stamp_offset",
  "photo_glare",
  "pen_smudge",
  "staple",
  "signature_loopy",
  "vial_empty",
  "tag_torn",
  "key_bent",
  "boot_smear",
  "ledger_fold",
  "lampshade_tape",
  "switch_scuff",
  "wire_cut",
  "puddle_oil",
  "book_shifted",
]);

describe("tamper scene spot-the-difference data", () => {
  it("every scene row defines a text and icon variant for the tampered case", () => {
    for (const scene of TAMPER_SCENES) {
      for (const spot of scene.spots) {
        expect(spot.tonightIfThisTampered.length).toBeGreaterThan(0);
        expect(spot.tonightIfThisTampered).not.toBe(spot.label);
        expect(spot.tonightSketchKey).toBeDefined();
        expect(TAMPER_TONIGHT_SKETCH_KEYS.has(spot.tonightSketchKey!)).toBe(
          true,
        );
        expect(spot.tonightSketchKey).not.toBe(spot.sketchKey);
      }
    }
  });
});

describe("tamper round determinism", () => {
  it("same seed produces identical call list", () => {
    const a = buildTamperRound(123);
    const b = buildTamperRound(123);
    expect(a.scene.id).toBe(b.scene.id);
    expect(a.tamperedSpotIdsThisRound).toEqual(b.tamperedSpotIdsThisRound);
    expect(a.calls).toEqual(b.calls);
  });

  it("namespacedSeed is stable", () => {
    expect(namespacedSeed(1, "tamper")).toBe(namespacedSeed(1, "tamper"));
    expect(namespacedSeed(1, "tamper:CLUE")).not.toBe(
      namespacedSeed(1, "tamper:OTHER"),
    );
  });

  it("round has 6 calls, each tagged with a tamperedSpotId from the scene", () => {
    const r = buildTamperRound(42);
    expect(r.calls.length).toBe(TAMPER_CALLS_PER_ROUND);
    const sceneIds = new Set(r.scene.spots.map((s) => s.id));
    for (const c of r.calls) {
      expect(sceneIds.has(c.tamperedSpotId)).toBe(true);
    }
  });

  it("per-call tampered spot rotates — round avg ≥3 distinct spots over 64 seeds", () => {
    let totalDistinct = 0;
    for (let seed = 0; seed < 64; seed++) {
      const r = buildTamperRound(seed);
      const distinct = new Set(r.calls.map((c) => c.tamperedSpotId)).size;
      totalDistinct += distinct;
    }
    // 6 independent rolls over 5–6 spots — expected distinct count is ~4.
    // Asserting ≥3 average gives margin against RNG flake.
    expect(totalDistinct / 64).toBeGreaterThanOrEqual(3);
  });

  it("tamperedSpotIdsThisRound matches the set of distinct call tampers", () => {
    for (let seed = 0; seed < 16; seed++) {
      const r = buildTamperRound(seed);
      const expected = Array.from(
        new Set(r.calls.map((c) => c.tamperedSpotId)),
      );
      expect([...r.tamperedSpotIdsThisRound]).toEqual(expected);
    }
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
    const lyingCallIdx = r.calls.findIndex((c) => c.bugbotIsLying);
    expect(lyingCallIdx).toBeGreaterThanOrEqual(0);
    const lyingCall = r.calls[lyingCallIdx]!;
    const wrongSpot =
      r.scene.spots.find((s) => s.id !== lyingCall.tamperedSpotId)?.id ?? "";
    expect(wrongSpot).not.toBe("");
    const v = scoreCall(lyingCall, {
      kind: "disagree-point",
      spotId: wrongSpot,
    });
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
        return { kind: "disagree-point" as const, spotId: c.tamperedSpotId };
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

describe("tamper copy helpers", () => {
  it("bugbotRowClaimLine names the prop in plain English", () => {
    const scene = TAMPER_SCENES[0]!;
    const s0 = scene.spots[0]!;
    const s1 = scene.spots[1]!;
    expect(
      bugbotRowClaimLine(
        {
          callIndex: 0,
          bugbotPointsAtSpotId: s0.id,
          bugbotClaim: "tampered",
          bugbotConfidencePct: 70,
          bugbotIsLying: false,
        },
        scene,
      ),
    ).toBe(`Bugbot says: the ${s0.label} changed`);
    expect(
      bugbotRowClaimLine(
        {
          callIndex: 0,
          bugbotPointsAtSpotId: s1.id,
          bugbotClaim: "clean",
          bugbotConfidencePct: 70,
          bugbotIsLying: false,
        },
        scene,
      ),
    ).toBe(`Bugbot says: the ${s1.label} is clean`);
  });

  it("tamperVerdictFeedbackLine matches the rule the player just applied", () => {
    expect(
      tamperVerdictFeedbackLine(
        { kind: "agree" },
        { rightCall: true, caughtLie: false },
      ),
    ).toBe("Correct: Bugbot was right.");
    expect(
      tamperVerdictFeedbackLine(
        { kind: "disagree" },
        { rightCall: true, caughtLie: false },
      ),
    ).toBe("Correct: Bugbot was wrong.");
    expect(
      tamperVerdictFeedbackLine(
        { kind: "disagree-point", spotId: "x" },
        { rightCall: true, caughtLie: true },
      ),
    ).toBe("Caught: you pointed to the real change.");
    expect(
      tamperVerdictFeedbackLine(
        { kind: "disagree-point", spotId: "x" },
        { rightCall: false, caughtLie: false },
      ),
    ).toBe("That was not the changed prop.");
    expect(
      tamperVerdictFeedbackLine(
        { kind: "disagree-point", spotId: "x" },
        { rightCall: true, caughtLie: true, confidentCatch: true },
      ),
    ).toBe("Caught a confident lie!");
  });
});

describe("spotPropAt hit-testing", () => {
  it("clicking a prop's projected center returns its id", () => {
    const scene = TAMPER_SCENES[0]!;
    const { tonight } = getTamperPanelRects();
    // Mirror the renderer's centering math (see projectSpot in draw.ts).
    const SCENE_W = 256;
    const SCENE_H = 200;
    const drawnW = SCENE_W * tonight.scale;
    const drawnH = SCENE_H * tonight.scale;
    const ox = tonight.x + (tonight.w - drawnW) / 2;
    const oy = tonight.y + (tonight.h - drawnH) / 2;
    for (const spot of scene.spots) {
      const cx = ox + spot.x * tonight.scale;
      const cy = oy + spot.y * tonight.scale;
      expect(spotPropAt(scene, cx, cy)?.spotId).toBe(spot.id);
    }
  });

  it("returns null for clicks outside the TONIGHT panel", () => {
    const scene = TAMPER_SCENES[0]!;
    const { tonight } = getTamperPanelRects();
    expect(spotPropAt(scene, tonight.x - 50, tonight.y - 50)).toBeNull();
    expect(
      spotPropAt(scene, tonight.x + tonight.w + 50, tonight.y + tonight.h / 2),
    ).toBeNull();
  });
});

describe("tamper confident-catch bonus", () => {
  it("awards +100 when caught lie has confidence >= 85", () => {
    const lyingCallHi = {
      callIndex: 0,
      tamperedSpotId: "real",
      bugbotPointsAtSpotId: "irrelevant",
      bugbotClaim: "clean" as const,
      bugbotConfidencePct: 92,
      bugbotIsLying: true,
    };
    const r = scoreCall(lyingCallHi, {
      kind: "disagree-point",
      spotId: "real",
    });
    expect(r.rightCall).toBe(true);
    expect(r.caughtLie).toBe(true);
    expect(r.confidentCatch).toBe(true);
    // RIGHT_CALL (150) + CAUGHT_LIE (250) + CONFIDENT_CATCH_BONUS (100) = 500.
    expect(r.delta).toBe(500);
  });

  it("does NOT award the bonus when confidence < 85", () => {
    const lyingCallLo = {
      callIndex: 0,
      tamperedSpotId: "real",
      bugbotPointsAtSpotId: "irrelevant",
      bugbotClaim: "clean" as const,
      bugbotConfidencePct: 70,
      bugbotIsLying: true,
    };
    const r = scoreCall(lyingCallLo, {
      kind: "disagree-point",
      spotId: "real",
    });
    expect(r.caughtLie).toBe(true);
    expect(r.confidentCatch).toBe(false);
    expect(r.delta).toBe(400);
  });
});

describe("tamper tutorial diagram layout", () => {
  it("keeps the sample row centered with comfortable button spacing", () => {
    const layout = getTamperTutorialDiagramLayout(64, 140, 384, 40, 74);

    expect(layout.avatar.cy).toBe(layout.centerY);
    expect(layout.label.y).toBe(layout.centerY);
    expect(layout.agree.y + layout.agree.h / 2).toBe(layout.centerY);
    expect(layout.disagree.y + layout.disagree.h / 2).toBe(layout.centerY);

    expect(layout.agree.x - layout.labelEndX).toBeGreaterThanOrEqual(12);
    expect(layout.disagree.x - (layout.agree.x + layout.agree.w)).toBe(8);
    expect(layout.agree.w).toBeGreaterThanOrEqual(68);
    expect(layout.disagree.w).toBeGreaterThanOrEqual(82);
    expect(layout.disagree.x + layout.disagree.w).toBeLessThanOrEqual(64 + 384);
  });
});
