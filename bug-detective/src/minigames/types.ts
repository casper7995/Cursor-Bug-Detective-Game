/** Shared outcome from desk mini-games (runner uses RunnerRunOutcome). */
export interface MiniGameOutcome {
  readonly clueToken: string;
  /** 0..1000 — how cleanly the player solved it. */
  readonly score: number;
}
