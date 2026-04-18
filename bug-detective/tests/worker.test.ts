/**
 * Worker handler integration test using a minimal in-memory KV stub.
 *
 * The worker is forked from shooting-game/worker/index.ts so the smoke
 * tests focus on Bug Detective's specific differences:
 *   - puzzleId routing (default = "bug-detective-v1")
 *   - cluesUsed/elapsedMs validation (400 on out-of-range)
 *   - tiebreaker sort order: score desc, cluesUsed asc, elapsedMs asc, ts asc
 *   - dailySeed determinism + drift parity with the client's fallbackSeed
 */
import { beforeEach, describe, expect, it } from "vitest";
import worker, { type Env } from "../worker/index";
import { fallbackSeed } from "../src/api/seedClient";

class MemKv implements KVNamespace {
  private readonly store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  async list(): Promise<KVNamespaceListResult<unknown, string>> {
    throw new Error("not implemented");
  }
  async getWithMetadata(): Promise<never> {
    throw new Error("not implemented");
  }
}

function makeEnv(): Env {
  return { BUG_LB: new MemKv() as unknown as KVNamespace };
}

async function call(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return worker.fetch(new Request(`https://test${path}`, init), env);
}

describe("worker /seed", () => {
  it("returns FNV-1a daily seed identical to the client fallback", async () => {
    const env = makeEnv();
    const r = await call(env, "GET", "/seed?date=2026-04-18");
    const j = (await r.json()) as { date: string; seed: number };
    expect(j.date).toBe("2026-04-18");
    expect(j.seed).toBe(fallbackSeed("2026-04-18"));
  });

  it("uses today (UTC) when no date is provided", async () => {
    const env = makeEnv();
    const r = await call(env, "GET", "/seed");
    const j = (await r.json()) as { date: string; seed: number };
    expect(j.date).toBe(new Date().toISOString().slice(0, 10));
    expect(j.seed).toBe(fallbackSeed(j.date));
  });
});

describe("worker /score validation", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  const valid = {
    date: "2026-04-18",
    score: 700,
    cluesUsed: 1,
    elapsedMs: 35_000,
    name: "alice",
  };

  it("accepts a valid POST and returns rank 1 for the first entry", async () => {
    const r = await call(env, "POST", "/score", valid);
    expect(r.status).toBe(200);
    const j = (await r.json()) as { rank: number };
    expect(j.rank).toBe(1);
  });

  it("rejects negative scores", async () => {
    const r = await call(env, "POST", "/score", { ...valid, score: -1 });
    expect(r.status).toBe(400);
  });

  it("rejects scores above MAX_SCORE", async () => {
    const r = await call(env, "POST", "/score", { ...valid, score: 2_000_000 });
    expect(r.status).toBe(400);
  });

  it("rejects out-of-range cluesUsed", async () => {
    const r = await call(env, "POST", "/score", { ...valid, cluesUsed: 999 });
    expect(r.status).toBe(400);
  });

  it("rejects negative elapsedMs", async () => {
    const r = await call(env, "POST", "/score", { ...valid, elapsedMs: -1 });
    expect(r.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const r = await worker.fetch(
      new Request("https://test/score", {
        method: "POST",
        body: "not-json",
        headers: { "content-type": "application/json" },
      }),
      env,
    );
    expect(r.status).toBe(400);
  });
});

describe("worker /leaderboard tiebreakers", () => {
  it("orders by score desc, then cluesUsed asc, then elapsedMs asc", async () => {
    const env = makeEnv();
    const date = "2026-04-18";
    const entries = [
      { name: "B", score: 700, cluesUsed: 0, elapsedMs: 30_000 }, // 2
      { name: "A", score: 800, cluesUsed: 2, elapsedMs: 50_000 }, // 1 (highest score wins)
      { name: "C", score: 700, cluesUsed: 1, elapsedMs: 10_000 }, // 3 (more clues than B)
      { name: "D", score: 700, cluesUsed: 0, elapsedMs: 20_000 }, // 1.5 — tied score+clues w/ B, lower time
    ];
    for (const e of entries) {
      await call(env, "POST", "/score", { date, ...e });
    }
    const lb = (await (await call(env, "GET", `/leaderboard?date=${date}`)).json()) as {
      scores: Array<{ name: string; score: number }>;
    };
    expect(lb.scores.map((s) => s.name)).toEqual(["A", "D", "B", "C"]);
  });

  it("filters by puzzleId (default = bug-detective-v1)", async () => {
    const env = makeEnv();
    const date = "2026-04-18";
    await call(env, "POST", "/score", {
      date,
      score: 500,
      cluesUsed: 0,
      elapsedMs: 5000,
      name: "default",
    });
    await call(env, "POST", "/score", {
      date,
      puzzleId: "different-puzzle",
      score: 999,
      cluesUsed: 0,
      elapsedMs: 5000,
      name: "other",
    });
    const lb = (await (await call(env, "GET", `/leaderboard?date=${date}`)).json()) as {
      scores: Array<{ name: string }>;
    };
    expect(lb.scores.map((s) => s.name)).toEqual(["default"]);
  });
});

describe("worker CORS", () => {
  it("OPTIONS returns CORS preflight headers", async () => {
    const env = makeEnv();
    const r = await call(env, "OPTIONS", "/score");
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("access-control-allow-methods")).toContain("POST");
  });
});

describe("worker 404", () => {
  it("returns 404 for unknown paths", async () => {
    const env = makeEnv();
    const r = await call(env, "GET", "/nope");
    expect(r.status).toBe(404);
  });
});

/**
 * Simulates a misconfigured deploy where the KV binding is present but
 * its operations throw (e.g. account quota exceeded, namespace deleted).
 * The worker should NOT propagate as a 500 — leaderboard returns empty,
 * score returns 503 so the client can show a "saved offline" message.
 */
class ThrowingKv implements KVNamespace {
  async get(): Promise<string | null> {
    throw new Error("simulated KV outage");
  }
  async put(): Promise<void> {
    throw new Error("simulated KV outage");
  }
  async delete(): Promise<void> {
    throw new Error("simulated KV outage");
  }
  async list(): Promise<KVNamespaceListResult<unknown, string>> {
    throw new Error("not implemented");
  }
  async getWithMetadata(): Promise<never> {
    throw new Error("not implemented");
  }
}

describe("worker graceful KV failure", () => {
  it("/leaderboard returns empty list when KV throws", async () => {
    const env: Env = {
      BUG_LB: new ThrowingKv() as unknown as KVNamespace,
    };
    const r = await call(env, "GET", "/leaderboard?date=2026-04-18");
    expect(r.status).toBe(200);
    const j = (await r.json()) as { scores: unknown[] };
    expect(j.scores).toEqual([]);
  });

  it("/score returns 503 when KV throws", async () => {
    const env: Env = {
      BUG_LB: new ThrowingKv() as unknown as KVNamespace,
    };
    const r = await call(env, "POST", "/score", {
      date: "2026-04-18",
      score: 500,
      cluesUsed: 0,
      elapsedMs: 10_000,
      name: "alice",
    });
    expect(r.status).toBe(503);
  });
});
