import type { PickedAnomaly } from "../../scene/anomalies";

export interface RunnerClueSet {
  /** Tokens to highlight in any matching snippet (cipher words, lowercased). */
  readonly tokens: readonly string[];
  /** Color cycle so different tokens read differently. */
  readonly palette: readonly string[];
}

/** Cursor warm palette — orange / gold / off-white accents. */
const DEFAULT_PALETTE = [
  "rgba(245,78,0,0.45)",
  "rgba(192,133,50,0.45)",
  "rgba(237,236,236,0.30)",
  "rgba(245,78,0,0.25)",
] as const;

/**
 * Return all four cipher clue tokens from the picked anomaly, lowercased for
 * case-insensitive matching against plank snippets. The cipher words are the
 * ONLY highlightable tokens — literal answer words no longer leak onto planks.
 */
export function deriveRunnerClueSet(picked: PickedAnomaly): RunnerClueSet {
  const g = picked.def.gameClueWords;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [g.runner, g.sentence, g.errand, g.tamper]) {
    const tok = raw.toLowerCase().replace(/[^a-z]/g, "");
    if (!tok || seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return { tokens: out, palette: [...DEFAULT_PALETTE] };
}

/** ~30% of planks carry highlightable snippet tokens (deterministic). */
export function plankHasClueToken(plankId: number): boolean {
  return ((plankId * 7919) >>> 0) % 10 < 3;
}

/**
 * Height gate: how many tokens from the pool can appear at this climb height.
 */
export function visibleTokenCountForHeight(heightM: number): number {
  if (heightM < 100) return 1;
  if (heightM < 200) return 2;
  return 4;
}

export function activeTokensForHeight(
  set: RunnerClueSet,
  heightM: number,
): readonly string[] {
  const n = Math.min(visibleTokenCountForHeight(heightM), set.tokens.length);
  return set.tokens.slice(0, n);
}

/** Longest active token match at `start` (case-insensitive), or null. */
export function matchTokenAt(
  snippet: string,
  start: number,
  activeTokens: readonly string[],
): { token: string; len: number; tokenIdx: number } | null {
  let best: { token: string; len: number; tokenIdx: number } | null = null;
  const slice = snippet.slice(start);
  const lower = slice.toLowerCase();
  for (let ti = 0; ti < activeTokens.length; ti++) {
    const tok = activeTokens[ti]!;
    if (lower.startsWith(tok)) {
      if (!best || tok.length > best.len) {
        best = {
          token: snippet.slice(start, start + tok.length),
          len: tok.length,
          tokenIdx: ti,
        };
      }
    }
  }
  return best;
}
