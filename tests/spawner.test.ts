import { describe, it, expect } from "vitest";
import { spawnInterval } from "../src/spawner";

describe("spawnInterval", () => {
  it("starts at 2.0s at t=0", () => {
    expect(spawnInterval(0, 120)).toBeCloseTo(2.0);
  });
  it("ends at 0.4s at t=120", () => {
    expect(spawnInterval(120, 120)).toBeCloseTo(0.4);
  });
  it("is monotonic decreasing", () => {
    let last = Infinity;
    for (let t = 0; t <= 120; t += 10) {
      const v = spawnInterval(t, 120);
      expect(v).toBeLessThanOrEqual(last);
      last = v;
    }
  });
});
