/**
 * Bug Detective leaderboard + daily seed worker.
 *
 * Forked from shooting-game/worker/index.ts. Differences:
 *  - KV binding name: BUG_LB (was LB)
 *  - Key prefix: bd:<date>:<puzzleId> (was lb:<date>:<character>)
 *  - puzzleId replaces character (default = "bug-detective-v1")
 *  - Score payload adds `cluesUsed` and `elapsedMs` for tiebreakers
 *  - Sort order: score desc, cluesUsed asc, elapsedMs asc, ts asc
 *
 * Endpoints:
 *  GET  /seed?date=YYYY-MM-DD          → { date, seed }
 *  GET  /leaderboard?date=&puzzleId=   → { date, puzzleId, scores: [...] }
 *  POST /score                          → { rank }
 *  OPTIONS *                            → CORS preflight
 */

export interface Env {
  BUG_LB: KVNamespace;
}

const PUZZLE_ID = "bug-detective-v1";
const MAX_SCORE = 1_000_000;
const TOP_N = 100;
const STORE_LIMIT = 500;

interface ScoreEntry {
  score: number;
  cluesUsed: number;
  elapsedMs: number;
  name: string;
  ts: number;
}

function dailyKey(date: string, puzzleId: string): string {
  return `bd:${date}:${puzzleId}`;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** FNV-1a → uint32. Identical to shooting-game's daily seed for consistency. */
function dailySeed(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sortScores(a: ScoreEntry, b: ScoreEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.cluesUsed !== b.cluesUsed) return a.cluesUsed - b.cluesUsed;
  if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
  return a.ts - b.ts;
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/seed" && req.method === "GET") {
      const date = url.searchParams.get("date") ?? todayUtc();
      return Response.json(
        { date, seed: dailySeed(date) },
        { headers: corsHeaders },
      );
    }

    if (url.pathname === "/leaderboard" && req.method === "GET") {
      const date = url.searchParams.get("date") ?? todayUtc();
      const puzzleId = url.searchParams.get("puzzleId") ?? PUZZLE_ID;
      // KV binding may be missing in misconfigured deploys — degrade
      // gracefully to an empty list so the client doesn't see a 500.
      let list: ScoreEntry[] = [];
      try {
        const raw = await env.BUG_LB.get(dailyKey(date, puzzleId));
        if (raw) list = JSON.parse(raw) as ScoreEntry[];
      } catch {
        list = [];
      }
      return Response.json(
        { date, puzzleId, scores: list.slice(0, TOP_N) },
        { headers: corsHeaders },
      );
    }

    if (url.pathname === "/score" && req.method === "POST") {
      let body: {
        date?: unknown;
        puzzleId?: unknown;
        score?: unknown;
        cluesUsed?: unknown;
        elapsedMs?: unknown;
        name?: unknown;
      };
      try {
        body = (await req.json()) as typeof body;
      } catch {
        return new Response("invalid json", {
          status: 400,
          headers: corsHeaders,
        });
      }

      const date = typeof body.date === "string" ? body.date : todayUtc();
      const puzzleId =
        typeof body.puzzleId === "string" ? body.puzzleId : PUZZLE_ID;
      const score = Number(body.score);
      const cluesUsed = Number(body.cluesUsed);
      const elapsedMs = Number(body.elapsedMs);
      const rawName = typeof body.name === "string" ? body.name : "anon";

      if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
        return new Response("invalid score", {
          status: 400,
          headers: corsHeaders,
        });
      }
      if (!Number.isFinite(cluesUsed) || cluesUsed < 0 || cluesUsed > 200) {
        return new Response("invalid cluesUsed", {
          status: 400,
          headers: corsHeaders,
        });
      }
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 600_000) {
        return new Response("invalid elapsedMs", {
          status: 400,
          headers: corsHeaders,
        });
      }

      const k = dailyKey(date, puzzleId);
      // KV binding may be missing in misconfigured deploys — return a
      // 503 so the client knows the score wasn't persisted but doesn't
      // see an unhandled 500.
      let list: ScoreEntry[] = [];
      try {
        const raw = await env.BUG_LB.get(k);
        if (raw) list = JSON.parse(raw) as ScoreEntry[];
      } catch {
        return new Response("leaderboard storage unavailable", {
          status: 503,
          headers: corsHeaders,
        });
      }
      const entry: ScoreEntry = {
        score: Math.floor(score),
        cluesUsed: Math.floor(cluesUsed),
        elapsedMs: Math.floor(elapsedMs),
        name: rawName.slice(0, 16) || "anon",
        ts: Date.now(),
      };
      list.push(entry);
      list.sort(sortScores);
      const trimmed = list.slice(0, STORE_LIMIT);
      try {
        await env.BUG_LB.put(k, JSON.stringify(trimmed));
      } catch {
        return new Response("leaderboard storage unavailable", {
          status: 503,
          headers: corsHeaders,
        });
      }
      const rank = trimmed.findIndex((s) => s.ts === entry.ts) + 1;
      return Response.json({ rank }, { headers: corsHeaders });
    }

    return new Response("not found", { status: 404, headers: corsHeaders });
  },
};
