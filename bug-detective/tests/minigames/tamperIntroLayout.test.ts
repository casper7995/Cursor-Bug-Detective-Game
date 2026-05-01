import { describe, expect, it } from "vitest";
import {
  TAMPER_INTRO_CARD,
  tamperIntroInstructionLayout,
} from "../../src/minigames/tamper/instructionCardLayout";

describe("tamper intro instruction layout", () => {
  it("reserves space so body copy sits above the progress line on 512×320", () => {
    const m = tamperIntroInstructionLayout(512, 320);
    expect(m.bodyHeightBudget).toBeGreaterThanOrEqual(56);
    expect(m.progressLineY - m.maxBodyBottomY).toBeGreaterThanOrEqual(10);
    expect(m.maxBodyBottomY).toBeGreaterThan(m.bodyStartY);
    expect(m.progressLineY).toBeLessThan(m.cardTop + TAMPER_INTRO_CARD.h);
  });
});
