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
