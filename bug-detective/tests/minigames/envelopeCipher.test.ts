import { describe, expect, it } from "vitest";
import {
  buildCipher,
  initialChipPool,
  initialMapping,
  isCipherSolved,
  normalizeWord,
} from "../../src/minigames/envelope/envelopeCipher";

describe("envelope substitution cipher", () => {
  it("normalizeWord strips and pads", () => {
    expect(normalizeWord("ab")).toBe("CASE");
    expect(normalizeWord("hello!")).toBe("HELLO");
  });

  it("buildCipher is deterministic with fixed rng", () => {
    const rng = (): number => 0.42;
    const a = buildCipher("WARNING", rng);
    const b = buildCipher("WARNING", rng);
    expect(a.word).toBe("WARNING");
    expect(a.glyphs.length).toBe(a.word.length);
    expect(a.uniqueGlyphs.length).toBeGreaterThanOrEqual(1);
    expect(a.chips.length).toBe(a.uniqueGlyphs.length + 2);
    expect(a).toEqual(b);
  });

  it("chips include two decoys not in the word", () => {
    const c = buildCipher("ABC", () => 0.2);
    const letters = new Set([...c.word]);
    const decoyCount = c.chips.filter((ch) => !letters.has(ch)).length;
    expect(decoyCount).toBe(2);
  });

  it("isCipherSolved checks full key mapping", () => {
    const rng = (): number => 0.5;
    const c = buildCipher("TEST", rng);
    const m = initialMapping(c);
    for (const g of c.uniqueGlyphs) {
      m[g] = c.truth[g]!;
    }
    expect(isCipherSolved(c, m)).toBe(true);
    const bad = { ...m };
    const firstG = c.uniqueGlyphs[0]!;
    bad[firstG] = "Z";
    expect(isCipherSolved(c, bad)).toBe(false);
  });

  it("initialChipPool removes prefilled letters from pool", () => {
    const c = buildCipher("AB", () => 0.11);
    const pool = initialChipPool(c);
    for (const g of c.prefilled) {
      expect(pool.includes(c.truth[g]!)).toBe(false);
    }
  });
});
