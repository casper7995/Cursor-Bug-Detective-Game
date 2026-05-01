import { describe, it, expect } from "vitest";
import {
  buildExitUrl,
  buildReturnUrl,
  parsePortalParams,
  normalizeRefHost,
  BUG_DETECTIVE_REF,
} from "../src/scene/portal";

describe("parsePortalParams", () => {
  it("flags arrivedViaPortal only when portal=true", () => {
    expect(parsePortalParams("").arrivedViaPortal).toBe(false);
    expect(parsePortalParams("portal=true").arrivedViaPortal).toBe(true);
    expect(parsePortalParams("portal=false").arrivedViaPortal).toBe(false);
    expect(parsePortalParams("portal=1").arrivedViaPortal).toBe(false);
  });

  it("forwards known keys verbatim", () => {
    const { stored } = parsePortalParams(
      "portal=true&username=levelsio&color=red&speed=4.5&ref=fly.pieter.com",
    );
    expect(stored).toEqual({
      username: "levelsio",
      color: "red",
      speed: "4.5",
      ref: "fly.pieter.com",
    });
  });

  it("drops blank values", () => {
    const { stored } = parsePortalParams("username=&color=blue");
    expect(stored).toEqual({ color: "blue" });
  });

  it("drops non-numeric speed and out-of-range hp", () => {
    const { stored } = parsePortalParams(
      "speed=fast&speed_x=2.1&hp=200&hp=&username=ok",
    );
    expect(stored.speed).toBeUndefined();
    expect(stored.hp).toBeUndefined();
    expect(stored.speed_x).toBe("2.1");
    expect(stored.username).toBe("ok");
  });

  it("ignores unknown keys", () => {
    const { stored } = parsePortalParams("malicious=<script>&username=ok");
    expect(stored).toEqual({ username: "ok" });
  });
});

describe("normalizeRefHost", () => {
  it("strips protocols and trailing slashes", () => {
    expect(normalizeRefHost("https://fly.pieter.com")).toBe("fly.pieter.com");
    expect(normalizeRefHost("http://example.com/")).toBe("example.com");
    expect(normalizeRefHost("  example.com//  ")).toBe("example.com");
  });

  it("returns empty string for blank input", () => {
    expect(normalizeRefHost("")).toBe("");
    expect(normalizeRefHost("   ")).toBe("");
  });
});

describe("buildExitUrl", () => {
  it("uses BUG_DETECTIVE_REF as default ref when stored is empty", () => {
    const url = buildExitUrl({});
    expect(url).toContain("vibejam.cc/portal/2026");
    expect(url).toContain(`ref=${BUG_DETECTIVE_REF}`);
    // No other params except ref.
    const query = new URL(url).searchParams;
    expect([...query.keys()]).toEqual(["ref"]);
  });

  it("forwards all stored params plus our own ref", () => {
    const stored = {
      username: "levelsio",
      color: "red",
      speed: "4.5",
      avatar_url: "https://x.com/y.png",
      team: "purple",
      hp: "75",
      ref: "fly.pieter.com", // should be overwritten by our ref
    };
    const url = buildExitUrl(stored);
    const q = new URL(url).searchParams;
    expect(q.get("username")).toBe("levelsio");
    expect(q.get("color")).toBe("red");
    expect(q.get("speed")).toBe("4.5");
    expect(q.get("avatar_url")).toBe("https://x.com/y.png");
    expect(q.get("team")).toBe("purple");
    expect(q.get("hp")).toBe("75");
    expect(q.get("ref")).toBe(BUG_DETECTIVE_REF); // never the inbound ref
  });

  it("accepts a custom refHost override", () => {
    const url = buildExitUrl({}, "https://example.com/");
    expect(new URL(url).searchParams.get("ref")).toBe("example.com");
  });
});

describe("buildReturnUrl", () => {
  it("returns null when refHost is missing or blank", () => {
    expect(buildReturnUrl("", {})).toBeNull();
    expect(buildReturnUrl("   ", {})).toBeNull();
  });

  it("includes only portal=true when no other params stored", () => {
    const url = buildReturnUrl("fly.pieter.com", {});
    expect(url).not.toBeNull();
    const u = new URL(url!);
    expect(u.host).toBe("fly.pieter.com");
    expect(u.searchParams.get("portal")).toBe("true");
    expect([...u.searchParams.keys()].sort()).toEqual(["portal"]);
  });

  it("forwards all stored params except ref", () => {
    const url = buildReturnUrl("fly.pieter.com", {
      username: "levelsio",
      color: "red",
      speed: "4.5",
      ref: "should-not-appear",
    });
    expect(url).not.toBeNull();
    const q = new URL(url!).searchParams;
    expect(q.get("portal")).toBe("true");
    expect(q.get("username")).toBe("levelsio");
    expect(q.get("color")).toBe("red");
    expect(q.get("speed")).toBe("4.5");
    expect(q.get("ref")).toBeNull();
  });

  it("strips a protocol prefix on refHost", () => {
    const url = buildReturnUrl("https://fly.pieter.com/", {});
    expect(url).not.toBeNull();
    expect(new URL(url!).host).toBe("fly.pieter.com");
  });
});

describe("portal URL roundtrip — bad input does not throw", () => {
  it("handles non-numeric speed gracefully on both builders", () => {
    const { stored } = parsePortalParams("portal=true&speed=fast&username=x");
    expect(() => buildExitUrl(stored)).not.toThrow();
    expect(() => buildReturnUrl("fly.pieter.com", stored)).not.toThrow();
    const exit = buildExitUrl(stored);
    expect(new URL(exit).searchParams.get("speed")).toBeNull();
    expect(new URL(exit).searchParams.get("username")).toBe("x");
  });

  it("handles out-of-range hp gracefully", () => {
    const { stored } = parsePortalParams("portal=true&hp=999&team=red");
    const exit = buildExitUrl(stored);
    expect(new URL(exit).searchParams.get("hp")).toBeNull();
    expect(new URL(exit).searchParams.get("team")).toBe("red");
  });
});
