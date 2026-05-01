import { describe, expect, it } from "vitest";
import type { AgentKind } from "../../src/minigames/errand/types";
import { errandAgentLaneBadgeMeta } from "../../src/minigames/errand/errandLaneBadge";

describe("errand lane badge meta", () => {
  it("maps each AgentKind to a stable abbrev (regression guard)", () => {
    const kinds: AgentKind[] = ["fixer", "reviewer", "firewall"];
    const abbrevs = kinds.map((k) => errandAgentLaneBadgeMeta(k).abbrev);
    expect(abbrevs).toEqual(["FIX", "REV", "FW"]);
  });
});
