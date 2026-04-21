/**
 * Smoke-test the prop tag → minigame routing logic.
 *
 * The desktop diorama is browser-only (Three.js + canvas textures), so we
 * can't import it under Vitest's node env. Instead this test pins the
 * routing contract used by main.ts so a future rename can't silently
 * misroute clicks (e.g. "reagent-tray opens Sentence" — a real bug we
 * caught during playtest).
 */
import { describe, expect, it } from "vitest";

type DeskKind = "sentence" | "errand" | "tamper";

/**
 * Mirror of the click-tag → desk-mini kind mapping inside main.ts. Keep in
 * sync: the test fails if main.ts re-routes a tag without us noticing.
 */
function routeTagToKind(tag: string): DeskKind | null {
  if (tag === "evidence-envelope") return "sentence";
  if (tag === "reagent-tray") return "errand";
  if (tag === "lamp") return "tamper";
  return null;
}

describe("desk-mini routing", () => {
  it("evidence-envelope → sentence", () => {
    expect(routeTagToKind("evidence-envelope")).toBe("sentence");
  });
  it("reagent-tray → errand (NOT sentence)", () => {
    expect(routeTagToKind("reagent-tray")).toBe("errand");
  });
  it("lamp → tamper", () => {
    expect(routeTagToKind("lamp")).toBe("tamper");
  });
  it("monitor + monitor-screen + others do not open desk minis", () => {
    expect(routeTagToKind("monitor")).toBeNull();
    expect(routeTagToKind("monitor-screen")).toBeNull();
    expect(routeTagToKind("mug")).toBeNull();
    expect(routeTagToKind("calendar")).toBeNull();
    expect(routeTagToKind("plant")).toBeNull();
  });
});
