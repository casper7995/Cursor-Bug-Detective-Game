/** Spot the Tampering — desk-mini session class. */

import { CURSOR } from "../../ui/cursorTheme";
import type { MiniGameOutcome } from "../types";
import { RUNNER_DRAW } from "../runner/sim";
import {
  clientToDeskGame,
  DESK_SCRIM,
  drawDeskChrome,
  getDeskFullRect,
  hitDeskCloseButton,
} from "../desk/deskLayout";
import { hitDeskHelpButton, TutorialGate } from "../desk/tutorialGate";
import {
  buildTamperRound,
  namespacedSeed,
  scoreCall,
  scoreTamperRound,
} from "./round";
import {
  drawAgreeDisagreeButtons,
  drawBugbotBubble,
  drawDisagreePointPrompt,
  drawIntroCard,
  drawResultCard,
  drawTamperFrame,
  drawTamperTutorialDiagram,
  getAgreeDisagreeButtons,
} from "./draw";
import {
  type CallVerdict,
  type TamperRound,
  type TamperSpot,
  TAMPER_CALLS_PER_ROUND,
} from "./types";
import { spotById } from "./round";
import { clueTokenForTamper } from "./clueTokens";

const W = RUNNER_DRAW.canvasW;
const H = RUNNER_DRAW.canvasH;

const INTRO_DURATION_S = 2.5;
const CALL_DURATION_S = 3.5;
const POINT_DURATION_S = 2.0;
const VERDICT_FLASH_S = 0.6;
const RESULT_AUTOCLOSE_S = 4.0;

export interface TamperSessionOpts {
  readonly overlayCtx: CanvasRenderingContext2D;
  readonly getOverlayViewport: () => { cssW: number; cssH: number };
  /** Anomaly's gameClueWords.tamper string. */
  readonly clueWord: string;
  readonly onExit: () => void;
}

type Phase =
  | { kind: "intro"; t: number }
  | {
      kind: "call";
      callIndex: number;
      t: number;
      hover: "agree" | "disagree" | null;
    }
  | {
      kind: "disagree-point";
      callIndex: number;
      t: number;
    }
  | {
      kind: "verdict";
      callIndex: number;
      t: number;
      result: { delta: number; rightCall: boolean; caughtLie: boolean };
    }
  | { kind: "result"; t: number };

export class TamperSession {
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly getOverlayViewport: () => { cssW: number; cssH: number };
  private readonly onExit: () => void;
  private readonly renderCtx: CanvasRenderingContext2D;
  private readonly clueWord: string;
  private readonly round: TamperRound;
  private readonly verdicts: CallVerdict[] = [];
  private phase: Phase = { kind: "intro", t: 0 };
  private outcome: MiniGameOutcome | null = null;
  private pointerBound = false;
  private readonly gate = new TutorialGate({
    title: "Spot the tampering",
    tagline: "Bugbot points at TONIGHT. Agree, disagree, or catch a lie.",
    howToLines: [
      "Bugbot calls one spot per round and gives a confidence.",
      "Click AGREE if you think Bugbot is right.",
      "Click DISAGREE — then tap the real tampered spot to catch the lie.",
    ],
    drawDiagram: drawTamperTutorialDiagram,
    storageKey: "bd:miniTutorial:tamper",
  });

