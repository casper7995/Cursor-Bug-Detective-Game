/** Pure lamp filter logic — tested without canvas. */

import { normalizeWord } from "../envelope/envelopeCipher";

export type LampFilter = "none" | "red" | "blue" | "uv";

const FILTERS: readonly LampFilter[] = ["none", "red", "blue", "uv"];

export function correctFilterForWord(seedWord: string): LampFilter {
  const w = normalizeWord(seedWord);
  let h = 2166136261;
  for (let i = 0; i < w.length; i++) {
    h = Math.imul(h ^ w.charCodeAt(i), 16777619);
  }
  const idx = (h >>> 0) % 4;
  return FILTERS[idx] ?? "none";
}

export function canReadWithFilter(
  filter: LampFilter,
  seedWord: string,
): boolean {
  return filter === correctFilterForWord(seedWord);
}
