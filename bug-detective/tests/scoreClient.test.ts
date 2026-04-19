import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_FETCH = globalThis.fetch;

describe("scoreClient runner board", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_LEADERBOARD_API", "https://leaderboard.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("posts endless runner scores with a separate puzzleId", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ rank: 3 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const { postScore } = await import("../src/api/scoreClient");

    // @ts-expect-error feature under test: second argument selects leaderboard
    await postScore(
      {
        date: "2026-04-19",
        score: 1234,
        cluesUsed: 0,
        elapsedMs: 42000,
        name: "runner",
      },
      "bug-detective-runner-v1",
    );

    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"),
    ) as {
      puzzleId?: string;
    };
    expect(body.puzzleId).toBe("bug-detective-runner-v1");
  });

  it("fetches a separate endless runner leaderboard when requested", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ scores: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const { fetchLeaderboard } = await import("../src/api/scoreClient");

    // @ts-expect-error feature under test: second argument selects leaderboard
    await fetchLeaderboard("2026-04-19", "bug-detective-runner-v1");

    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("puzzleId=bug-detective-runner-v1");
  });
});