  constructor(opts: TamperSessionOpts) {
    this.overlayCtx = opts.overlayCtx;
    this.getOverlayViewport = opts.getOverlayViewport;
    this.onExit = opts.onExit;
    this.clueWord = opts.clueWord;
    const seed = namespacedSeed(
      // Daily seed already baked into clueWord variation per-anomaly.
      // Fold the word itself so day-to-day variation is preserved.
      0x9e3779b1,
      `tamper:${opts.clueWord}`,
    );
    this.round = buildTamperRound(seed);
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

  private currentCall(): {
    call: TamperRound["calls"][number];
    callIndex: number;
  } | null {
    if (this.phase.kind === "call") {
      return {
        call: this.round.calls[this.phase.callIndex] as TamperRound["calls"][number],
        callIndex: this.phase.callIndex,
      };
    }
    if (this.phase.kind === "disagree-point") {
      return {
        call: this.round.calls[this.phase.callIndex] as TamperRound["calls"][number],
        callIndex: this.phase.callIndex,
      };
    }
    if (this.phase.kind === "verdict") {
      return {
        call: this.round.calls[this.phase.callIndex] as TamperRound["calls"][number],
        callIndex: this.phase.callIndex,
      };
    }
    return null;
  }

  attachPointer(root: HTMLElement): void {
    if (this.pointerBound) return;
    this.pointerBound = true;

    const move = (e: PointerEvent): void => {
      const p = this.gameFromClient(e.clientX, e.clientY);
      if (this.phase.kind === "call") {
        const rects = getAgreeDisagreeButtons(W, H);
        if (inRect(p.x, p.y, rects.agree)) this.phase.hover = "agree";
        else if (inRect(p.x, p.y, rects.disagree)) this.phase.hover = "disagree";
        else this.phase.hover = null;
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
      if (this.phase.kind === "call") {
        const rects = getAgreeDisagreeButtons(W, H);
        if (inRect(p.x, p.y, rects.agree)) {
          this.commitVerdict({ kind: "agree" });
        } else if (inRect(p.x, p.y, rects.disagree)) {
          // Move into the point sub-state so the player can catch a lie.
          this.phase = {
            kind: "disagree-point",
            callIndex: this.phase.callIndex,
            t: 0,
          };
        }
        return;
      }
      if (this.phase.kind === "disagree-point") {
        // Either tap a spot (catch attempt) or auto-fall-through after timer.
        const tap = this.findSpotAt(p.x, p.y);
        if (tap) {
          this.commitVerdict({ kind: "disagree-point", spotId: tap.id });
        } else {
          // Tap outside any spot → treat as plain disagree.
          this.commitVerdict({ kind: "disagree" });
        }
        return;
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

  private findSpotAt(x: number, y: number): TamperSpot | null {
    // Tap test: against TONIGHT panel only (right-side panel).
    // Spot center in canvas coords lives at TONIGHT_PANEL_X + spot.x.
    // We import constants implicitly via draw spot helper — but to avoid
    // a draw-time dep, recompute the offset here.
    const TONIGHT_X = 24 + 222 + 18; // mirrors draw.ts constants
    const TONIGHT_Y = 70;
    for (const s of this.round.scene.spots) {
      const cx = TONIGHT_X + s.x;
      const cy = TONIGHT_Y + s.y;
      if (Math.hypot(x - cx, y - cy) <= s.r + 2) return s;
    }
    return null;
  }

  private commitVerdict(v: CallVerdict): void {
    if (
      this.phase.kind !== "call" &&
      this.phase.kind !== "disagree-point"
    )
      return;
    const callIndex = this.phase.callIndex;
    const call = this.round.calls[callIndex];
    if (!call) return;
    this.verdicts.push(v);
    const r = scoreCall(call, v, this.round.tamperedSpotId);
    this.phase = { kind: "verdict", callIndex, t: 0, result: r };
  }

  private autoForwardFromCall(): void {
    if (this.phase.kind !== "call") return;
    // Time ran out — record an idle "agree" (most common safe default).
    this.commitVerdict({ kind: "agree" });
  }

  private autoForwardFromDisagreePoint(): void {
    if (this.phase.kind !== "disagree-point") return;
    // Player ran out of time — count as plain disagree.
    this.commitVerdict({ kind: "disagree" });
  }

  private advanceAfterVerdict(): void {
    if (this.phase.kind !== "verdict") return;
    const next = this.phase.callIndex + 1;
    if (next >= TAMPER_CALLS_PER_ROUND) {
      this.phase = { kind: "result", t: 0 };
      return;
    }
    this.phase = { kind: "call", callIndex: next, t: 0, hover: null };
  }

  private finalizeOutcome(): void {
    if (this.outcome) return;
    const result = scoreTamperRound(this.round, this.verdicts);
    this.outcome = {
      clueToken: clueTokenForTamper(this.clueWord),
      score: result.score,
    };
  }

  step(dtSec: number): void {
    if (this.gate.isBlocking()) {
      // Render but don't advance phase clocks while tutorial is up.
      this.draw();
      return;
    }
    switch (this.phase.kind) {
      case "intro": {
        this.phase = { kind: "intro", t: this.phase.t + dtSec };
        if (this.phase.t >= INTRO_DURATION_S) {
          this.phase = { kind: "call", callIndex: 0, t: 0, hover: null };
        }
        break;
      }
      case "call": {
        this.phase = {
          kind: "call",
          callIndex: this.phase.callIndex,
          t: this.phase.t + dtSec,
          hover: this.phase.hover,
        };
        if (this.phase.t >= CALL_DURATION_S) {
          this.autoForwardFromCall();
        }
        break;
      }
      case "disagree-point": {
        this.phase = {
          kind: "disagree-point",
          callIndex: this.phase.callIndex,
          t: this.phase.t + dtSec,
        };
        if (this.phase.t >= POINT_DURATION_S) {
          this.autoForwardFromDisagreePoint();
        }
        break;
      }
      case "verdict": {
        this.phase = {
          kind: "verdict",
          callIndex: this.phase.callIndex,
          t: this.phase.t + dtSec,
          result: this.phase.result,
        };
        if (this.phase.t >= VERDICT_FLASH_S) {
          this.advanceAfterVerdict();
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

  private draw(): void {
    const ctx = this.renderCtx;
    ctx.fillStyle = CURSOR.bgTop;
    ctx.fillRect(0, 0, W, H);

    const cur = this.currentCall();
    const showRealTamper =
      this.phase.kind === "verdict" && !this.phase.result.rightCall;
    drawTamperFrame(
      ctx,
      W,
      H,
      this.round.scene,
      cur?.call ?? null,
      showRealTamper,
    );

    drawDeskChrome(ctx);

    // Phase overlays
    if (this.phase.kind === "intro") {
      drawIntroCard(
        ctx,
        W,
        H,
        this.round.scene,
        this.phase.t / INTRO_DURATION_S,
      );
    } else if (this.phase.kind === "call" && cur) {
      drawBugbotBubble(ctx, W, cur.call, this.round.scene);
      const rects = getAgreeDisagreeButtons(W, H);
      const remain = Math.max(0, 1 - this.phase.t / CALL_DURATION_S);
      drawAgreeDisagreeButtons(
        ctx,
        rects,
        this.phase.hover === "agree",
        this.phase.hover === "disagree",
        remain,
      );
      this.drawCallProgress(ctx);
    } else if (this.phase.kind === "disagree-point" && cur) {
      drawBugbotBubble(ctx, W, cur.call, this.round.scene);
      const remain = Math.max(0, 1 - this.phase.t / POINT_DURATION_S);
      drawDisagreePointPrompt(ctx, W, H, remain);
      this.drawCallProgress(ctx);
    } else if (this.phase.kind === "verdict" && cur) {
      drawBugbotBubble(ctx, W, cur.call, this.round.scene);
      const r = this.phase.result;
      ctx.fillStyle = r.rightCall ? "rgba(80,180,80,0.95)" : CURSOR.orange;
      ctx.font = "700 16px 'Cursor Gothic', sans-serif";
      ctx.textAlign = "center";
      const txt = r.caughtLie
        ? "+400 caught lying!"
        : r.rightCall
          ? "+150 right call"
          : "−75 missed";
      ctx.fillText(txt, W / 2, H - 30);
      ctx.textAlign = "left";
      this.drawCallProgress(ctx);
    } else if (this.phase.kind === "result") {
      const r = scoreTamperRound(this.round, this.verdicts);
      drawResultCard(ctx, W, H, r, TAMPER_CALLS_PER_ROUND);
    }

    this.gate.draw(ctx, W, H);
    this.blit();
  }

  private drawCallProgress(ctx: CanvasRenderingContext2D): void {
    // Tiny dots top-right of the panel showing call X of N.
    const cur = this.currentCall();
    if (!cur) return;
    const dots = TAMPER_CALLS_PER_ROUND;
    // Render dots + counter at the bottom strip, between the panels and
    // the agree/disagree buttons, so the Bugbot bubble doesn't collide.
    const dotY = H - 60;
    for (let i = 0; i < dots; i++) {
      const x = 28 + i * 14;
      ctx.fillStyle =
        i < cur.callIndex
          ? "rgba(80,180,80,0.95)"
          : i === cur.callIndex
            ? CURSOR.orange
            : "rgba(245,240,232,0.3)";
      ctx.beginPath();
      ctx.arc(x, dotY, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(245,240,232,0.7)";
    ctx.font = "9px 'Cursor Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      `call ${cur.callIndex + 1} / ${TAMPER_CALLS_PER_ROUND}`,
      28 + dots * 14 + 6,
      dotY + 3,
    );
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

// Re-export for tests / external callers.
export { spotById };
