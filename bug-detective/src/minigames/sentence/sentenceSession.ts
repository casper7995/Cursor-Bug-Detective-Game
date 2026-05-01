/** Finish the Sentence — desk mini, restyled as Cursor's Tab autocomplete. */

import type { MiniGameOutcome } from "../types";
import { CURSOR_AI } from "../../ui/cursorAiTheme";
import { RUNNER_DRAW } from "../runner/sim";
import {
  clientToDeskGame,
  DESK_SCRIM,
  drawDeskChromeAi,
  getDeskFullRect,
  hitDeskCloseButton,
} from "../desk/deskLayout";
import { hitDeskHelpButton, TutorialGate } from "../desk/tutorialGate";
import { makeSeededRng } from "../../api/seedClient";
import type { AnomalyId } from "../../scene/anomalies";
import { pickTemplate } from "./templates";
import {
  injectName,
  scoreSentenceRun,
  outcomeStrength,
  type SentenceResult,
} from "./scoring";
import {
  assembleParagraph,
  drawEditorScene,
  drawIntroCard,
  drawSentenceTutorialDiagram,
  drawShareCard,
  drawSuggestionPopover,
  getSuggestionRowRects,
  type SuggestionRowRect,
  inSuggestionRect,
  SENTENCE_LAYOUT,
} from "./draw";
import {
  pickTimeoutForSlot,
  type PickColor,
  type PlayerPick,
  type SentenceTemplate,
  SENTENCE_SLOTS_PER_TEMPLATE,
} from "./types";
import { clueTokenForSentence } from "./clueTokens";
import {
  sfxSentencePick,
  sfxSentencePickHover,
  sfxSentenceSuggestionOpen,
  sfxSentenceTypeTick,
} from "../../audio/audio";

const W = RUNNER_DRAW.canvasW;
const H = RUNNER_DRAW.canvasH;

const INTRO_DURATION_S = 0.95;
const TYPE_PER_SENTENCE_S = 1.15;
/** Brief post-pick flash so the commit feels weighty (S-14). */
const REVEAL_FLASH_S = 0.28;
/**
 * Generous hold so the player can read the full 8-sentence paragraph; the
 * pointerdown handler advances earlier on click. Reviewer iter-4 flagged
 * the previous 3.4s as "too fast for an 8-line paragraph".
 */
const RESULT_AUTOCLOSE_S = 12;

export interface SentenceSessionOpts {
  readonly overlayCtx: CanvasRenderingContext2D;
  readonly getOverlayViewport: () => { cssW: number; cssH: number };
  readonly clueWord: string;
  readonly anomalyId: AnomalyId;
  readonly onExit: () => void;
}

type Phase =
  | { kind: "intro"; t: number }
  | { kind: "type"; sentenceIdx: number; t: number }
  | {
      kind: "pick";
      sentenceIdx: number;
      t: number;
      selectedRowIndex: number;
    }
  | {
      /**
       * Brief post-pick flash showing which row was committed. S-14.
       */
      kind: "reveal";
      sentenceIdx: number;
      t: number;
      pickedColor: PickColor | "idle";
    }
  | { kind: "result"; t: number };

