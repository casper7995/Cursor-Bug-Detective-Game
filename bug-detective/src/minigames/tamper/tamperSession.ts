/** Spot the Tampering — desk-mini session, restyled as a "Bugbot review". */

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
import {
  buildTamperRound,
  namespacedSeed,
  scoreCall,
  scoreTamperRound,
} from "./round";
import {
  drawChatCard,
  drawDiffCard,
  drawIntroCard,
  drawResultCard,
  drawTamperTutorialDiagram,
  spotRowAt,
  TAMPER_LAYOUT,
  type ChatHits,
} from "./draw";
import {
  type CallVerdict,
  type TamperRound,
  TAMPER_CALLS_PER_ROUND,
} from "./types";
import { clueTokenForTamper } from "./clueTokens";
import {
  sfxTamperPanelHover,
  sfxTamperSpotMode,
  sfxTamperVerdict,
} from "../../audio/audio";

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

type Hover = "approve" | "reject" | "suggestFix" | null;

type Phase =
  | { kind: "intro"; t: number }
  | {
      kind: "call";
      callIndex: number;
      t: number;
      hover: Hover;
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
  /** Cached hit-rects from the most recent draw — re-used by pointer events. */
  private chatHits: ChatHits | null = null;
  private readonly gate = new TutorialGate({
    title: "Bugbot review",
    tagline: "Bugbot reviews the case file. Approve, reject, or suggest a fix.",
    howToLines: [
      "Bugbot calls 6 lines and gives a confidence score.",
      "Approve when you agree, Reject when you disagree.",
      "Suggest fix → and tap the real tampered row to catch a lie.",
    ],
    drawDiagram: drawTamperTutorialDiagram,
    storageKey: "bd:miniTutorial:tamper",
  });

  constructor(opts: TamperSessionOpts) {
    this.overlayCtx = opts.overlayCtx;
    this.getOverlayViewport = opts.getOverlayViewport;
    this.onExit = opts.onExit;
    this.clueWord = opts.clueWord;
    const seed = namespacedSeed(0x9e3779b1, `tamper:${opts.clueWord}`);
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
    if (
      this.phase.kind === "call" ||
      this.phase.kind === "disagree-point" ||
      this.phase.kind === "verdict"
    ) {
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
      if (this.phase.kind !== "call") return;
      const hits = this.chatHits;
      if (!hits) return;
      let hover: Hover = null;
      if (inRect(p.x, p.y, hits.approve)) hover = "approve";
      else if (inRect(p.x, p.y, hits.reject)) hover = "reject";
      else if (inRect(p.x, p.y, hits.suggestFix)) hover = "suggestFix";
      if (this.phase.hover !== hover) {
        if (hover !== null) sfxTamperPanelHover();
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
      if (this.phase.kind === "call") {
        const hits = this.chatHits;
        if (!hits) return;
        if (inRect(p.x, p.y, hits.approve)) {
          this.commitVerdict({ kind: "agree" });
          return;
        }
        if (inRect(p.x, p.y, hits.reject)) {
          this.commitVerdict({ kind: "disagree" });
          return;
        }
        if (inRect(p.x, p.y, hits.suggestFix)) {
          sfxTamperSpotMode();
          this.phase = {
            kind: "disagree-point",
            callIndex: this.phase.callIndex,
            t: 0,
          };
          return;
        }
        return;
      }
      if (this.phase.kind === "disagree-point") {
        const hit = spotRowAt(this.round.scene, p.x, p.y);
        if (hit) {
          this.commitVerdict({ kind: "disagree-point", spotId: hit.spotId });
        } else {
          // Click outside any TONIGHT row → fall back to plain disagree.
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
    sfxTamperVerdict(r);
    this.phase = { kind: "verdict", callIndex, t: 0, result: r };
  }

  private autoForwardFromCall(): void {
    if (this.phase.kind !== "call") return;
    this.commitVerdict({ kind: "agree" });
  }

  private autoForwardFromDisagreePoint(): void {
    if (this.phase.kind !== "disagree-point") return;
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
        if (this.phase.t >= CALL_DURATION_S) this.autoForwardFromCall();
        break;
      }
      case "disagree-point": {
        this.phase = {
          kind: "disagree-point",
          callIndex: this.phase.callIndex,
          t: this.phase.t + dtSec,
        };
        if (this.phase.t >= POINT_DURATION_S)
          this.autoForwardFromDisagreePoint();
        break;
      }
      case "verdict": {
        this.phase = {
          kind: "verdict",
          callIndex: this.phase.callIndex,
          t: this.phase.t + dtSec,
          result: this.phase.result,
        };
        if (this.phase.t >= VERDICT_FLASH_S) this.advanceAfterVerdict();
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

  private draw(): void {
    const ctx = this.renderCtx;
    // Light page background so cards have something to sit on.
    ctx.fillStyle = "#eceae3";
    ctx.fillRect(0, 0, W, H);

    // Title strip
    ctx.fillStyle = CURSOR_AI.ink;
    ctx.font = "700 12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Bugbot review", 18, 26);
    ctx.fillStyle = CURSOR_AI.inkSubtle;
    ctx.font = "11px 'Cursor Mono', ui-monospace, monospace";
    ctx.fillText(`· ${this.round.scene.displayName}`, 110, 26);

    const cur = this.currentCall();
    const showRealTamper =
      this.phase.kind === "verdict" && !this.phase.result.rightCall;
    const pickingSpot = this.phase.kind === "disagree-point";
    drawDiffCard(
      ctx,
      this.round.scene,
      cur?.call.bugbotPointsAtSpotId ?? null,
      showRealTamper,
      pickingSpot,
    );

    let secsLeft01 = 0;
    if (this.phase.kind === "call") {
      secsLeft01 = Math.max(0, 1 - this.phase.t / CALL_DURATION_S);
    } else if (this.phase.kind === "disagree-point") {
      secsLeft01 = Math.max(0, 1 - this.phase.t / POINT_DURATION_S);
    } else if (this.phase.kind === "verdict") {
      secsLeft01 = 1;
    }
    const hover = this.phase.kind === "call" ? this.phase.hover : null;
    this.chatHits = drawChatCard(
      ctx,
      cur?.call ?? null,
      hover,
      secsLeft01,
      pickingSpot,
    );

    // Bottom strip — progress dots + verdict flash
    this.drawBottomStrip(ctx);

    // Phase overlays
    if (this.phase.kind === "intro") {
      drawIntroCard(
        ctx,
        W,
        H,
        this.round.scene,
        this.phase.t / INTRO_DURATION_S,
      );
    } else if (this.phase.kind === "result") {
      const r = scoreTamperRound(this.round, this.verdicts);
      drawResultCard(ctx, W, H, r, TAMPER_CALLS_PER_ROUND);
    }

    drawDeskChromeAi(ctx);
    this.gate.draw(ctx, W, H);

    this.blit();
  }

  private drawBottomStrip(ctx: CanvasRenderingContext2D): void {
    const cur = this.currentCall();
    const stripY = H - 18;
    ctx.fillStyle = CURSOR_AI.inkSubtle;
    ctx.font = "500 10px 'Cursor Mono', ui-monospace, monospace";
    if (cur) {
      // Dots
      for (let i = 0; i < TAMPER_CALLS_PER_ROUND; i++) {
        const dx = TAMPER_LAYOUT.diffX + i * 12;
        ctx.fillStyle =
          i < cur.callIndex
            ? CURSOR_AI.green
            : i === cur.callIndex
              ? CURSOR_AI.accent
              : CURSOR_AI.border;
        ctx.beginPath();
        ctx.arc(dx, stripY, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = CURSOR_AI.inkMute;
      ctx.fillText(
        `call ${cur.callIndex + 1} / ${TAMPER_CALLS_PER_ROUND}`,
        TAMPER_LAYOUT.diffX + TAMPER_CALLS_PER_ROUND * 12 + 8,
        stripY + 3,
      );
    }
    if (this.phase.kind === "verdict") {
      const r = this.phase.result;
      const txt = r.caughtLie
        ? "+400 caught lying!"
        : r.rightCall
          ? "+150 right call"
          : "−75 missed";
      ctx.fillStyle = r.rightCall ? CURSOR_AI.green : CURSOR_AI.red;
      ctx.font = "700 11px 'Cursor Gothic', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(txt, TAMPER_LAYOUT.chatX + TAMPER_LAYOUT.chatW, stripY + 3);
      ctx.textAlign = "left";
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
