export interface Env {
  LB: KVNamespace;
}

const MAX_SCORE = 1_000_000;
const TOP_N = 100;

function dailyKey(date: string, character: string): string {
  return `lb:${date}:${character}`;
}

function todayUtc(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function dailySeed(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/seed" && req.method === "GET") {
      const date = url.searchParams.get("date") ?? todayUtc();
      return Response.json({ date, seed: dailySeed(date) }, { headers: cors });
    }

    if (url.pathname === "/leaderboard" && req.method === "GET") {
      const date = url.searchParams.get("date") ?? todayUtc();
      const character = url.searchParams.get("character") ?? "arrow";
      const raw = await env.LB.get(dailyKey(date, character));
      const list = raw ? (JSON.parse(raw) as unknown[]) : [];
      return Response.json(
        { date, character, scores: list.slice(0, TOP_N) },
        { headers: cors },
      );
    }

    if (url.pathname === "/score" && req.method === "POST") {
      const body = (await req.json()) as {
        date: string;
        character: string;
        score: number;
        combo: number;
        name: string;
      };
      if (typeof body.score !== "number" || body.score < 0 || body.score > MAX_SCORE) {
        return new Response("invalid score", { status: 400, headers: cors });
      }
      const k = dailyKey(body.date, body.character);
      const raw = await env.LB.get(k);
      const list: Array<{ score: number; combo: number; name: string; ts: number }> = raw
        ? (JSON.parse(raw) as typeof list)
        : [];
      list.push({
        score: body.score,
        combo: body.combo,
        name: (body.name || "anon").slice(0, 16),
        ts: Date.now(),
      });
      list.sort((a, b) => b.score - a.score);
      await env.LB.put(k, JSON.stringify(list.slice(0, 500)));
      const rank = list.findIndex((s) => s.score === body.score) + 1;
      return Response.json({ rank }, { headers: cors });
    }

    return new Response("not found", { status: 404, headers: cors });
  },
};
