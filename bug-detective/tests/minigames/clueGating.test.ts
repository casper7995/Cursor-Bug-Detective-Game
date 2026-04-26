import { describe, expect, it } from "vitest";
import { errandEarnsDeskClue } from "../../src/minigames/errand/round";
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

  it("errand: 2+ clues, or 1 clue with no trap", () => {
    expect(errandEarnsDeskClue(0, 0)).toBe(false);
    expect(errandEarnsDeskClue(1, 1)).toBe(false);
    expect(errandEarnsDeskClue(1, 0)).toBe(true);
    expect(errandEarnsDeskClue(2, 0)).toBe(true);
    expect(errandEarnsDeskClue(2, 1)).toBe(true);
  });

  it("sentence shouldEmitOutcome needs full round and at least 6 blues", () => {
    expect(shouldEmitOutcome(picks("blue"))).toBe(false);
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

  it("tamper requires ≥3 right calls and ≥1 caught lie", () => {
    const r = buildTamperRound(7);
    const honest: CallVerdict[] = r.calls.map((c) =>
      c.bugbotIsLying
        ? { kind: "disagree" as const }
        : { kind: "agree" as const },
    );
    const perfect = scoreTamperRound(r, honest);
    expect(tamperEarnsDeskClue(perfect)).toBe(false);

    const lyingIdx = r.calls.findIndex((c) => c.bugbotIsLying);
    expect(lyingIdx).toBeGreaterThanOrEqual(0);
    const withCatch = honest.map((v, i) =>
      i === lyingIdx
        ? ({ kind: "disagree-point", spotId: r.tamperedSpotId } as CallVerdict)
        : v,
    );
    const caught = scoreTamperRound(r, withCatch);
    expect(caught.caughtLies).toBeGreaterThanOrEqual(1);
    expect(caught.rightCalls).toBe(TAMPER_CALLS_PER_ROUND);
    expect(tamperEarnsDeskClue(caught)).toBe(true);
  });
});
