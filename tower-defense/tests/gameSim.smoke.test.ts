import { describe, it, expect } from "vitest";
import { GameSim } from "../src/sim/gameSim";

describe("GameSim", () => {
  it("constructs with default class", () => {
    const sim = new GameSim("arrow");
    expect(sim.playerClass).toBe("arrow");
    expect(sim.outcome).toBe("playing");
  });
});
