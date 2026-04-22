/**
 * Cipher-clue rubric: for every anomaly, the four `gameClueWords` tokens must
 * be oblique — they must NOT appear as case-insensitive substrings of
 * `correctChoice` or of any `distractorPool` entry. Together they form a riddle,
 * not a paraphrase.
 *
 * We also enforce charset / length / mutual-uniqueness so the derivation
 * helpers in each minigame produce predictable tokens.
 */
import { describe, expect, it } from "vitest";

// Import anomalies via a lightweight shim: the anomalies module pulls in
// three.js texture builders at import time, which vitest's node env can't
// load. So we duplicate just the cipher data here, and assert the source file
// contains the same values via a structural regex sweep.
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

function parseAnomalies(): readonly CipherEntry[] {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../src/scene/anomalies.ts"),
    "utf8",
  );

  // Match each anomaly literal: pull id, gameClueWords block, correctChoice,
  // and distractorPool array. The rest of the anomaly object (apply, reveal,
  // etc.) is ignored.
  const entries: CipherEntry[] = [];
  const anomalyRe = /\{\s*id:\s*"([^"]+)",[\s\S]*?gameClueWords:\s*\{\s*runner:\s*"([^"]+)",\s*sentence:\s*"([^"]+)",\s*errand:\s*"([^"]+)",\s*tamper:\s*"([^"]+)",\s*\}[\s\S]*?correctChoice:\s*"([^"]+)",\s*distractorPool:\s*\[([\s\S]*?)\]/g;

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

describe("clue cipher rubric", () => {
  it("parses at least 12 anomalies from source", () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(12);
  });

  for (const e of ENTRIES) {
    describe(`anomaly ${e.id}`, () => {
      const tokens = [e.runner, e.sentence, e.errand, e.tamper];

      it("each cipher token is 3–8 chars, A–Z only", () => {
        for (const t of tokens) {
          expect(t).toMatch(/^[A-Z]+$/);
          expect(t.length).toBeGreaterThanOrEqual(3);
          expect(t.length).toBeLessThanOrEqual(8);
        }
      });

      it("cipher tokens are mutually distinct within the anomaly", () => {
        expect(new Set(tokens).size).toBe(tokens.length);
      });

      it("no cipher token appears as substring of correctChoice", () => {
        const low = e.correctChoice.toLowerCase();
        for (const t of tokens) {
          expect(
            low.includes(t.toLowerCase()),
            `cipher token "${t}" leaks into correctChoice "${e.correctChoice}"`,
          ).toBe(false);
        }
      });

      it("no cipher token appears as substring of any distractor", () => {
        for (const d of e.distractorPool) {
          const low = d.toLowerCase();
          for (const t of tokens) {
            expect(
              low.includes(t.toLowerCase()),
              `cipher token "${t}" leaks into distractor "${d}"`,
            ).toBe(false);
          }
        }
      });

      it("distractorPool has at least 5 entries", () => {
        expect(e.distractorPool.length).toBeGreaterThanOrEqual(5);
      });
    });
  }
});
