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
import {
  routeDeskInteractionTag,
  routeDeskMiniTag,
} from "../../src/scene/deskInteractionRouting";

describe("desk-mini routing", () => {
  it("evidence-envelope → sentence", () => {
    expect(routeDeskMiniTag("evidence-envelope")).toBe("sentence");
  });
  it("reagent-tray → errand (NOT sentence)", () => {
    expect(routeDeskMiniTag("reagent-tray")).toBe("errand");
  });
  it("lamp → tamper", () => {
    expect(routeDeskMiniTag("lamp")).toBe("tamper");
  });
  it("monitor + monitor-screen + others do not open desk minis", () => {
    expect(routeDeskMiniTag("monitor")).toBeNull();
    expect(routeDeskMiniTag("monitor-screen")).toBeNull();
    expect(routeDeskMiniTag("mug")).toBeNull();
    expect(routeDeskMiniTag("calendar")).toBeNull();
    expect(routeDeskMiniTag("plant")).toBeNull();
  });
});

describe("full desk interaction routing", () => {
  const shared = {
    monitorDailyClear: false,
    anomalyTargetTag: "calendar",
  } as const;

  it("routes monitor clicks into the daily runner until daily clear", () => {
    expect(routeDeskInteractionTag("monitor", shared)).toEqual({
      kind: "runner",
      mode: "daily",
    });
    expect(routeDeskInteractionTag("monitor-screen", shared)).toEqual({
      kind: "runner",
      mode: "daily",
    });
  });

  it("routes monitor clicks into endless after daily clear", () => {
    expect(
      routeDeskInteractionTag("monitor", {
        ...shared,
        monitorDailyClear: true,
      }),
    ).toEqual({
      kind: "runner",
      mode: "endless",
    });
  });

  it("Shift+click monitor routes to daily practice after daily clear", () => {
    expect(
      routeDeskInteractionTag("monitor", {
        ...shared,
        monitorDailyClear: true,
        shiftKey: true,
      }),
    ).toEqual({
      kind: "runner",
      mode: "daily",
    });
  });

  it("routes case file separately", () => {
    expect(routeDeskInteractionTag("case-file", shared)).toEqual({
      kind: "case-file",
    });
  });

  it("does not steal clicks on the live anomaly target", () => {
    expect(routeDeskInteractionTag("calendar", shared)).toEqual({
      kind: "none",
    });
  });

  it("routes non-anomaly desk props into flavor inspection only when eligible", () => {
    expect(routeDeskInteractionTag("mug", shared)).toEqual({
      kind: "flavor",
    });
    expect(routeDeskInteractionTag("lamp-shadow", shared)).toEqual({
      kind: "flavor",
    });
    expect(routeDeskInteractionTag("plant", shared)).toEqual({
      kind: "flavor",
    });
  });

  it("leaves unrelated tags alone", () => {
    expect(routeDeskInteractionTag("unknown-prop", shared)).toEqual({
      kind: "none",
    });
  });
});
