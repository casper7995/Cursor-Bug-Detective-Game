import { describe, expect, it } from "vitest";
import { survivalNotebookLock } from "../../src/minigames/errand/round";
import { shouldEmitOutcome } from "../../src/minigames/sentence/scoring";
import {
  buildTamperRound,
  scoreTamperRound,
  tamperEarnsDeskClue,
} from "../../src/minigames/tamper/round";
import { TAMPER_CALLS_PER_ROUND } from "../../src/minigames/tamper/types";
import type { CallVerdict } from "../../src/minigames/tamper/types";
import type { PlayerPick } from "../../src/minigames/sentence/types";

describe("desk mini clue gating helpers", () => {
  function picks(...colors: PlayerPick["color"][]): PlayerPick[] {
    return colors.map((color, i) => ({ sentenceIdx: i, color }));
  }

  it("lane defense errand: clue locks at wave ≥ 3 or after 60s", () => {
    expect(survivalNotebookLock(1, 0)).toBe(false);
    expect(survivalNotebookLock(2, 30)).toBe(false);
    expect(survivalNotebookLock(3, 10)).toBe(true);
    expect(survivalNotebookLock(1, 60)).toBe(true);
    expect(survivalNotebookLock(2, 59.9)).toBe(false);
  });

  it("sentence shouldEmitOutcome needs full round and at least 4 blues (S-3)", () => {
    expect(shouldEmitOutcome(picks("blue"))).toBe(false);
    // 4 blues out of 8 = partial credit (was full forfeit before S-3).
    expect(
      shouldEmitOutcome(
        picks(
          "blue",
          "blue",
          "blue",
          "blue",
          "purple",
          "purple",
          "orange",
          "idle",
        ),
      ),
    ).toBe(true);
    // 3 blues still doesn't earn anything.
    expect(
      shouldEmitOutcome(
        picks(
          "blue",
          "blue",
          "blue",
          "purple",
          "purple",
          "purple",
          "orange",
          "idle",
        ),
      ),
    ).toBe(false);
    expect(
      shouldEmitOutcome(
        picks("blue", "blue", "blue", "blue", "blue", "blue", "orange", "idle"),
      ),
    ).toBe(true);
    expect(
      shouldEmitOutcome(
        picks("idle", "idle", "idle", "idle", "idle", "idle", "idle", "idle"),
      ),
    ).toBe(false);
  });

  it("tamper pins clue at 4+ correct Yes/No calls on the highlighted prop", () => {
    const r = buildTamperRound(7);
    const perfect: CallVerdict[] = r.calls.map((c) =>
      c.bugbotPointsAtSpotId === c.tamperedSpotId
        ? { kind: "agree" as const }
        : { kind: "disagree" as const },
    );
    const full = scoreTamperRound(r, perfect);
    expect(full.rightVerdicts).toBe(TAMPER_CALLS_PER_ROUND);
    expect(tamperEarnsDeskClue(full)).toBe(true);

    const flip = (call: (typeof r.calls)[number]): CallVerdict =>
      call.bugbotPointsAtSpotId === call.tamperedSpotId
        ? { kind: "disagree" as const }
        : { kind: "agree" as const };
    const threeBad = perfect.map((v, i) => (i < 3 ? flip(r.calls[i]!) : v));
    const low = scoreTamperRound(r, threeBad);
    expect(low.rightVerdicts).toBe(3);
    expect(tamperEarnsDeskClue(low)).toBe(false);

    const offIdx = r.calls.findIndex(
      (c) => c.bugbotPointsAtSpotId !== c.tamperedSpotId,
    );
    expect(offIdx).toBeGreaterThanOrEqual(0);
    const offCall = r.calls[offIdx]!;
    const pointingCatch = perfect.map((v, i) =>
      i === offIdx
        ? ({
            kind: "disagree-point",
            spotId: offCall.tamperedSpotId,
          } as CallVerdict)
        : v,
    );
    const caught = scoreTamperRound(r, pointingCatch);
    expect(caught.caughtLies).toBeGreaterThanOrEqual(1);
    expect(tamperEarnsDeskClue(caught)).toBe(true);
  });
});
