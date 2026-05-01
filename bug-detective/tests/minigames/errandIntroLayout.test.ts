import { describe, expect, it } from "vitest";
import {
  ERRAND_INTRO_BODY_PARAS,
  ERRAND_INTRO_CARD,
  errandIntroInstructionLayout,
  errandIntroLineTestContext,
} from "../../src/minigames/errand/errandIntroLayout";
import { wrappedLineCount } from "../../src/minigames/desk/aiCard";

describe("errand intro instruction layout", () => {
  it("512×320: pessimistic wrap estimate keeps last baseline above progress margin", () => {
    const lay = errandIntroInstructionLayout(512, 320);
    const ctx = errandIntroLineTestContext();
    const w = lay.bodyTextMaxWidth;
    const lineH = ERRAND_INTRO_CARD.bodyLineHeight;

    let cursor = lay.bodyStartY;
    for (let i = 0; i < ERRAND_INTRO_BODY_PARAS.length; i++) {
      const n = wrappedLineCount(ctx, ERRAND_INTRO_BODY_PARAS[i]!, w);
      cursor += n * lineH;
      if (i < ERRAND_INTRO_BODY_PARAS.length - 1) cursor += 4;
    }
    const lastBaseline = cursor - lineH;
    expect(lastBaseline).toBeLessThanOrEqual(lay.maxBodyBottomY);
  });

  it("reserves progress-line gap like tamper intro pattern", () => {
    const lay = errandIntroInstructionLayout(512, 320);
    expect(lay.progressLineY - lay.maxBodyBottomY).toBeGreaterThanOrEqual(
      ERRAND_INTRO_CARD.textBottomMarginAboveProgress,
    );
    expect(lay.maxBodyBottomY).toBeGreaterThan(lay.bodyStartY);
  });
});
