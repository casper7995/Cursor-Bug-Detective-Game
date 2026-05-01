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

describe("tamper scoring (direct Yes/No on highlighted prop)", () => {
  function rightVerdictForCall(
    c: ReturnType<typeof buildTamperRound>["calls"][number],
  ): CallVerdict {
    return c.bugbotPointsAtSpotId === c.tamperedSpotId
      ? { kind: "agree" as const }
      : { kind: "disagree" as const };
  }

  it("perfect taps with no time bonus = 6 × RIGHT_CALL_BASE (480)", () => {
    const r = buildTamperRound(7);
    const verdicts: CallVerdict[] = r.calls.map(rightVerdictForCall);
    const result = scoreTamperRound(r, verdicts);
    expect(result.rightCalls).toBe(6);
    expect(result.rightVerdicts).toBe(6);
    expect(result.score).toBe(480);
  });

  it("perfect speed (timeFrac=1 each) caps at 6 × (BASE + TIME_BONUS_MAX) = 900", () => {
    const r = buildTamperRound(7);
    const verdicts: CallVerdict[] = r.calls.map(rightVerdictForCall);
    const times = verdicts.map(() => 1);
    const result = scoreTamperRound(r, verdicts, times);
    expect(result.score).toBe(900);
    expect(result.avgTimeFrac01).toBe(1);
  });

  it("inverted Yes/No (always wrong) scores 0 — wrong calls do NOT subtract", () => {
    const r = buildTamperRound(7);
    const verdicts: CallVerdict[] = r.calls.map((c) =>
      c.bugbotPointsAtSpotId === c.tamperedSpotId
        ? { kind: "disagree" as const }
        : { kind: "agree" as const },
    );
    const result = scoreTamperRound(r, verdicts);
    expect(result.score).toBe(0);
    expect(result.rightCalls).toBe(0);
    expect(result.rightVerdicts).toBe(0);
  });

  it("disagree-point with the wrong spot still counts the No, no penalty", () => {
    const r = buildTamperRound(99);
    const idx = r.calls.findIndex(
      (c) => c.bugbotPointsAtSpotId !== c.tamperedSpotId,
    );
    expect(idx).toBeGreaterThanOrEqual(0);
    const call = r.calls[idx]!;
    const wrongSpot =
      r.scene.spots.find((s) => s.id !== call.tamperedSpotId)?.id ?? "";
    const v = scoreCall(call, { kind: "disagree-point", spotId: wrongSpot }, 1);
    expect(v.rightCall).toBe(true);
    expect(v.pointBonus).toBe(false);
    expect(v.delta).toBe(80 + 70);
  });

  it("disagree-point at the real change adds POINT_BONUS", () => {
    const r = buildTamperRound(99);
    const idx = r.calls.findIndex(
      (c) => c.bugbotPointsAtSpotId !== c.tamperedSpotId,
    );
    const call = r.calls[idx]!;
    const v = scoreCall(
      call,
      { kind: "disagree-point", spotId: call.tamperedSpotId },
      1,
    );
    expect(v.rightCall).toBe(true);
    expect(v.pointBonus).toBe(true);
    expect(v.delta).toBe(80 + 70 + 40);
  });

  it("score clamps at 1000", () => {
    const r = buildTamperRound(7);
    const verdicts: CallVerdict[] = r.calls.map((c) =>
      c.bugbotPointsAtSpotId === c.tamperedSpotId
        ? { kind: "agree" as const }
        : { kind: "disagree-point" as const, spotId: c.tamperedSpotId },
    );
    const times = verdicts.map(() => 1);
    const result = scoreTamperRound(r, verdicts, times);
    expect(result.score).toBeLessThanOrEqual(1000);
    expect(result.score).toBeGreaterThanOrEqual(900);
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
  it("bugbotRowClaimLine asks the Yes/No question on the highlighted prop", () => {
    const scene = TAMPER_SCENES[0]!;
    const s0 = scene.spots[0]!;
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
    ).toBe(`Bugbot circles the ${s0.label} — did it really change?`);
  });

  it("tamperVerdictFeedbackLine reflects circled-prop truth, not Bugbot framing", () => {
    expect(
      tamperVerdictFeedbackLine({ kind: "agree" }, { rightCall: true }),
    ).toBe("Correct — that prop changed.");
    expect(
      tamperVerdictFeedbackLine({ kind: "disagree" }, { rightCall: true }),
    ).toBe("Correct — that prop is clean.");
    expect(
      tamperVerdictFeedbackLine(
        { kind: "disagree-point", spotId: "x" },
        { rightCall: true, pointBonus: true },
      ),
    ).toBe("Nice — you pointed at the real change.");
    expect(
      tamperVerdictFeedbackLine(
        { kind: "disagree-point", spotId: "x" },
        { rightCall: false },
      ),
    ).toBe("That wasn’t the real change.");
    expect(
      tamperVerdictFeedbackLine({ kind: "agree" }, { rightCall: false }),
    ).toBe("Miss — that prop didn’t change.");
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

describe("tamper time bonus", () => {
  it("speed scales the bonus linearly: 0 → +0, 1 → +TIME_BONUS_MAX", () => {
    const call = {
      callIndex: 0,
      tamperedSpotId: "real",
      bugbotPointsAtSpotId: "real",
      bugbotClaim: "tampered" as const,
      bugbotConfidencePct: 80,
      bugbotIsLying: false,
    };
    expect(scoreCall(call, { kind: "agree" }, 0).delta).toBe(80);
    expect(scoreCall(call, { kind: "agree" }, 1).delta).toBe(80 + 70);
    expect(scoreCall(call, { kind: "agree" }, 0.5).delta).toBe(80 + 35);
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
