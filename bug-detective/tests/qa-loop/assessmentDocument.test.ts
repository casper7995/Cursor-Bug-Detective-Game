import { describe, expect, it } from "vitest";
import type { QaAssessmentDocument } from "../../qa-loop/types.js";

const sample: QaAssessmentDocument = {
  version: 1,
  runId: "r1",
  model: "test",
  createdAt: "2026-01-01T00:00:00.000Z",
  byMinigame: {
    runner: {
      minigame: "runner",
      issues: [],
      dimensions: {
        clarity: 8,
        controlFeel: 8,
        fun: 8,
        goalReadability: 8,
        visualPolish: 8,
        performanceSmoothness: 8,
        cursorBrandFit: 8,
      },
      score100: 80,
      assessment: "ok",
      recommendedFixes: ["tune intro"],
    },
    sentence: {
      minigame: "sentence",
      issues: [],
      dimensions: {
        clarity: 8,
        controlFeel: 8,
        fun: 8,
        goalReadability: 8,
        visualPolish: 8,
        performanceSmoothness: 8,
        cursorBrandFit: 8,
      },
      score100: 80,
      assessment: "ok",
      recommendedFixes: [],
    },
    errand: {
      minigame: "errand",
      issues: [],
      dimensions: {
        clarity: 8,
        controlFeel: 8,
        fun: 8,
        goalReadability: 8,
        visualPolish: 8,
        performanceSmoothness: 8,
        cursorBrandFit: 8,
      },
      score100: 80,
      assessment: "ok",
      recommendedFixes: [],
    },
    tamper: {
      minigame: "tamper",
      issues: [],
      dimensions: {
        clarity: 8,
        controlFeel: 8,
        fun: 8,
        goalReadability: 8,
        visualPolish: 8,
        performanceSmoothness: 8,
        cursorBrandFit: 8,
      },
      score100: 80,
      assessment: "ok",
      recommendedFixes: [],
    },
  },
  gate: { passThreshold: 90, allPassed: false, failing: ["runner", "sentence", "errand", "tamper"] },
};

describe("assessment document shape", () => {
  it("serializes and parses", () => {
    const round = JSON.parse(JSON.stringify(sample)) as QaAssessmentDocument;
    expect(round.gate.failing).toEqual(sample.gate.failing);
  });
});
