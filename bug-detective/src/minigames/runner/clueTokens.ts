import type { PickedAnomaly } from "../../scene/anomalies";

export interface RunnerClueSet {
  /** Tokens to highlight in any matching snippet, e.g. ["calendar","tomorrow"]. */
  readonly tokens: readonly string[];
  /** Color cycle so different tokens read differently. */
  readonly palette: readonly string[];
}

const STOP = new Set([
  "that",
  "this",
  "with",
  "from",
  "have",
  "your",
  "shows",
  "looks",
  "feels",
  "wrong",
  "there",
  "what",
  "when",
  "where",
  "which",
  "about",
  "after",
  "before",
]);

/** Cursor warm palette — orange / gold / off-white accents. */
const DEFAULT_PALETTE = [
  "rgba(245,78,0,0.45)",
  "rgba(192,133,50,0.45)",
  "rgba(237,236,236,0.30)",
  "rgba(245,78,0,0.25)",
] as const;

function wordsFromText(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

/**
 * Derive up to 4 clue tokens from the picked anomaly’s hint + correct answer.
 */
export function deriveRunnerClueSet(picked: PickedAnomaly): RunnerClueSet {
  const raw = `${picked.def.tooltipHint} ${picked.def.correctChoice}`;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of wordsFromText(raw)) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= 4) break;
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
