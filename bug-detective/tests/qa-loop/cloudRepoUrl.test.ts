import { describe, expect, it } from "vitest";
import { normalizeGitRemoteToHttpsUrl } from "../../qa-loop/cloudRepoUrl.js";

describe("normalizeGitRemoteToHttpsUrl", () => {
  it("maps git@github.com to https", () => {
    expect(
      normalizeGitRemoteToHttpsUrl("git@github.com:casper7995/cursor-crew.git"),
    ).toBe("https://github.com/casper7995/cursor-crew");
  });

  it("strips .git from https", () => {
    expect(
      normalizeGitRemoteToHttpsUrl(
        "https://github.com/casper7995/cursor-crew.git",
      ),
    ).toBe("https://github.com/casper7995/cursor-crew");
  });

  it("handles ssh:// form", () => {
    expect(
      normalizeGitRemoteToHttpsUrl(
        "ssh://git@github.com/casper7995/cursor-crew.git",
      ),
    ).toBe("https://github.com/casper7995/cursor-crew");
  });
});
