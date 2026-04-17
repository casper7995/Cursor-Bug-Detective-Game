const API = import.meta.env.VITE_LEADERBOARD_API ?? "";

export function hasLeaderboardApi(): boolean {
  return Boolean(API && API.length > 1);
}

export async function fetchSeed(date: string): Promise<number> {
  if (!hasLeaderboardApi()) {
    return fallbackSeed(date);
  }
  try {
    const r = await fetch(`${API}/seed?date=${encodeURIComponent(date)}`);
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { seed: number };
    return j.seed;
  } catch {
    return fallbackSeed(date);
  }
}

function fallbackSeed(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function fetchLeaderboard(
  date: string,
  character: string,
): Promise<Array<{ score: number; combo: number; name: string }>> {
  if (!hasLeaderboardApi()) return [];
  const r = await fetch(
    `${API}/leaderboard?date=${encodeURIComponent(date)}&character=${encodeURIComponent(character)}`,
  );
  const j = (await r.json()) as {
    scores: Array<{ score: number; combo: number; name: string }>;
  };
  return j.scores ?? [];
}

export async function postScore(
  date: string,
  character: string,
  score: number,
  combo: number,
  name: string,
): Promise<{ rank: number } | null> {
  if (!hasLeaderboardApi()) return null;
  const r = await fetch(`${API}/score`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, character, score, combo, name }),
  });
  if (!r.ok) return null;
  return (await r.json()) as { rank: number };
}
