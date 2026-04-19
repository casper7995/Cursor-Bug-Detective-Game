/** Finish the Sentence — desk mini session class. */

import { CURSOR } from "../../ui/cursorTheme";
import type { MiniGameOutcome } from "../types";
import { RUNNER_DRAW } from "../runner/sim";
import {
  clientToDeskGame,
  DESK_SCRIM,
  getDeskCloseButtonRect,
  getDeskFullRect,
  hitDeskCloseButton,
} from "../desk/deskLayout";
import {
  getDeskHelpButtonRect,
  hitDeskHelpButton,
  TutorialGate,
} from "../desk/tutorialGate";
import type { AnomalyId } from "../../scene/anomalies";
import { pickTemplate } from "./templates";
import {
  injectName,
  scoreSentenceRun,
  shouldEmitOutcome,
} from "./scoring";
import {
  assembleParagraph,
  drawIntroCard,
  drawSentenceTutorialDiagram,
  drawShareCard,
  drawSuggestionBalloons,
  drawTypewriterScene,
  getBalloonRects,
} from "./draw";
import {
  type PickColor,
  type PlayerPick,
  type SentenceTemplate,
  SENTENCE_SLOTS_PER_TEMPLATE,
} from "./types";
import { clueTokenForSentence } from "./clueTokens";

const W = RUNNER_DRAW.canvasW;
const H = RUNNER_DRAW.canvasH;

const INTRO_DURATION_S = 1.5;
const TYPE_PER_SENTENCE_S = 1.4; // typewriter clack-types prefix in this many sec
const PICK_TIMEOUT_S = 2.5;
const RESULT_AUTOCLOSE_S = 5.0;

export interface SentenceSessionOpts {
  readonly overlayCtx: CanvasRenderingContext2D;
  readonly getOverlayViewport: () => { cssW: number; cssH: number };
  readonly clueWord: string;
  readonly anomalyId: AnomalyId;
  readonly onExit: () => void;
}

