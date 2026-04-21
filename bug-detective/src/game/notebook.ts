export type NotebookSlot = "runner" | "sentence" | "errand" | "tamper";

export interface NotebookPage {
  readonly clueToken: string;
  /** 0..1000 */
  readonly gameScore: number;
  readonly solvedAtMs: number;
}

export type NotebookState = Partial<Record<NotebookSlot, NotebookPage>>;
