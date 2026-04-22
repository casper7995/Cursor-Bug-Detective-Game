import { describe, expect, it } from "vitest";
import {
  buildErrandRound,
  scoreErrandRun,
  canAssignHelper,
  namespacedSeed,
} from "../../src/minigames/errand/round";
import { clueTokenForErrand } from "../../src/minigames/errand/clueTokens";
import { ERRAND_NUM_DRAWERS } from "../../src/minigames/errand/types";
import {
  agentRowHitRect,
  agentRowRect,
  taskCardDropRect,
  taskCardRect,
} from "../../src/minigames/errand/draw";

describe("errand round", () => {
  it("same seed produces same drawer layout", () => {
    const a = buildErrandRound(123);
    const b = buildErrandRound(123);
    expect(a).toEqual(b);
  });

  it("five drawers with deterministic 2/2/1 distribution", () => {
    const r = buildErrandRound(777);
    expect(r.drawers.length).toBe(ERRAND_NUM_DRAWERS);
    const counts = { clue: 0, junk: 0, trap: 0 };
    for (const d of r.drawers) counts[d.content]++;
    expect(counts).toEqual({ clue: 2, junk: 2, trap: 1 });
  });

  it("namespacedSeed is stable", () => {
    expect(namespacedSeed(1, "errand")).toBe(namespacedSeed(1, "errand"));
    expect(namespacedSeed(1, "errand:CLUE")).not.toBe(
      namespacedSeed(1, "errand:OTHER"),
    );
  });
});

describe("errand scoring", () => {
  it("3 clues + all safe → 1000 (1000+50 clamped)", () => {
    expect(scoreErrandRun({ clues: 3, helpersSafe: 3, helpersLost: 0 })).toBe(
      1000,
    );
  });

  it("0 clues → 0", () => {
    expect(scoreErrandRun({ clues: 0, helpersSafe: 3, helpersLost: 0 })).toBe(
      0,
    );
  });

  it("2 clues + 1 lost → 700-100 = 600", () => {
    expect(scoreErrandRun({ clues: 2, helpersSafe: 2, helpersLost: 1 })).toBe(
      600,
    );
  });

  it("1 clue + all safe → 400+50 = 450", () => {
    expect(scoreErrandRun({ clues: 1, helpersSafe: 3, helpersLost: 0 })).toBe(
      450,
    );
  });

  it("aborted-trap helpers count safe + empty (3 helpers all safe, 2 clues)", () => {
    // Player aborted the third (trap) helper → 2 clues, 3 safe, 0 lost.
    expect(scoreErrandRun({ clues: 2, helpersSafe: 3, helpersLost: 0 })).toBe(
      750,
    );
  });
});

describe("errand assignment", () => {
  it("cannot place two helpers on the same drawer", () => {
    const helpers = [
      { drawerAssigned: 0 },
      { drawerAssigned: null },
      { drawerAssigned: null },
    ];
    expect(canAssignHelper(helpers, 1, 0)).toBe(false);
    expect(canAssignHelper(helpers, 1, 1)).toBe(true);
    // Reassigning the same helper to its own drawer is allowed.
    expect(canAssignHelper(helpers, 0, 0)).toBe(true);
  });
});

describe("errand hit targets", () => {
  it("agent row hit rect is taller than the drawn row (easier pickup)", () => {
    const drawn = agentRowRect(0);
    const hit = agentRowHitRect(0);
    expect(hit.h).toBeGreaterThan(drawn.h);
    expect(hit.y).toBeLessThan(drawn.y);
  });

  it("task card drop rect is larger than the visible card (easier drop)", () => {
    const card = taskCardRect(0);
    const drop = taskCardDropRect(0);
    expect(drop.w).toBeGreaterThan(card.w);
    expect(drop.h).toBeGreaterThan(card.h);
  });
});

describe("errand clue token", () => {
  it("normalises and clamps", () => {
    expect(clueTokenForErrand("backwards")).toBe("BACKWARD");
    expect(clueTokenForErrand("")).toBe("RACE");
    expect(clueTokenForErrand("3 . 2 . 1")).toBe("RACE");
  });
});