function namespacedSeed(base: number, label: string): number {
  let h = base >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function readPlayerName(): string | null {
  try {
    const v = localStorage.getItem("bd:name");
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export class SentenceSession {
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly getOverlayViewport: () => { cssW: number; cssH: number };
  private readonly onExit: () => void;
  private readonly renderCtx: CanvasRenderingContext2D;
  private readonly clueWord: string;
  private readonly templateSeed: number;
  private readonly template: SentenceTemplate;
  private readonly playerName: string | null;
  private readonly resolvedPrefixes: string[];
  private readonly picks: PlayerPick[] = [];
  private phase: Phase = { kind: "intro", t: 0 };
  private outcome: MiniGameOutcome | null = null;
  /** Filled when entering the result phase; avoids re-scoring every frame. */
  private resultScreen: {
    result: SentenceResult;
    finalParagraph: string;
  } | null = null;
  private pointerBound = false;
  private lastTypewriterTick = -1;
  private lastPickRow = -1;
  private readonly gate = new TutorialGate({
    title: "Tab cycles · Enter accepts · read the clue",
    tagline:
      "The case-correct line is not always the top row — look before you pick.",
    howToLines: [
      "Tab moves the highlight. Enter locks in that row (not “always blue”).",
      "1 / 2 / 3 or a click choose that visible row, top to bottom.",
      "Wait 3s idle and the typewriter picks the orange line for you.",
    ],
    drawDiagram: drawSentenceTutorialDiagram,
    storageKey: "bd:miniTutorial:sentence",
  });

  constructor(opts: SentenceSessionOpts) {
    this.overlayCtx = opts.overlayCtx;
    this.getOverlayViewport = opts.getOverlayViewport;
    this.onExit = opts.onExit;
    this.clueWord = opts.clueWord;
    const seed = namespacedSeed(0xb1c2d3e4, `sentence:${opts.clueWord}`);
    this.templateSeed = seed;
    this.template = pickTemplate(seed, opts.anomalyId);
    this.playerName = readPlayerName();
    this.resolvedPrefixes = this.template.slots.map((s) => s.prefix);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2d");
    this.renderCtx = ctx;
  }

  private gameFromClient(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    return clientToDeskGame(
      clientX,
      clientY,
      this.overlayCtx,
      this.getOverlayViewport,
    );
  }

  attachPointer(root: HTMLElement): void {
    if (this.pointerBound) return;
    this.pointerBound = true;
    const routeTutorialPointer = (
      clientX: number,
      clientY: number,
    ): boolean => {
      if (!this.gate.isBlocking()) return false;
      const p = this.gameFromClient(clientX, clientY);
      return this.gate.handlePointer(p.x, p.y, W, H) !== null;
    };
    const move = (e: PointerEvent): void => {
      const p = this.gameFromClient(e.clientX, e.clientY);
      if (this.phase.kind !== "pick") return;
      const slot = this.template.slots[this.phase.sentenceIdx];
      if (!slot) return;
      const rows = this.rowsForSlot(this.phase.sentenceIdx);
      const hit = inSuggestionRect(rows, p.x, p.y);
      if (!hit) return;
      const nextRow = hit.index;
      if (nextRow !== this.lastPickRow) {
        sfxSentencePickHover();
      }
      this.lastPickRow = nextRow;
      this.phase.selectedRowIndex = nextRow;
    };
    const down = (e: PointerEvent): void => {
      const p = this.gameFromClient(e.clientX, e.clientY);
      if (this.outcome) return;
      if (hitDeskCloseButton(p.x, p.y)) {
        this.onExit();
        return;
      }
      if (hitDeskHelpButton(p.x, p.y, W)) {
        this.gate.reopen();
        return;
      }
      if (this.gate.isBlocking()) {
        this.gate.handlePointer(p.x, p.y, W, H);
        return;
      }
      if (this.phase.kind === "result") {
        this.finalizeOutcome();
        return;
      }
      if (this.phase.kind === "pick") {
        const slot = this.template.slots[this.phase.sentenceIdx];
        if (!slot) return;
        const rows = this.rowsForSlot(this.phase.sentenceIdx);
        const hit = inSuggestionRect(rows, p.x, p.y);
        if (hit) this.commitPick(hit.color);
      }
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerdown", down);
    const onDocPointerDown = (e: PointerEvent): void => {
      if (!routeTutorialPointer(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onDocMouseDown = (e: MouseEvent): void => {
      if (!routeTutorialPointer(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onDocClick = (e: MouseEvent): void => {
      if (!routeTutorialPointer(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onDocTouchStart = (e: TouchEvent): void => {
      const t = e.changedTouches[0] ?? e.touches[0];
      if (!t) return;
      if (!routeTutorialPointer(t.clientX, t.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        if (this.gate.isBlocking()) {
          this.gate.dismissFromKey();
          return;
        }
        this.onExit();
        return;
      }
      if (this.gate.isBlocking() || this.outcome) return;
      if (this.phase.kind !== "pick") return;
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        this.cycleSelectedRow();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        this.commitSelectedRow();
        return;
      }
      if (e.key === "1" || e.code === "Digit1" || e.code === "Numpad1") {
        e.preventDefault();
        this.commitRow(0);
        return;
      }
      if (e.key === "2" || e.code === "Digit2" || e.code === "Numpad2") {
        e.preventDefault();
        this.commitRow(1);
        return;
      }
      if (e.key === "3" || e.code === "Digit3" || e.code === "Numpad3") {
        e.preventDefault();
        this.commitRow(2);
        return;
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("mousedown", onDocMouseDown, true);
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("touchstart", onDocTouchStart, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keydown", key, true);
    (this as unknown as { _cleanup?: () => void })._cleanup = (): void => {
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("mousedown", onDocMouseDown, true);
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("touchstart", onDocTouchStart, true);
      window.removeEventListener("keydown", key, true);
    };
  }

  private commitPick(color: PickColor | "idle"): void {
    if (this.phase.kind !== "pick") return;
    sfxSentencePick(color);
    const sentenceIdx = this.phase.sentenceIdx;
    this.picks.push({ sentenceIdx, color });
    this.maybeInjectNameForNext();
    // S-14: enter the reveal flash before advancing. The step machine
    // tracks t and calls advanceAfterPick when the flash window expires.
    this.phase = { kind: "reveal", sentenceIdx, t: 0, pickedColor: color };
  }

  private rowsForSlot(sentenceIdx: number): readonly SuggestionRowRect[] {
    const slot = this.template.slots[sentenceIdx];
    if (!slot) return [];
    return getSuggestionRowRects(this.renderCtx, slot.options, slot.rowOrder);
  }

  private initialRowFocus(sentenceIdx: number): number {
    const h = namespacedSeed(this.templateSeed, `row-focus:${sentenceIdx}`);
    return Math.floor(makeSeededRng(h)() * 3);
  }

  private cycleSelectedRow(): void {
    if (this.phase.kind !== "pick") return;
    const rows = this.rowsForSlot(this.phase.sentenceIdx);
    if (rows.length === 0) return;
    this.phase.selectedRowIndex =
      (this.phase.selectedRowIndex + 1) % rows.length;
    this.lastPickRow = this.phase.selectedRowIndex;
    sfxSentencePickHover();
  }

  private commitSelectedRow(): void {
    if (this.phase.kind !== "pick") return;
    this.commitRow(this.phase.selectedRowIndex);
  }

  private commitRow(rowIndex: number): void {
    if (this.phase.kind !== "pick") return;
    const row = this.rowsForSlot(this.phase.sentenceIdx)[rowIndex];
    if (!row) return;
    this.commitPick(row.color);
  }

  private commitIdle(): void {
    if (this.phase.kind !== "pick") return;
    this.commitPick("idle");
  }

  private maybeInjectNameForNext(): void {
    let streak = 0;
    for (let i = this.picks.length - 1; i >= 0; i--) {
      if (this.picks[i]?.color === "blue") streak++;
      else break;
    }
    const nextIdx = this.picks.length;
    if (
      nextIdx < this.template.slots.length &&
      streak >= 3 &&
      this.playerName
    ) {
      const original = this.template.slots[nextIdx]?.prefix ?? "";
      this.resolvedPrefixes[nextIdx] = injectName(
        original,
        this.playerName,
        streak,
      );
    }
  }

  private advanceAfterPick(): void {
    const next = this.picks.length;
    if (next >= SENTENCE_SLOTS_PER_TEMPLATE) {
      this.resultScreen = {
        result: scoreSentenceRun(this.picks),
        finalParagraph: assembleParagraph(
          this.template.slots,
          this.picks,
          this.resolvedPrefixes,
        ),
      };
      this.phase = { kind: "result", t: 0 };
      return;
    }
    this.lastTypewriterTick = -1;
    this.phase = { kind: "type", sentenceIdx: next, t: 0 };
  }

  private finalizeOutcome(): void {
    if (this.outcome) return;
    const strength = outcomeStrength(this.picks);
    if (strength === "none") {
      this.onExit();
      return;
    }
    const result = scoreSentenceRun(this.picks);
    // S-3: partial runs (4-5 blues) still emit a clue but at half score so
    // good-but-not-perfect play is rewarded without diluting the full win.
    const score =
      strength === "partial" ? Math.floor(result.score / 2) : result.score;
    this.outcome = {
      clueToken: clueTokenForSentence(this.clueWord),
      score,
    };
  }

  step(dtSec: number): void {
    if (this.gate.isBlocking()) {
      this.draw();
      return;
    }
    switch (this.phase.kind) {
      case "intro": {
        this.phase = { kind: "intro", t: this.phase.t + dtSec };
        if (this.phase.t >= INTRO_DURATION_S) {
          this.lastTypewriterTick = -1;
          this.phase = { kind: "type", sentenceIdx: 0, t: 0 };
        }
        break;
      }
      case "type": {
        this.phase = {
          kind: "type",
          sentenceIdx: this.phase.sentenceIdx,
          t: this.phase.t + dtSec,
        };
        const tick = Math.floor(this.phase.t / 0.055);
        if (tick > this.lastTypewriterTick) {
          this.lastTypewriterTick = tick;
          sfxSentenceTypeTick();
        }
        if (this.phase.t >= TYPE_PER_SENTENCE_S) {
          this.lastTypewriterTick = -1;
          const si = this.phase.sentenceIdx;
          const focus = this.initialRowFocus(si);
          this.lastPickRow = focus;
          sfxSentenceSuggestionOpen();
          this.phase = {
            kind: "pick",
            sentenceIdx: si,
            t: 0,
            selectedRowIndex: focus,
          };
        }
        break;
      }
      case "pick": {
        this.phase = {
          kind: "pick",
          sentenceIdx: this.phase.sentenceIdx,
          t: this.phase.t + dtSec,
          selectedRowIndex: this.phase.selectedRowIndex,
        };
        if (this.phase.t >= pickTimeoutForSlot(this.phase.sentenceIdx))
          this.commitIdle();
        break;
      }
      case "reveal": {
        this.phase = {
          kind: "reveal",
          sentenceIdx: this.phase.sentenceIdx,
          t: this.phase.t + dtSec,
          pickedColor: this.phase.pickedColor,
        };
        if (this.phase.t >= REVEAL_FLASH_S) this.advanceAfterPick();
        break;
      }
      case "result": {
        this.phase = { kind: "result", t: this.phase.t + dtSec };
        if (this.phase.t >= RESULT_AUTOCLOSE_S) this.finalizeOutcome();
        break;
      }
      default: {
        const _: never = this.phase;
        void _;
      }
    }
    this.draw();
  }

  private currentSentenceIdx(): number {
    if (
      this.phase.kind === "type" ||
      this.phase.kind === "pick" ||
      this.phase.kind === "reveal"
    ) {
      return this.phase.sentenceIdx;
    }
    return this.picks.length;
  }

  private currentParagraph(): string {
    const idx = this.currentSentenceIdx();
    const completedParts: string[] = [];
    for (let i = 0; i < this.picks.length; i++) {
      const slot = this.template.slots[i];
      const pick = this.picks[i];
      if (!slot || !pick) continue;
      const prefix = this.resolvedPrefixes[i] ?? slot.prefix;
      let chosen = slot.options.orange;
      if (pick.color === "blue") chosen = slot.options.blue;
      else if (pick.color === "purple") chosen = slot.options.purple;
      completedParts.push(`${prefix}${chosen}${slot.suffix}`);
    }
    if (this.phase.kind === "type") {
      const typingProgress = Math.min(1, this.phase.t / TYPE_PER_SENTENCE_S);
      const slot = this.template.slots[idx];
      if (slot) {
        const prefix = this.resolvedPrefixes[idx] ?? slot.prefix;
        completedParts.push(
          prefix.slice(0, Math.floor(prefix.length * typingProgress)),
        );
      }
    } else if (this.phase.kind === "pick") {
      const slot = this.template.slots[idx];
      if (slot) {
        const prefix = this.resolvedPrefixes[idx] ?? slot.prefix;
        completedParts.push(prefix);
      }
    }
    return completedParts.join(" ");
  }

  private draw(): void {
    const ctx = this.renderCtx;
    const paragraph = this.currentParagraph();
    const showCaret = this.phase.kind === "type" || this.phase.kind === "pick";
    const showResult = this.phase.kind === "result";
    drawEditorScene(ctx, W, H, paragraph, 1, showCaret);

    // Title strip — hidden during the result share card so the card's
    // headline doesn't fight the chrome breadcrumb above it.
    // S-6/S-7: dropped the duplicate "Tab cycles · Enter accepts" line
    // (already shown inside the popover footer) and the hardcoded x=162
    // collision. Just `case_file.md` now.
    if (!showResult) {
      ctx.fillStyle = CURSOR_AI.inkSubtle;
      ctx.font = "11px 'Cursor Mono', ui-monospace, monospace";
      ctx.fillText("case_file.md", 18, 26);
    }

    if (this.phase.kind === "intro") {
      drawIntroCard(ctx, W, H, this.phase.t / INTRO_DURATION_S);
    } else if (this.phase.kind === "pick") {
      const slot = this.template.slots[this.phase.sentenceIdx];
      if (slot) {
        const rows = this.rowsForSlot(this.phase.sentenceIdx);
        const remain = Math.max(
          0,
          1 - this.phase.t / pickTimeoutForSlot(this.phase.sentenceIdx),
        );
        drawSuggestionPopover(ctx, rows, this.phase.selectedRowIndex, remain);
      }
    } else if (this.phase.kind === "reveal") {
      // S-14: show the popover with the committed row glowing in its
      // color for a brief flash, so the pick feels weighty before the
      // typewriter advances.
      const slot = this.template.slots[this.phase.sentenceIdx];
      if (slot) {
        const rows = this.rowsForSlot(this.phase.sentenceIdx);
        const flashT = Math.min(1, this.phase.t / REVEAL_FLASH_S);
        const pickedColor = this.phase.pickedColor;
        const pickedIdx =
          pickedColor === "idle"
            ? rows.findIndex((r) => r.color === "orange")
            : rows.findIndex((r) => r.color === pickedColor);
        drawSuggestionPopover(ctx, rows, pickedIdx >= 0 ? pickedIdx : null, 0);
        // Flash overlay over the picked row.
        if (pickedIdx >= 0 && rows[pickedIdx]) {
          const r = rows[pickedIdx]!;
          const alpha = 0.55 * (1 - flashT);
          const flashColor =
            pickedColor === "blue"
              ? `rgba(95, 175, 255, ${alpha})`
              : pickedColor === "purple"
                ? `rgba(170, 130, 240, ${alpha})`
                : `rgba(245, 78, 0, ${alpha})`;
          ctx.save();
          ctx.fillStyle = flashColor;
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.restore();
        }
      }
    } else if (this.phase.kind === "result") {
      // S-13: reveal animation over the first 1.4s so the score count-up
      // and ending pulse register before the player can read the paragraph.
      const REVEAL_DURATION_S = 1.4;
      const revealT = Math.min(1, this.phase.t / REVEAL_DURATION_S);
      // S-3: fade the share card out over the last 0.6s before autoclose so
      // the cut back to the desk reads as a transition, not a snap.
      const FADE_OUT_S = 0.6;
      const timeLeft = RESULT_AUTOCLOSE_S - this.phase.t;
      const fadeAlpha =
        timeLeft <= 0 ? 0 : timeLeft >= FADE_OUT_S ? 1 : timeLeft / FADE_OUT_S;
      ctx.save();
      ctx.globalAlpha = fadeAlpha;
      const screen = this.resultScreen;
      if (screen) {
        drawShareCard(
          ctx,
          W,
          H,
          screen.result.ending,
          screen.finalParagraph,
          screen.result.score,
          revealT,
        );
      } else {
        const result = scoreSentenceRun(this.picks);
        const finalParagraph = assembleParagraph(
          this.template.slots,
          this.picks,
          this.resolvedPrefixes,
        );
        drawShareCard(
          ctx,
          W,
          H,
          result.ending,
          finalParagraph,
          result.score,
          revealT,
        );
      }
      ctx.restore();
    }

    if (!showResult) {
      this.drawProgressDots(ctx);
      drawDeskChromeAi(ctx);
    }
    this.gate.draw(ctx, W, H);
    this.blit();
  }

  private drawProgressDots(ctx: CanvasRenderingContext2D): void {
    const total = SENTENCE_SLOTS_PER_TEMPLATE;
    const cur = this.currentSentenceIdx();
    // S-8: anchor right-edge of editor card so all dots sit on-canvas at
    // 512px width. Was baseX=502 + i*14 → last dot landed at x=600.
    const dotSpacing = 12;
    const rightEdge = SENTENCE_LAYOUT.editorX + SENTENCE_LAYOUT.editorW - 4;
    const baseX = rightEdge - (total - 1) * dotSpacing;
    for (let i = 0; i < total; i++) {
      const x = baseX + i * dotSpacing;
      const y = 26;
      const pick = this.picks[i];
      let color: string = CURSOR_AI.border;
      if (pick) {
        color =
          pick.color === "blue"
            ? CURSOR_AI.blue
            : pick.color === "purple"
              ? CURSOR_AI.purple
              : pick.color === "idle"
                ? CURSOR_AI.inkSubtle
                : CURSOR_AI.accent;
      } else if (i === cur) {
        color = CURSOR_AI.accent;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private blit(): void {
    const { cssW, cssH } = this.getOverlayViewport();
    const pr = getDeskFullRect(cssW, cssH);
    const octx = this.overlayCtx;
    const cw = octx.canvas.width;
    const ch = octx.canvas.height;
    const dpr = cw / Math.max(cssW, 1);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, cw, ch);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.fillStyle = DESK_SCRIM;
    octx.fillRect(0, 0, cssW, cssH);
    const scale = Math.min(pr.w / W, pr.h / H);
    const dw = W * scale;
    const dh = H * scale;
    const dx = pr.x + (pr.w - dw) / 2;
    const dy = pr.y + (pr.h - dh) / 2;
    octx.drawImage(this.renderCtx.canvas, dx, dy, dw, dh);
  }

  getOutcome(): MiniGameOutcome | null {
    return this.outcome;
  }

  dispose(): void {
    (this as unknown as { _cleanup?: () => void })._cleanup?.();
  }
}
