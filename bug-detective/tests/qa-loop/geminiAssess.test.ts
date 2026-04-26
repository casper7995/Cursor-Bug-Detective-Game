import { describe, expect, it } from "vitest";
import {
  buildGeminiAssessmentUserPromptText,
  geminiAssessmentPromptOverviewForRun,
  mimeTypeForVideoPath,
} from "../../qa-loop/geminiAssess.js";

describe("Gemini assessment video MIME detection", () => {
  it("uses mp4 MIME type for mp4 recordings", () => {
    expect(mimeTypeForVideoPath("/tmp/videos/runner.mp4")).toBe("video/mp4");
  });

  it("uses webm MIME type for webm recordings", () => {
    expect(mimeTypeForVideoPath("/tmp/videos/runner.webm")).toBe("video/webm");
  });
});

describe("Gemini assessment prompt text", () => {
  it("buildGeminiAssessmentUserPromptText includes intro, schema, run id, and optional operator block", () => {
    const without = buildGeminiAssessmentUserPromptText({
      runId: "run-a",
      minigame: "errand",
    });
    expect(without).toContain("Bug Detective minigame");
    expect(without).toContain("score100 0-100");
    expect(without).toContain("Run id: run-a Minigame: errand");
    expect(without).not.toContain("Additional direction from the QA operator");

    const withNotes = buildGeminiAssessmentUserPromptText({
      runId: "run-a",
      minigame: "errand",
      extraInstructions: "Watch for jank.",
    });
    expect(withNotes).toContain("Additional direction from the QA operator:");
    expect(withNotes).toContain("Watch for jank.");
  });

  it("geminiAssessmentPromptOverviewForRun documents 0–100 scoring", () => {
    const o = geminiAssessmentPromptOverviewForRun("run-doc");
    expect(o).toContain("run-doc");
    expect(o).toContain("score100 0-100");
    expect(o).toContain("clarity");
  });
});
