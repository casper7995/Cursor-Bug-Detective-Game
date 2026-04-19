import { describe, expect, it } from "vitest";
import {
  addDrop,
  colorDistance,
  isMixCloseEnough,
  rinse,
  targetRgbFromToken,
  MATCH_TOLERANCE,
} from "../../src/minigames/reagent/reagentMix";

describe("reagent mix", () => {
  it("targetRgbFromToken is stable per token", () => {
    const a = targetRgbFromToken("REVERSE");
    const b = targetRgbFromToken("REVERSE");
    expect(a).toEqual(b);
  });

  it("addDrop increases channel", () => {
    const r = rinse();
    const x = addDrop(r, 0);
    expect(x.r).toBeGreaterThan(r.r);
    expect(x.g).toBe(r.g);
  });

  it("isMixCloseEnough within tolerance", () => {
    const t = targetRgbFromToken("X");
    expect(isMixCloseEnough(t, t)).toBe(true);
    expect(colorDistance(rinse(), t) > MATCH_TOLERANCE).toBe(true);
  });
});
