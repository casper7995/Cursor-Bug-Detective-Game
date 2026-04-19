import { describe, expect, it } from "vitest";
import { ANOMALIES } from "../src/scene/anomalies";
import { deriveRunnerClueSet } from "../src/minigames/runner/clueTokens";
import { snippetTextForPlankId } from "../src/minigames/runner/snippets";

describe("runner themed snippets", () => {
  it("each anomaly: most early plank lines contain at least one clue token", () => {
    for (const def of ANOMALIES) {
      const clueSet = deriveRunnerClueSet({
        def,
        choices: [def.correctChoice, "x", "y"],
        correctIndex: 0,
      });
      let hits = 0;
      for (let id = 0; id < 30; id++) {
        const text = snippetTextForPlankId(id, def.id).toLowerCase();
        const ok = clueSet.tokens.some((tok) =>
          text.includes(tok.toLowerCase()),
        );
        if (ok) hits++;
      }
      expect(
        hits / 30,
        `anomaly=${def.id} tokens=${clueSet.tokens.join(",")}`,
      ).toBeGreaterThanOrEqual(0.6);
    }
  });
});
