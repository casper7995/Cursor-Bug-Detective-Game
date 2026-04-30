import { describe, expect, it } from "vitest";
import { ANOMALIES } from "../../src/scene/anomalies";
import {
  pickTemplate,
  TEMPLATE_IDS,
} from "../../src/minigames/sentence/templates";
import {
  getSuggestionRowOrder,
  getSuggestionRowRects,
} from "../../src/minigames/sentence/draw";
import {
  classifyEnding,
  injectName,
  scoreSentenceRun,
  shouldEmitOutcome,
} from "../../src/minigames/sentence/scoring";
import { clueTokenForSentence } from "../../src/minigames/sentence/clueTokens";
import {
  SENTENCE_SLOTS_PER_TEMPLATE,
  type PlayerPick,
} from "../../src/minigames/sentence/types";

describe("sentence templates", () => {
  it("each anomaly has an 8-slot template", () => {
    for (const def of ANOMALIES) {
      const t = pickTemplate(0, def.id);
      expect(t.id).toBe(def.id);
      expect(t.slots.length).toBe(SENTENCE_SLOTS_PER_TEMPLATE);
      for (const s of t.slots) {
        expect(s.options.blue.length).toBeGreaterThan(0);
        expect(s.options.purple.length).toBeGreaterThan(0);
        expect(s.options.orange.length).toBeGreaterThan(0);
      }
    }
  });

  it("TEMPLATE_IDS lists all anomaly ids", () => {
    const known = new Set(ANOMALIES.map((a) => a.id));
    expect(TEMPLATE_IDS.length).toBe(known.size);
    for (const id of TEMPLATE_IDS) expect(known.has(id)).toBe(true);
  });

  it("same (seed, anomaly) returns same template (purple variant stable)", () => {
    const a = pickTemplate(42, "calendar-tomorrow");
    const b = pickTemplate(42, "calendar-tomorrow");
    expect(a).toEqual(b);
  });
});

describe("sentence scoring", () => {
  function picks(...colors: PlayerPick["color"][]): PlayerPick[] {
    return colors.map((color, i) => ({ sentenceIdx: i, color }));
  }

  it("8 blue -> 1000 + by-the-book ending", () => {
    const r = scoreSentenceRun(
      picks("blue", "blue", "blue", "blue", "blue", "blue", "blue", "blue"),
    );
    expect(r.score).toBe(1000);
    expect(r.ending).toBe("by-the-book");
  });

  it("8 idle -> 0 + typewriter-wrote-it ending", () => {
    const ps = picks(
      "idle",
      "idle",
      "idle",
      "idle",
      "idle",
      "idle",
      "idle",
      "idle",
    );
    const r = scoreSentenceRun(ps);
    expect(r.score).toBe(0);
    expect(r.ending).toBe("typewriter-wrote-it");
    expect(shouldEmitOutcome(ps)).toBe(false);
  });

  it("purple earns partial credit without acting as correct", () => {
    const ps = picks(
      "purple",
      "purple",
      "purple",
      "purple",
      "purple",
      "blue",
      "orange",
      "idle",
    );
    const r = scoreSentenceRun(ps);
    // 5 purples (350) + 1 blue (125) + 1 orange (0) + 1 idle (0) = 475.
    // IDLE was previously -25 but tutorial copy says it equals orange.
    expect(r.score).toBe(475);
    expect(r.ending).toBe("cursed-case-file");
    expect(shouldEmitOutcome(ps)).toBe(false);
  });

  it("mixed bag → improv ending", () => {
    const r = scoreSentenceRun(
      picks(
        "blue",
        "purple",
        "orange",
        "blue",
        "purple",
        "blue",
        "orange",
        "blue",
      ),
    );
    expect(r.ending).toBe("improv");
  });

  it("classifyEnding precedence: 2+ oranges trumps purple stack", () => {
    expect(classifyEnding(0, 4, 3)).toBe("typewriter-wrote-it");
    expect(classifyEnding(4, 0, 3)).toBe("typewriter-wrote-it");
  });

  it("requires a full run and at least six blue picks to emit a clue", () => {
    expect(shouldEmitOutcome(picks("blue", "blue", "blue", "blue"))).toBe(
      false,
    );
    expect(
      shouldEmitOutcome(
        picks(
          "blue",
          "blue",
          "blue",
          "blue",
          "blue",
          "purple",
          "orange",
          "idle",
        ),
      ),
    ).toBe(false);
    expect(
      shouldEmitOutcome(
        picks("blue", "blue", "blue", "blue", "blue", "blue", "orange", "idle"),
      ),
    ).toBe(true);
  });
});

describe("sentence suggestion rows", () => {
  const fakeCtx = {
    font: "",
    measureText: (text: string) => ({ width: text.length * 8 }),
  } as unknown as CanvasRenderingContext2D;

  it("keeps row order deterministic for a seed and slot", () => {
    expect(getSuggestionRowOrder(1234, 2)).toEqual(
      getSuggestionRowOrder(1234, 2),
    );
  });

  it("moves the correct option into different visible rows across a run", () => {
    const blueRows = Array.from(
      { length: SENTENCE_SLOTS_PER_TEMPLATE },
      (_, i) => getSuggestionRowOrder(1234, i).indexOf("blue"),
    );
    expect(new Set(blueRows).size).toBeGreaterThan(1);
  });

  it("builds row rects in the provided visible order", () => {
    const rows = getSuggestionRowRects(
      fakeCtx,
      { blue: "right", purple: "maybe", orange: "wrong" },
      ["purple", "orange", "blue"],
    );
    expect(rows.map((r) => r.color)).toEqual(["purple", "orange", "blue"]);
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2]);
  });
});

describe("name injection", () => {
  it("does nothing when consecutive blues < 3", () => {
    expect(injectName("you noticed the lamp", "Casper", 2)).toBe(
      "you noticed the lamp",
    );
  });

  it("replaces 'you' once 3 consecutive blues land", () => {
    expect(injectName("you noticed the lamp", "Casper", 3)).toBe(
      "Casper noticed the lamp",
    );
  });

  it("respects null player name", () => {
    expect(injectName("you noticed the lamp", null, 5)).toBe(
      "you noticed the lamp",
    );
  });

  it("no-op when no 'you' or leading 'I'", () => {
    expect(injectName("the typewriter clacked", "Casper", 5)).toBe(
      "the typewriter clacked",
    );
  });
});

describe("sentence clue token", () => {
  it("normalises and clamps", () => {
    expect(clueTokenForSentence("warning")).toBe("WARNING");
    expect(clueTokenForSentence("")).toBe("WORD");
  });
});