type Phase =
  | { kind: "intro"; t: number }
  | {
      kind: "type";
      sentenceIdx: number;
      t: number;
    }
  | {
      kind: "pick";
      sentenceIdx: number;
      t: number;
      hover: PickColor | null;
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
  private readonly template: SentenceTemplate;
  private readonly playerName: string | null;
  private readonly resolvedPrefixes: string[];
  private readonly picks: PlayerPick[] = [];
  private phase: Phase = { kind: "intro", t: 0 };
  private outcome: MiniGameOutcome | null = null;
  private pointerBound = false;
  private readonly gate = new TutorialGate({
    title: "Finish the sentence",
    tagline: "Pick a suggestion before the typewriter does it for you.",
    howToLines: [
      "BLUE = the right finish for the case file.",
      "PURPLE = funny, costs you points.",
      "ORANGE = honest mistake; idle = typewriter picks orange for you.",
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
    const move = (e: PointerEvent): void => {
      const p = this.gameFromClient(e.clientX, e.clientY);
      if (this.phase.kind === "pick") {
        const slot = this.template.slots[this.phase.sentenceIdx];
        if (!slot) return;
        const rects = getBalloonRects(this.renderCtx, W, H, slot.options);
        let hover: PickColor | null = null;
        for (const r of rects) {
          if (inRect(p.x, p.y, r)) {
            hover = r.color;
            break;
          }
        }
        this.phase.hover = hover;
      }
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
        const rects = getBalloonRects(this.renderCtx, W, H, slot.options);
        for (const r of rects) {
          if (inRect(p.x, p.y, r)) {
            this.commitPick(r.color);
            return;
          }
        }
      }
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerdown", down);
    const key = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      if (this.gate.isBlocking()) {
        this.gate.dismissFromKey();
        return;
      }
      this.onExit();
    };
    window.addEventListener("keydown", key);
    (this as unknown as { _cleanup?: () => void })._cleanup = (): void => {
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }

  private commitPick(color: PickColor): void {
    if (this.phase.kind !== "pick") return;
    const sentenceIdx = this.phase.sentenceIdx;
    this.picks.push({ sentenceIdx, color });
    this.maybeInjectNameForNext();
    this.advanceAfterPick();
  }

  private commitIdle(): void {
    if (this.phase.kind !== "pick") return;
    const sentenceIdx = this.phase.sentenceIdx;
    this.picks.push({ sentenceIdx, color: "idle" });
    this.maybeInjectNameForNext();
    this.advanceAfterPick();
  }

  private maybeInjectNameForNext(): void {
    // If 3 consecutive blues, inject name into the NEXT slot's prefix.
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
      this.phase = { kind: "result", t: 0 };
      return;
    }
    this.phase = { kind: "type", sentenceIdx: next, t: 0 };
  }

  private finalizeOutcome(): void {
    if (this.outcome) return;
    if (!shouldEmitOutcome(this.picks)) {
      this.onExit();
      return;
    }
    const result = scoreSentenceRun(this.picks);
    this.outcome = {
      clueToken: clueTokenForSentence(this.clueWord),
      score: result.score,
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
        if (this.phase.t >= TYPE_PER_SENTENCE_S) {
          this.phase = {
            kind: "pick",
            sentenceIdx: this.phase.sentenceIdx,
            t: 0,
            hover: null,
          };
        }
        break;
      }
      case "pick": {
        this.phase = {
          kind: "pick",
          sentenceIdx: this.phase.sentenceIdx,
          t: this.phase.t + dtSec,
          hover: this.phase.hover,
        };
        if (this.phase.t >= PICK_TIMEOUT_S) {
          this.commitIdle();
        }
        break;
      }
      case "result": {
        this.phase = { kind: "result", t: this.phase.t + dtSec };
        if (this.phase.t >= RESULT_AUTOCLOSE_S) {
          this.finalizeOutcome();
        }
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
    if (this.phase.kind === "type" || this.phase.kind === "pick") {
      return this.phase.sentenceIdx;
    }
    return this.picks.length;
  }

  private currentParagraphProgress(): { paragraph: string; progress01: number } {
    // Build the paragraph up to the current sentence; for the in-progress
    // sentence, only show the prefix typing progress.
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
    let typingProgress = 1;
    if (this.phase.kind === "type") {
      typingProgress = Math.min(1, this.phase.t / TYPE_PER_SENTENCE_S);
      const slot = this.template.slots[idx];
      if (slot) {
        const prefix = this.resolvedPrefixes[idx] ?? slot.prefix;
        const visiblePrefix = prefix.slice(
          0,
          Math.floor(prefix.length * typingProgress),
        );
        completedParts.push(visiblePrefix);
      }
    } else if (this.phase.kind === "pick") {
      const slot = this.template.slots[idx];
      if (slot) {
        const prefix = this.resolvedPrefixes[idx] ?? slot.prefix;
        completedParts.push(`${prefix}___`);
      }
    }
    const paragraph = completedParts.join(" ");
    return { paragraph, progress01: 1 };
  }

  private draw(): void {
    const ctx = this.renderCtx;
    const { paragraph } = this.currentParagraphProgress();
    drawTypewriterScene(ctx, W, H, paragraph, 1);

    // Header chrome
    const hb = getDeskHelpButtonRect(W);
    ctx.strokeStyle = "rgba(245,78,0,0.55)";
    ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
    ctx.fillStyle = CURSOR.ink;
    ctx.font = "700 12px sans-serif";
    ctx.fillText("?", hb.x + 10, hb.y + 18);
    const cb = getDeskCloseButtonRect();
    ctx.strokeStyle = "rgba(245,78,0,0.65)";
    ctx.strokeRect(cb.x, cb.y, cb.w, cb.h);
    ctx.fillStyle = CURSOR.ink;
    ctx.font = "700 14px sans-serif";
    ctx.fillText("✕", cb.x + 9, cb.y + 19);

    // Phase overlays
    if (this.phase.kind === "intro") {
      drawIntroCard(ctx, W, H, this.phase.t / INTRO_DURATION_S);
    } else if (this.phase.kind === "pick") {
      const slot = this.template.slots[this.phase.sentenceIdx];
      if (slot) {
        const rects = getBalloonRects(ctx, W, H, slot.options);
        const remain = Math.max(0, 1 - this.phase.t / PICK_TIMEOUT_S);
        drawSuggestionBalloons(ctx, rects, this.phase.hover, remain);
      }
    } else if (this.phase.kind === "result") {
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
      );
    }

    this.drawProgressDots(ctx);
    this.gate.draw(ctx, W, H);
    this.blit();
  }

  private drawProgressDots(ctx: CanvasRenderingContext2D): void {
    const total = SENTENCE_SLOTS_PER_TEMPLATE;
    const cur = this.currentSentenceIdx();
    for (let i = 0; i < total; i++) {
      const x = 28 + i * 12;
      const y = 30;
      const pick = this.picks[i];
      let color = "rgba(245,240,232,0.3)";
      if (pick) {
        color =
          pick.color === "blue"
            ? "#5d9bff"
            : pick.color === "purple"
              ? "#b58aff"
              : pick.color === "idle"
                ? "rgba(247,247,244,0.5)"
                : "#ff8b3d";
      } else if (i === cur) {
        color = "rgba(245,78,0,0.9)";
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

function inRect(
  x: number,
  y: number,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

