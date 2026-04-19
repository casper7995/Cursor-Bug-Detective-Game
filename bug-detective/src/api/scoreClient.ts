const API = import.meta.env.VITE_LEADERBOARD_API ?? "";
export const DAILY_PUZZLE_ID = "bug-detective-v1";
export const RUNNER_PUZZLE_ID = "bug-detective-runner-v1";

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

export async function fetchLeaderboard(
  date: string,
  puzzleId = DAILY_PUZZLE_ID,
): Promise<LeaderboardEntry[]> {
  if (!hasLeaderboardApi()) return [];
  try {
    const r = await fetch(
      `${API}/leaderboard?date=${encodeURIComponent(date)}&puzzleId=${encodeURIComponent(puzzleId)}`,
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
  puzzleId = DAILY_PUZZLE_ID,
): Promise<{ rank: number } | null> {
  if (!hasLeaderboardApi()) return null;
  try {
    const r = await fetch(`${API}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: s.date,
        puzzleId,
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
