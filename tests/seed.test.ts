import { describe, it, expect } from "vitest";

function dailySeed(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

describe("dailySeed", () => {
  it("is deterministic per date string", () => {
    expect(dailySeed("2026-04-17")).toBe(dailySeed("2026-04-17"));
  });
  it("differs across days", () => {
    expect(dailySeed("2026-04-17")).not.toBe(dailySeed("2026-04-18"));
  });
});
