const API = import.meta.env.VITE_LEADERBOARD_API ?? "";
const PUZZLE_ID = "bug-detective-v1";

export function hasLeaderboardApi(): boolean {
  return Boolean(API && API.length > 1);
}

export interface LeaderboardEntry {
  score: number;
  cluesUsed: number;
  elapsedMs: number;
  name: string;
  ts?: number;
}

export interface ScoreSubmission {
  date: string;
  score: number;
  cluesUsed: number;
  elapsedMs: number;
  name: string;
}

export async function fetchLeaderboard(date: string): Promise<LeaderboardEntry[]> {
  if (!hasLeaderboardApi()) return [];
  try {
    const r = await fetch(
      `${API}/leaderboard?date=${encodeURIComponent(date)}&puzzleId=${encodeURIComponent(PUZZLE_ID)}`,
    );
    if (!r.ok) return [];
    const j = (await r.json()) as { scores?: LeaderboardEntry[] };
    return j.scores ?? [];
  } catch {
    return [];
  }
}

export async function postScore(
  s: ScoreSubmission,
): Promise<{ rank: number } | null> {
  if (!hasLeaderboardApi()) return null;
  try {
    const r = await fetch(`${API}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: s.date,
        puzzleId: PUZZLE_ID,
        score: s.score,
        cluesUsed: s.cluesUsed,
        elapsedMs: s.elapsedMs,
        name: s.name,
      }),
    });
    if (!r.ok) return null;
    return (await r.json()) as { rank: number };
  } catch {
    return null;
  }
}
