/** Pure substitution cipher logic — tested without canvas. */

const GLYPHS = [
  "◆",
  "☆",
  "◇",
  "▲",
  "★",
  "✦",
  "✶",
  "✷",
  "♦",
  "○",
  "□",
  "△",
  "▽",
  "⬡",
  "⬢",
  "◎",
  "◈",
  "⬟",
] as const;

export function normalizeWord(raw: string): string {
  const w = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if (w.length < 3) return "CASE";
  return w.slice(0, 12);
}

export interface Cipher {
  readonly word: string;
  /** One glyph per letter of `word` (same length). */
  readonly glyphs: readonly string[];
  /** Distinct glyphs in first-appearance order. */
  readonly uniqueGlyphs: readonly string[];
  /** Glyph → correct plaintext letter. */
  readonly truth: Readonly<Record<string, string>>;
  /** Letter chips: every needed letter + 2 decoys, shuffled. */
  readonly chips: readonly string[];
  /** Glyphs whose mapping is revealed at start (length 0 or 1). */
  readonly prefilled: readonly string[];
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  let s = Math.floor(rng() * 1e9) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

/**
 * Assign distinct glyphs to distinct letters (same count), order shuffled.
 */
function assignGlyphsToLetters(
  uniqueLetters: readonly string[],
  rng: () => number,
): Map<string, string> {
  const n = uniqueLetters.length;
  const pool = [...GLYPHS.slice(0, n)];
  const shuffledGlyphs = shuffle(pool, rng);
  const map = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    map.set(uniqueLetters[i]!, shuffledGlyphs[i]!);
  }
  return map;
}

export function buildCipher(seedWord: string, rng: () => number): Cipher {
  const word = normalizeWord(seedWord);
  const letters = [...word];

  const seen = new Set<string>();
  const uniqueLetters: string[] = [];
  for (const ch of letters) {
    if (!seen.has(ch)) {
      seen.add(ch);
      uniqueLetters.push(ch);
    }
  }

  const letterToGlyph = assignGlyphsToLetters(uniqueLetters, rng);
  const glyphs = letters.map((ch) => letterToGlyph.get(ch)!);

  const uniqueGlyphs: string[] = [];
  const ugSeen = new Set<string>();
  for (const g of glyphs) {
    if (!ugSeen.has(g)) {
      ugSeen.add(g);
      uniqueGlyphs.push(g);
    }
  }

  const truth: Record<string, string> = {};
  for (const L of uniqueLetters) {
    truth[letterToGlyph.get(L)!] = L;
  }

  const decoys: string[] = [];
  for (let c = 65; c <= 90 && decoys.length < 2; c++) {
    const ch = String.fromCharCode(c);
    if (!seen.has(ch)) decoys.push(ch);
  }

  const needed = [...uniqueLetters];
  const chips = shuffle([...needed, ...decoys], rng);

  const prefilled: string[] = [];
  if (word.length <= 5 && uniqueGlyphs.length > 0) {
    const gi = Math.floor(rng() * uniqueGlyphs.length);
    prefilled.push(uniqueGlyphs[gi]!);
  }

  return {
    word,
    glyphs,
    uniqueGlyphs,
    truth,
    chips,
    prefilled,
  };
}

export function isCipherSolved(
  cipher: Cipher,
  mapping: Readonly<Record<string, string | null>>,
): boolean {
  for (const g of cipher.uniqueGlyphs) {
    const m = mapping[g];
    if (m == null || m !== cipher.truth[g]) return false;
  }
  return true;
}

/** Initial mapping with prefilled glyphs set to truth; rest null. */
export function initialMapping(cipher: Cipher): Record<string, string | null> {
  const m: Record<string, string | null> = {};
  for (const g of cipher.uniqueGlyphs) m[g] = null;
  for (const g of cipher.prefilled) {
    if (cipher.truth[g] !== undefined) m[g] = cipher.truth[g]!;
  }
  return m;
}

/** Chips available at start (prefilled letters removed from pool). */
export function initialChipPool(cipher: Cipher): string[] {
  const take = new Set<string>();
  for (const g of cipher.prefilled) {
    take.add(cipher.truth[g]!);
  }
  return cipher.chips.filter((ch) => !take.has(ch));
}
