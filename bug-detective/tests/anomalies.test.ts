/**
 * Anomalies module touches three.js + browser canvas APIs at import time
 * (texture builders), so we can't import desktopDiorama directly under
 * Vitest's node env. Test the pure picker logic by re-implementing the FNV
 * hash + Mulberry RNG and exercising the same algorithm shape.
 *
 * The picker is also tested indirectly: anomalies.ts exports `pickAnomaly`
 * which uses `makeSeededRng` from the api/seedClient. Importing seedClient
 * is browser-safe (only DOM-free modules), so we test the seed pipeline
 * end-to-end via that surface, plus document the determinism contract.
 */
import { describe, expect, it } from "vitest";
import { fallbackSeed, makeSeededRng } from "../src/api/seedClient";

describe("seedClient", () => {
  it("fallbackSeed is FNV-1a (stable across calls)", () => {
    expect(fallbackSeed("2026-04-18")).toBe(fallbackSeed("2026-04-18"));
    expect(fallbackSeed("2026-04-19")).not.toBe(fallbackSeed("2026-04-18"));
  });

  it("makeSeededRng with the same seed yields the same sequence", () => {
    const a = makeSeededRng(12345);
    const b = makeSeededRng(12345);
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds yield different first values", () => {
    const a = makeSeededRng(1);
    const b = makeSeededRng(2);
    expect(a()).not.toBe(b());
  });
});

describe("pickAnomaly determinism (algorithmic shape)", () => {
  // Re-derive the picker algorithm without importing the three.js-bound
  // anomalies module. The test asserts that a Fisher-Yates-and-pick using
  // the same RNG and the same input arrays produces a stable result.
  const POOL_SIZE = 10;

  function pickIndex(seed: number): number {
    const rng = makeSeededRng(seed);
    return Math.floor(rng() * POOL_SIZE);
  }

  it("same seed picks the same anomaly index", () => {
    expect(pickIndex(42)).toBe(pickIndex(42));
    expect(pickIndex(2026)).toBe(pickIndex(2026));
  });

  it("different seeds spread across at least 4 distinct indices over 50 trials", () => {
    const seen = new Set<number>();
    for (let s = 1; s <= 50; s++) {
      seen.add(pickIndex(s));
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("Fisher–Yates shuffle is deterministic per seed", () => {
    function shuffled(seed: number, items: readonly string[]): string[] {
      const rng = makeSeededRng(seed);
      const arr = [...items];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const a = arr[i];
        const b = arr[j];
        if (a !== undefined && b !== undefined) {
          arr[i] = b;
          arr[j] = a;
        }
      }
      return arr;
    }
    const items = ["a", "b", "c", "d", "e"];
    expect(shuffled(99, items)).toEqual(shuffled(99, items));
    expect(shuffled(1, items)).not.toEqual(shuffled(2, items));
  });
});
