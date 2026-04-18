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
