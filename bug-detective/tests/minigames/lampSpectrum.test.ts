import { describe, expect, it } from "vitest";
import {
  canReadWithFilter,
  correctFilterForWord,
} from "../../src/minigames/lamp/lampSpectrum";

describe("lamp spectrum", () => {
  it("correctFilterForWord is stable", () => {
    expect(correctFilterForWord("HELLO")).toBe(correctFilterForWord("HELLO"));
  });

  it("only matching filter passes read", () => {
    const w = "MYSTERY";
    const good = correctFilterForWord(w);
    expect(canReadWithFilter(good, w)).toBe(true);
    const bad = good === "none" ? "red" : "none";
    expect(canReadWithFilter(bad, w)).toBe(false);
  });
});
