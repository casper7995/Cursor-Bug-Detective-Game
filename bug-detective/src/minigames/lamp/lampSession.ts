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
  drawLampTutorialDiagram,
  getDeskHelpButtonRect,
  hitDeskHelpButton,
  TutorialGate,
} from "../desk/tutorialGate";
import { canReadWithFilter, type LampFilter } from "./lampSpectrum";

const W = RUNNER_DRAW.canvasW;
const H = RUNNER_DRAW.canvasH;

export interface LampSessionOpts {
  readonly overlayCtx: CanvasRenderingContext2D;
  readonly getOverlayViewport: () => { cssW: number; cssH: number };
  readonly clueWord: string;
  readonly onExit: () => void;
}

export class LampSession {
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly getOverlayViewport: () => { cssW: number; cssH: number };
  private readonly onExit: () => void;
  private readonly renderCtx: CanvasRenderingContext2D;
  private readonly word: string;
  private readonly seedWord: string;
  private selected: LampFilter | null = null;
  private outcome: MiniGameOutcome | null = null;
  private wrongTries = 0;
  private readonly startedAtMs = performance.now();
  private pointerBound = false;
  private jitterT = 0;
  private readonly gate = new TutorialGate({
    title: "Find the legible filter",
    tagline: "Pick the filter that makes the hidden word readable.",
    howToLines: [
      "Try each filter (clear / red / blue / UV).",
      'When the letters stop jittering, hit "read" to lock the clue.',
    ],
    drawDiagram: drawLampTutorialDiagram,
    storageKey: "bd:miniTutorial:lamp",
  });

  constructor(opts: LampSessionOpts) {
    this.overlayCtx = opts.overlayCtx;
    this.getOverlayViewport = opts.getOverlayViewport;
    this.onExit = opts.onExit;
    this.seedWord = opts.clueWord;
    this.word =
      opts.clueWord
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 8) || "CLUE";
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
  ): {
    x: number;
    y: number;
  } {
    return clientToDeskGame(
      clientX,
      clientY,
      this.overlayCtx,
      this.getOverlayViewport,
    );
  }

  private filterButtons(): {
    f: LampFilter;
    x: number;
    y: number;
    w: number;
    h: number;
  }[] {
    const labels: LampFilter[] = ["none", "red", "blue", "uv"];
    const bw = 88;
    const gap = 10;
    const x0 = (W - (4 * bw + 3 * gap)) / 2;
    const y = H * 0.66;
    return labels.map((f, i) => ({
      f,
      x: x0 + i * (bw + gap),
      y,
      w: bw,
      h: 40,
    }));
  }

  attachPointer(root: HTMLElement): void {
    if (this.pointerBound) return;
    this.pointerBound = true;
    const click = (e: PointerEvent): void => {
      if (this.outcome) return;
      const p = this.gameFromClient(e.clientX, e.clientY);
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
      for (const b of this.filterButtons()) {
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
          this.selected = b.f;
          return;
        }
      }
      // read button
      if (
        p.x > W * 0.35 &&
        p.x < W * 0.65 &&
        p.y > H * 0.82 &&
        p.y < H * 0.94 &&
        this.selected
      ) {
        if (canReadWithFilter(this.selected, this.seedWord)) {
          const elapsed = (performance.now() - this.startedAtMs) / 1000;
          const score = Math.max(
            0,
            Math.floor(1000 - 15 * this.wrongTries - 4 * elapsed),
          );
          this.outcome = { clueToken: this.word, score };
        } else {
          this.wrongTries += 1;
        }
      }
    };
    root.addEventListener("pointerdown", click);
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
      root.removeEventListener("pointerdown", click);
      window.removeEventListener("keydown", key);
    };
  }

  step(dtSec: number): void {
    this.jitterT += dtSec;
    const ctx = this.renderCtx;
    ctx.fillStyle = CURSOR.bgTop;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = CURSOR.warmCream;
    ctx.strokeStyle = `rgba(245,78,0,0.45)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(28, 36, W - 56, H - 80, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = CURSOR.gold;
    ctx.font = "600 12px 'Cursor Gothic', sans-serif";
    ctx.fillText("SPECTRUM — FIND THE LEGIBLE FILTER", 44, 52);
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

    // Simulated card with jittering letters unless correct filter selected
    const showClear =
      this.selected !== null && canReadWithFilter(this.selected, this.seedWord);
    const jitter = showClear ? 0 : Math.sin(this.jitterT * 12) * 4;
    ctx.save();
    ctx.translate(W * 0.5 + jitter, H * 0.4);
    if (this.selected === "red") {
      ctx.fillStyle = "rgba(255,80,80,0.25)";
      ctx.fillRect(-140, -40, 280, 80);
    } else if (this.selected === "blue") {
      ctx.fillStyle = "rgba(80,120,255,0.22)";
      ctx.fillRect(-140, -40, 280, 80);
    } else if (this.selected === "uv") {
      ctx.fillStyle = "rgba(180,100,255,0.2)";
      ctx.fillRect(-140, -40, 280, 80);
    }
    ctx.fillStyle = showClear
      ? CURSOR.ink
      : `rgba(20,18,11,${0.25 + Math.abs(Math.sin(this.jitterT * 20)) * 0.5})`;
    ctx.font = "700 26px 'Cursor Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(this.word, 0, 8);
    ctx.textAlign = "left";
    ctx.restore();

    const names: Record<LampFilter, string> = {
      none: "clear",
      red: "red",
      blue: "blue",
      uv: "UV",
    };
    for (const b of this.filterButtons()) {
      const on = this.selected === b.f;
      ctx.fillStyle = on ? "rgba(245,78,0,0.35)" : "rgba(0,0,0,0.08)";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = CURSOR.gold;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = CURSOR.ink;
      ctx.font = "12px sans-serif";
      ctx.fillText(names[b.f], b.x + 12, b.y + 25);
    }

    ctx.strokeStyle = CURSOR.orange;
    ctx.strokeRect(W * 0.35, H * 0.82, W * 0.3, 44);
    ctx.fillStyle = CURSOR.text;
    ctx.font = "600 14px 'Cursor Gothic', sans-serif";
    ctx.fillText("read", W * 0.46, H * 0.845);

    ctx.fillStyle = CURSOR.ink;
    ctx.font = "11px sans-serif";
    ctx.fillText("Δ filter · read to lock", 44, H - 22);

    this.gate.draw(ctx, W, H);

    this.blit();
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
