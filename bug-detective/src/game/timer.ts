export const ROUND_DURATION_MS = 90_000;

export interface Timer {
  elapsedMs(now: number): number;
  remainingMs(now: number): number;
  isExpired(now: number): boolean;
}

export function createTimer(startedAt: number): Timer {
  return {
    elapsedMs(now) {
      return Math.max(0, now - startedAt);
    },
    remainingMs(now) {
      return Math.max(0, ROUND_DURATION_MS - (now - startedAt));
    },
    isExpired(now) {
      return now - startedAt >= ROUND_DURATION_MS;
    },
  };
}

/**
 * Format a millisecond duration as `M:SS.s`. Used by the HUD timer,
 * results panel, share card, and leaderboard so they all read the same
 * way. Negative or sub-second values clamp to zero.
 */
export function formatTime(ms: number): string {
  const sec = Math.max(0, ms / 1000);
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}
