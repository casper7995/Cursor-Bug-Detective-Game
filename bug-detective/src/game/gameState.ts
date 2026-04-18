import { computeScore } from "./score";
import { ROUND_DURATION_MS } from "./timer";

export type Phase =
  | { kind: "intro" }
  | { kind: "investigating"; startedAt: number; cluesUsed: number }
  | {
      kind: "answering";
      startedAt: number;
      cluesUsed: number;
      elapsedMs: number;
    }
  | {
      kind: "results";
      correct: boolean;
      score: number;
      cluesUsed: number;
      elapsedMs: number;
    };

export class GameState {
  phase: Phase = { kind: "intro" };

  enterInvestigating(now: number): void {
    this.phase = { kind: "investigating", startedAt: now, cluesUsed: 0 };
  }

  /** Bump clue counter while investigating. No-op in other phases. */
  bumpClue(): void {
    if (this.phase.kind === "investigating") {
      this.phase = { ...this.phase, cluesUsed: this.phase.cluesUsed + 1 };
    }
  }

  /** Force-end investigation. The HUD calls this when timer expires or user submits. */
  enterAnswering(now: number): void {
    if (this.phase.kind !== "investigating") return;
    const elapsedMs = Math.min(ROUND_DURATION_MS, now - this.phase.startedAt);
    this.phase = {
      kind: "answering",
      startedAt: this.phase.startedAt,
      cluesUsed: this.phase.cluesUsed,
      elapsedMs,
    };
  }

  /** Player picked a choice. Compute score and transition to results. */
  submit(choiceIndex: number, correctIndex: number): void {
    if (this.phase.kind !== "answering") return;
    const correct = choiceIndex === correctIndex;
    const score = computeScore({
      correct,
      elapsedMs: this.phase.elapsedMs,
      cluesUsed: this.phase.cluesUsed,
    });
    this.phase = {
      kind: "results",
      correct,
      score,
      cluesUsed: this.phase.cluesUsed,
      elapsedMs: this.phase.elapsedMs,
    };
  }

  restart(): void {
    this.phase = { kind: "intro" };
  }
}

/** Helper for exhaustive switches on Phase.kind. */
export function assertNever(x: never): never {
  throw new Error(`unexpected phase: ${JSON.stringify(x)}`);
}
