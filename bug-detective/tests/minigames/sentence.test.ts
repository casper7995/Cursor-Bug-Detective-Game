import { describe, expect, it } from "vitest";
import { ANOMALIES } from "../../src/scene/anomalies";
import {
  pickTemplate,
  TEMPLATE_IDS,
} from "../../src/minigames/sentence/templates";
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
  it("each anomaly has a 4-slot template", () => {
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

  it("4 blue → 1000 + by-the-book ending", () => {
    const r = scoreSentenceRun(picks("blue", "blue", "blue", "blue"));
    expect(r.score).toBe(1000);
    expect(r.ending).toBe("by-the-book");
  });

  it("4 idle → 0 (clamp from -200) + typewriter-wrote-it ending", () => {
    const ps = picks("idle", "idle", "idle", "idle");
    const r = scoreSentenceRun(ps);
    expect(r.score).toBe(0);
    expect(r.ending).toBe("typewriter-wrote-it");
    expect(shouldEmitOutcome(ps)).toBe(false);
  });

  it("3 purple + 1 blue → 250 + 450 = 700, cursed ending", () => {
    const r = scoreSentenceRun(picks("purple", "purple", "purple", "blue"));
    expect(r.score).toBe(700);
    expect(r.ending).toBe("cursed-case-file");
  });

  it("mixed bag → improv ending", () => {
    const r = scoreSentenceRun(picks("blue", "purple", "orange", "blue"));
    expect(r.ending).toBe("improv");
  });

  it("classifyEnding precedence: 2+ oranges trumps purple stack", () => {
    expect(classifyEnding(0, 3, 2)).toBe("typewriter-wrote-it");
    expect(classifyEnding(2, 0, 2)).toBe("typewriter-wrote-it");
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
