const API = import.meta.env.VITE_LEADERBOARD_API ?? "";

export function hasLeaderboardApi(): boolean {
  return Boolean(API && API.length > 1);
}

export async function fetchSeed(date: string): Promise<number> {
  if (!hasLeaderboardApi()) return fallbackSeed(date);
  try {
    const r = await fetch(`${API}/seed?date=${encodeURIComponent(date)}`);
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { seed: number };
    return j.seed;
  } catch {
    return fallbackSeed(date);
  }
}

/** FNV-1a hash → uint32 seed. Identical to the worker's dailySeed(). */
export function fallbackSeed(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry-32-flavored PRNG seeded from a uint32 (matches shooting-game). */
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

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function tomorrowUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
