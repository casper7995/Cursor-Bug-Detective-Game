/**
 * Objective proxy for "≥2 distractors plausibly fit the cipher phrase":
 * each distractor must share at least one significant token (≥3 chars,
 * alphanumeric) with the correct answer and/or one of the four cipher
 * tokens — so wrong picks are not random word salad relative to the case.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

interface CipherEntry {
  readonly id: string;
  readonly runner: string;
  readonly sentence: string;
  readonly errand: string;
  readonly tamper: string;
  readonly correctChoice: string;
  readonly distractorPool: readonly string[];
}

function significantTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 3) out.add(raw);
  }
  return out;
}

function tokenOverlapScore(
  distractor: string,
  correctChoice: string,
  cipherTokens: readonly string[],
): number {
  const d = significantTokens(distractor);
  if (d.size === 0) return 0;
  const anchor = new Set<string>();
  for (const t of significantTokens(correctChoice)) anchor.add(t);
  for (const tok of cipherTokens) {
    for (const t of significantTokens(tok)) anchor.add(t);
  }
  let hits = 0;
  for (const x of d) {
    if (anchor.has(x)) hits++;
  }
  return hits;
}

function plausibleDistractorCount(
  entry: CipherEntry,
  minScore: number,
): number {
  const tokens = [
    entry.runner,
    entry.sentence,
    entry.errand,
    entry.tamper,
  ] as const;
  let count = 0;
  for (const d of entry.distractorPool) {
    if (tokenOverlapScore(d, entry.correctChoice, tokens) >= minScore) {
      count++;
    }
  }
  return count;
}

function parseAnomalies(): readonly CipherEntry[] {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../src/scene/anomalies.ts"),
    "utf8",
  );
  const entries: CipherEntry[] = [];
  const anomalyRe =
    /\{\s*id:\s*"([^"]+)",[\s\S]*?gameClueWords:\s*\{\s*runner:\s*"([^"]+)",\s*sentence:\s*"([^"]+)",\s*errand:\s*"([^"]+)",\s*tamper:\s*"([^"]+)",\s*\}[\s\S]*?correctChoice:\s*"([^"]+)",\s*distractorPool:\s*\[([\s\S]*?)\]/g;

  for (const m of src.matchAll(anomalyRe)) {
    const [, id, runner, sentence, errand, tamper, correctChoice, pool] = m;
    if (
      !id ||
      !runner ||
      !sentence ||
      !errand ||
      !tamper ||
      !correctChoice ||
      pool === undefined
    )
      continue;
    const distractors: string[] = [];
    for (const s of pool.matchAll(/"([^"]+)"/g)) {
      if (s[1]) distractors.push(s[1]);
    }
    entries.push({
      id,
      runner,
      sentence,
      errand,
      tamper,
      correctChoice,
      distractorPool: distractors,
    });
  }
  return entries;
}

const ENTRIES = parseAnomalies();

describe("cipher distractor variety (objective)", () => {
  it("parses anomalies", () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(12);
  });

  for (const e of ENTRIES) {
    it(`anomaly ${e.id}: ≥2 distractors share semantic tokens with case + cipher`, () => {
      const minScore = 1;
      const count = plausibleDistractorCount(e, minScore);
      expect(
        count,
        `expected ≥2 plausible distractors for ${e.id} (overlap on ≥${minScore} significant token(s)); got ${count}. Pool=${JSON.stringify(e.distractorPool)}`,
      ).toBeGreaterThanOrEqual(2);
    });
  }
});
