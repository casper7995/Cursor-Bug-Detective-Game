import { describe, expect, it } from "vitest";
import { gradeFinalAccusation } from "../src/game/answerGrader";
import { ANOMALIES } from "../src/scene/anomalies";
import type { PickedAnomaly } from "../src/scene/anomalies";

function pickedFor(id: (typeof ANOMALIES)[number]["id"]): PickedAnomaly {
  const def = ANOMALIES.find((a) => a.id === id);
  if (!def) throw new Error(`ANOMALIES missing id: ${id}`);
  return {
    def,
    choices: [def.correctChoice, "x", "y"],
    correctIndex: 0,
  };
}

describe("gradeFinalAccusation", () => {
  it("accepts natural wording for calendar anomaly", () => {
    const p = pickedFor("calendar-tomorrow");
    expect(
      gradeFinalAccusation("the calendar is set to tomorrow's date", p).kind,
    ).toBe("correct");
  });

  it("returns vague for empty noise", () => {
    const p = pickedFor("mug-name");
    expect(gradeFinalAccusation("ok", p).kind).toBe("vague");
  });

  it("returns wrong when another anomaly is described clearly", () => {
    const p = pickedFor("mug-name");
    expect(
      gradeFinalAccusation(
        "the keyboard has a huge extra red key that should not exist",
        p,
      ).kind,
    ).toBe("wrong");
  });
});
