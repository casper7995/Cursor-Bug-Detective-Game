/** Monitor code-runner minigame: shared contracts (hub ↔ session). */

export type { RunnerMode } from "../../game/gameState";

/** Result reported when a run ends (win or lose). */
export type RunnerRunOutcome =
  | { kind: "daily_fail" }
  | { kind: "endless_stop"; score: number };
