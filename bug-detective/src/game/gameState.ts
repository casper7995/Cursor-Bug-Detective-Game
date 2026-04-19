import { computeScore } from "./score";
import { ROUND_DURATION_MS } from "./timer";

export type RunnerMode = "daily" | "endless";

export type Phase =
  | { kind: "intro" }
  | {
      kind: "investigating";
      startedAt: number;
      cluesUsed: number;
      /**
       * After the player clears the daily monitor run once, endless mode
       * unlocks and this flag stays true for the rest of the round.
       */
      monitorDailyClear: boolean;
    }
  | {
      kind: "runner";
      mode: RunnerMode;
      startedAt: number;
      cluesUsed: number;
      investigatingStartedAt: number;
      monitorDailyClear: boolean;
    }
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
    this.phase = {
      kind: "investigating",
      startedAt: now,
      cluesUsed: 0,
      monitorDailyClear: false,
    };
  }

  /** Bump clue counter while investigating. No-op in other phases. */
  bumpClue(): void {
    if (this.phase.kind === "investigating") {
      this.phase = { ...this.phase, cluesUsed: this.phase.cluesUsed + 1 };
    }
  }

  enterRunner(now: number, mode: RunnerMode): boolean {
    if (this.phase.kind !== "investigating") return false;
    const p = this.phase;
    if (mode === "daily" && p.monitorDailyClear) return false;
    if (mode === "endless" && !p.monitorDailyClear) return false;
    this.phase = {
      kind: "runner",
      mode,
      startedAt: now,
      cluesUsed: p.cluesUsed,
      investigatingStartedAt: p.startedAt,
      monitorDailyClear: p.monitorDailyClear,
    };
    return true;
  }

  returnToInvestigatingFromRunner(updates: {
    monitorDailyClear?: boolean;
    cluesIncrement?: boolean;
  }): Extract<Phase, { kind: "investigating" }> | null {
    if (this.phase.kind !== "runner") return null;
    const p = this.phase;
    const monitorDailyClear = updates.monitorDailyClear ?? p.monitorDailyClear;
    const nextPhase: Extract<Phase, { kind: "investigating" }> = {
      kind: "investigating",
      startedAt: p.investigatingStartedAt,
      cluesUsed: p.cluesUsed + (updates.cluesIncrement ? 1 : 0),
      monitorDailyClear,
    };
    this.phase = nextPhase;
    return nextPhase;
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
