import { computeScore, type GameScoreBreakdown } from "./score";
import type { NotebookPage, NotebookSlot, NotebookState } from "./notebook";

export type { NotebookPage, NotebookSlot, NotebookState } from "./notebook";

export type RunnerMode = "daily" | "endless";

function notebookComplete(nb: NotebookState): boolean {
  return (
    nb.runner !== undefined &&
    nb.sentence !== undefined &&
    nb.errand !== undefined &&
    nb.tamper !== undefined
  );
}

export type Phase =
  | { kind: "intro" }
  | {
      kind: "investigating";
      startedAt: number;
      notebook: NotebookState;
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
      notebook: NotebookState;
      investigatingStartedAt: number;
      monitorDailyClear: boolean;
    }
  | {
      kind: "answering";
      startedAt: number;
      notebook: NotebookState;
      elapsedMs: number;
      monitorDailyClear: boolean;
    }
  | {
      kind: "results";
      correct: boolean;
      score: number;
      notebook: NotebookState;
      elapsedMs: number;
      breakdown: GameScoreBreakdown;
      monitorDailyClear: boolean;
    };

export class GameState {
  phase: Phase = { kind: "intro" };

  enterInvestigating(now: number): void {
    this.phase = {
      kind: "investigating",
      startedAt: now,
      notebook: {},
      monitorDailyClear: false,
    };
  }

  /** Pin or replace a notebook page while investigating or in runner pre-return. */
  pinNotebookPage(slot: NotebookSlot, page: NotebookPage): void {
    if (this.phase.kind === "investigating") {
      this.phase = {
        ...this.phase,
        notebook: { ...this.phase.notebook, [slot]: page },
      };
    } else if (this.phase.kind === "runner") {
      this.phase = {
        ...this.phase,
        notebook: { ...this.phase.notebook, [slot]: page },
      };
    }
  }

  enterRunner(now: number, mode: RunnerMode): boolean {
    if (this.phase.kind !== "investigating") return false;
    const p = this.phase;
    if (mode === "endless" && !p.monitorDailyClear) return false;
    this.phase = {
      kind: "runner",
      mode,
      startedAt: now,
      notebook: p.notebook,
      investigatingStartedAt: p.startedAt,
      monitorDailyClear: p.monitorDailyClear,
    };
    return true;
  }

  returnToInvestigatingFromRunner(updates: {
    monitorDailyClear?: boolean;
  }): Extract<Phase, { kind: "investigating" }> | null {
    if (this.phase.kind !== "runner") return null;
    const p = this.phase;
    const monitorDailyClear = updates.monitorDailyClear ?? p.monitorDailyClear;
    const nextPhase: Extract<Phase, { kind: "investigating" }> = {
      kind: "investigating",
      startedAt: p.investigatingStartedAt,
      notebook: p.notebook,
      monitorDailyClear,
    };
    this.phase = nextPhase;
    return nextPhase;
  }

  /** Opens the answer panel — only when all four evidence pages are pinned. */
  enterAnswering(now: number): boolean {
    if (this.phase.kind !== "investigating") return false;
    if (!notebookComplete(this.phase.notebook)) return false;
    const inv = this.phase;
    const elapsedMs = Math.max(0, now - inv.startedAt);
    this.phase = {
      kind: "answering",
      startedAt: inv.startedAt,
      notebook: inv.notebook,
      elapsedMs,
      monitorDailyClear: inv.monitorDailyClear,
    };
    return true;
  }

  /** Player picked a choice. Compute score and transition to results. */
  submit(choiceIndex: number, correctIndex: number): void {
    if (this.phase.kind !== "answering") return;
    const ans = this.phase;
    const correct = choiceIndex === correctIndex;
    const { score, breakdown } = computeScore({
      correct,
      elapsedMs: ans.elapsedMs,
      notebook: ans.notebook,
    });
    this.phase = {
      kind: "results",
      correct,
      score,
      notebook: ans.notebook,
      elapsedMs: ans.elapsedMs,
      breakdown,
      monitorDailyClear: ans.monitorDailyClear,
    };
  }

  /** Leave results overlay and keep the same case + notebook (replay minis). */
  resumeInvestigatingFromResults(now: number): boolean {
    if (this.phase.kind !== "results") return false;
    const p = this.phase;
    this.phase = {
      kind: "investigating",
      startedAt: now,
      notebook: p.notebook,
      monitorDailyClear: p.monitorDailyClear,
    };
    return true;
  }

  restart(): void {
    this.phase = { kind: "intro" };
  }
}

/** Helper for exhaustive switches on Phase.kind. */
export function assertNever(x: never): never {
  throw new Error(`unexpected phase: ${JSON.stringify(x)}`);
}
