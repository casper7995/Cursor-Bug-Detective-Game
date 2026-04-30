import { describe, expect, it } from "vitest";
import type { Intersection } from "three";
import { preferredDeskHoverHit } from "../src/scene/propInteractions";

describe("preferredDeskHoverHit", () => {
  it("prefers closest prop over a nearer desk hit", () => {
    const desk = {
      distance: 1,
      object: { userData: { tag: "desk" } },
    } as Intersection;
    const envelope = {
      distance: 1.02,
      object: { userData: { tag: "evidence-envelope" } },
    } as Intersection;
    expect(preferredDeskHoverHit([desk, envelope])).toBe(envelope);
  });

  it("falls back to desk when it is the only hit", () => {
    const desk = {
      distance: 1,
      object: { userData: { tag: "desk" } },
    } as Intersection;
    expect(preferredDeskHoverHit([desk])).toBe(desk);
  });

  it("returns null for empty", () => {
    expect(preferredDeskHoverHit([])).toBeNull();
  });
});
