import { describe, expect, test } from "vitest";
import { computeTutorialLayout } from "../src/minigames/desk/tutorialGate";

const CANVAS_W = 512;
const CANVAS_H = 320;
const CARD_W = Math.min(460, CANVAS_W - 48);

const errandLikeContent = {
  drawDiagram: () => {},
  diagramHeight: 84,
} as const;

/** ~measured bullet stack for current errand `howToLines` at card width 460; raise if copy grows. */
const ERRAND_BULLETS_BLOCK_APPROX = 150;

describe("computeTutorialLayout", () => {
  test("512×320 errand-like: Start, footer, and diagram stay inside card", () => {
    const { cardRect, startRect, diagramBounds } = computeTutorialLayout(
      CANVAS_W,
      CANVAS_H,
      CARD_W,
      errandLikeContent,
      ERRAND_BULLETS_BLOCK_APPROX,
    );

    expect(cardRect.y).toBeGreaterThanOrEqual(0);
    expect(cardRect.y + cardRect.h).toBeLessThanOrEqual(CANVAS_H);

    const footerBaseline = cardRect.y + cardRect.h - 13;
    expect(startRect.y + startRect.h).toBeLessThanOrEqual(
      cardRect.y + cardRect.h - 28,
    );
    expect(footerBaseline).toBeLessThanOrEqual(CANVAS_H - 8);

    if (diagramBounds) {
      expect(diagramBounds.y + diagramBounds.h).toBeLessThanOrEqual(
        startRect.y + 0.5,
      );
      expect(diagramBounds.y).toBeGreaterThanOrEqual(cardRect.y);
    }
  });

  test("tall bullet stack: Start and footer still bottom-anchored within card", () => {
    const { cardRect, startRect } = computeTutorialLayout(
      CANVAS_W,
      CANVAS_H,
      CARD_W,
      errandLikeContent,
      220,
    );
    expect(startRect.y + startRect.h).toBeLessThanOrEqual(
      cardRect.y + cardRect.h - 24,
    );
    expect(cardRect.h).toBeLessThanOrEqual(CANVAS_H - 24);
  });
});
