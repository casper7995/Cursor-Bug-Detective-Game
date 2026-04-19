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
  drawReagentTutorialDiagram,
  getDeskHelpButtonRect,
  hitDeskHelpButton,
  TutorialGate,
} from "../desk/tutorialGate";
import {
  addDrop,
  colorDistance,
  isMixCloseEnough,
  removeDrop,
  rinse,
  targetRgbFromToken,
  type Rgb,
  MATCH_TOLERANCE,
} from "./reagentMix";

const W = RUNNER_DRAW.canvasW;
const H = RUNNER_DRAW.canvasH;

const PANEL = { x: 24, y: 36, w: W - 48, h: H - 60 } as const;

const BEAKER = { cx: 138, cy: 138, w: 86, h: 116 } as const;

const TARGET = { x: 332, y: 70, w: 138, h: 64 } as const;
const METER = { x: 332, y: 150, w: 138, h: 14 } as const;

const DROPPER_Y = 196;
const DROPPER_W = 78;
const DROPPER_H = 70;
const DROPPER_GAP = 10;
const DROPPER_X_START = 40;
const BTN_H = 24;
const BTN_GAP = 6;

const RINSE_BTN = { x: 40, y: 274, w: 96, h: 22 } as const;
const SWIRL_BTN = { x: 290, y: 270, w: 180, h: 26 } as const;

const CHANNEL_COLORS: readonly [string, string, string] = [
  "#c83838",
  "#3aa83a",
  "#3a78d8",
];
const CHANNEL_LABELS: readonly [string, string, string] = ["R", "G", "B"];

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function dropperRects(channel: 0 | 1 | 2): {
  bottle: Rect;
  minus: Rect;
  plus: Rect;
} {
  const x = DROPPER_X_START + channel * (DROPPER_W + DROPPER_GAP);
  const bottleH = DROPPER_H - BTN_H;
  const halfW = (DROPPER_W - BTN_GAP) / 2;
  return {
    bottle: { x, y: DROPPER_Y, w: DROPPER_W, h: bottleH },
    minus: { x, y: DROPPER_Y + bottleH, w: halfW, h: BTN_H },
    plus: {
      x: x + halfW + BTN_GAP,
      y: DROPPER_Y + bottleH,
      w: halfW,
      h: BTN_H,
    },
  };
}

function inRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export interface ReagentSessionOpts {
  readonly overlayCtx: CanvasRenderingContext2D;
  readonly getOverlayViewport: () => { cssW: number; cssH: number };
  readonly clueToken: string;
  readonly onExit: () => void;
}

export class ReagentSession {
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly getOverlayViewport: () => { cssW: number; cssH: number };
  private readonly onExit: () => void;
  private readonly renderCtx: CanvasRenderingContext2D;
  private readonly clueToken: string;
  private readonly target: Rgb;
  private mix: Rgb = rinse();
  private counts: [number, number, number] = [0, 0, 0];
  private outcome: MiniGameOutcome | null = null;
  private overshoots = 0;
  private readonly startedAtMs = performance.now();
  private pointerBound = false;
  private missFlashUntil = 0;
  private readonly gate = new TutorialGate({
    title: "Match the swatch",
    tagline: "Mix R, G, B drops until your well matches the target.",
    howToLines: [
      "Tap + to add a drop, − to remove one (no penalty).",
      "Use rinse to wipe the well clean (small penalty).",
      "Hit swirl when the meter is in the green band.",
    ],
    drawDiagram: drawReagentTutorialDiagram,
    storageKey: "bd:miniTutorial:reagent",
  });

  constructor(opts: ReagentSessionOpts) {
    this.overlayCtx = opts.overlayCtx;
    this.getOverlayViewport = opts.getOverlayViewport;
    this.onExit = opts.onExit;
    this.clueToken = opts.clueToken;
    this.target = targetRgbFromToken(opts.clueToken);

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

  private addDropAction(channel: 0 | 1 | 2): void {
    this.counts[channel] = Math.min(8, this.counts[channel] + 1);
    this.mix = addDrop(this.mix, channel);
  }

  private removeDropAction(channel: 0 | 1 | 2): void {
    if (this.counts[channel] <= 0) return;
    this.counts[channel] -= 1;
    this.mix = removeDrop(this.mix, channel);
  }

  private rinseAction(): void {
    this.counts = [0, 0, 0];
    this.mix = rinse();
    this.overshoots += 1;
  }

  private trySwirl(): void {
    if (isMixCloseEnough(this.mix, this.target)) {
      const elapsed = (performance.now() - this.startedAtMs) / 1000;
      const score = Math.max(
        0,
        Math.floor(
          1000 -
            8 * this.overshoots -
            80 * colorDistance(this.mix, this.target) -
            3 * elapsed,
        ),
      );
      this.outcome = {
        clueToken: this.clueToken.toUpperCase().replace(/[^A-Z0-9]/g, ""),
        score,
      };
      return;
    }
    this.overshoots += 1;
    this.missFlashUntil = performance.now() + 320;
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
      for (let ch = 0; ch < 3; ch++) {
        const channel = ch as 0 | 1 | 2;
        const r = dropperRects(channel);
        if (inRect(p.x, p.y, r.plus)) {
          this.addDropAction(channel);
          return;
        }
        if (inRect(p.x, p.y, r.minus)) {
          this.removeDropAction(channel);
          return;
        }
      }
      if (inRect(p.x, p.y, RINSE_BTN)) {
        this.rinseAction();
        return;
      }
      if (inRect(p.x, p.y, SWIRL_BTN)) {
        this.trySwirl();
        return;
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

  step(_dtSec: number): void {
    const ctx = this.renderCtx;
    ctx.fillStyle = CURSOR.bgTop;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = CURSOR.warmCream;
    ctx.strokeStyle = "rgba(245,78,0,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = CURSOR.gold;
    ctx.font = "600 12px 'Cursor Gothic', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("REAGENT — MATCH THE SWATCH", 40, 56);

    this.drawHelpAndCloseButtons();
    this.drawBeaker(ctx);
    this.drawTargetAndMeter(ctx);
    this.drawDroppers(ctx);
    this.drawBottomButtons(ctx);

    this.gate.draw(ctx, W, H);
    this.blit();
  }

  private drawHelpAndCloseButtons(): void {
    const ctx = this.renderCtx;
    const hb = getDeskHelpButtonRect(W);
    ctx.strokeStyle = "rgba(245,78,0,0.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
    ctx.fillStyle = CURSOR.ink;
    ctx.font = "700 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("?", hb.x + hb.w / 2, hb.y + hb.h - 7);
    const cb = getDeskCloseButtonRect();
    ctx.strokeStyle = "rgba(245,78,0,0.65)";
    ctx.strokeRect(cb.x, cb.y, cb.w, cb.h);
    ctx.font = "700 14px sans-serif";
    ctx.fillText("\u2715", cb.x + cb.w / 2, cb.y + cb.h - 6);
    ctx.textAlign = "left";
  }

  private drawBeaker(ctx: CanvasRenderingContext2D): void {
    const cx = BEAKER.cx;
    const cy = BEAKER.cy;
    const w = BEAKER.w;
    const h = BEAKER.h;
    const x = cx - w / 2;
    const y = cy - h / 2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y + 8);
    ctx.lineTo(x, y + h - 16);
    ctx.quadraticCurveTo(x, y + h, x + 16, y + h);
    ctx.lineTo(x + w - 16, y + h);
    ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - 16);
    ctx.lineTo(x + w, y + 8);

    const glassGrad = ctx.createLinearGradient(x, y, x + w, y);
    glassGrad.addColorStop(0, "rgba(255,255,255,0.22)");
    glassGrad.addColorStop(0.5, "rgba(255,255,255,0.06)");
    glassGrad.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = glassGrad;
    ctx.fill();

    ctx.save();
    ctx.clip();
    const totalDrops = this.counts[0] + this.counts[1] + this.counts[2];
    const fillRatio = Math.min(0.78, 0.34 + totalDrops * 0.04);
    const liquidTop = y + h * (1 - fillRatio);
    const r = Math.floor(this.mix.r * 255);
    const g = Math.floor(this.mix.g * 255);
    const b = Math.floor(this.mix.b * 255);
    const liquidGrad = ctx.createLinearGradient(x, liquidTop, x, y + h);
    liquidGrad.addColorStop(0, `rgba(${r},${g},${b},0.95)`);
    liquidGrad.addColorStop(
      1,
      `rgba(${Math.floor(r * 0.7)},${Math.floor(g * 0.7)},${Math.floor(b * 0.7)},0.95)`,
    );
    ctx.fillStyle = liquidGrad;
    ctx.fillRect(x, liquidTop, w, h);

    ctx.fillStyle = `rgba(${Math.min(255, r + 24)},${Math.min(255, g + 24)},${Math.min(255, b + 24)},0.95)`;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, liquidTop, w / 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "rgba(40,30,20,0.75)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 9, y + 24);
    ctx.lineTo(x + 9, y + h - 22);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + 6, w / 2 + 3, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(50,40,32,0.9)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(20,15,10,0.85)";
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "rgba(40,30,20,0.65)";
    ctx.font = "10px 'Cursor Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("mix well", cx, y + h + 16);
    ctx.textAlign = "left";
  }

  private drawTargetAndMeter(ctx: CanvasRenderingContext2D): void {
    const tr = `rgb(${Math.floor(this.target.r * 255)},${Math.floor(this.target.g * 255)},${Math.floor(this.target.b * 255)})`;
    ctx.fillStyle = tr;
    ctx.fillRect(TARGET.x, TARGET.y, TARGET.w, TARGET.h);
    ctx.strokeStyle = "rgba(40,30,20,0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(TARGET.x, TARGET.y, TARGET.w, TARGET.h);
    ctx.fillStyle = "rgba(40,30,20,0.85)";
    ctx.font = "10px 'Cursor Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText("target swatch", TARGET.x, TARGET.y - 4);

    const d = colorDistance(this.mix, this.target);
    const ok = isMixCloseEnough(this.mix, this.target);
    const fillRatio = Math.max(0, Math.min(1, 1 - d));

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(METER.x, METER.y, METER.w, METER.h);

    const tx = METER.x + METER.w * (1 - MATCH_TOLERANCE);
    ctx.strokeStyle = "rgba(58,168,58,0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx, METER.y - 3);
    ctx.lineTo(tx, METER.y + METER.h + 3);
    ctx.stroke();

    let barColor = "#c83838";
    if (ok) barColor = "#3aa83a";
    else if (d < 0.36) barColor = "#d8a83a";
    ctx.fillStyle = barColor;
    ctx.fillRect(METER.x, METER.y, METER.w * fillRatio, METER.h);

    ctx.strokeStyle = "rgba(40,30,20,0.65)";
    ctx.lineWidth = 1;
    ctx.strokeRect(METER.x, METER.y, METER.w, METER.h);

    ctx.fillStyle = ok ? "#2a7a2a" : "rgba(40,30,20,0.85)";
    ctx.font = "11px 'Cursor Gothic', sans-serif";
    const status = ok
      ? "match — ready to swirl"
      : d < 0.36
        ? "close — keep mixing"
        : "off — adjust drops";
    ctx.fillText(status, METER.x, METER.y + METER.h + 14);
  }

  private drawDroppers(ctx: CanvasRenderingContext2D): void {
    for (let ch = 0; ch < 3; ch++) {
      const channel = ch as 0 | 1 | 2;
      const r = dropperRects(channel);
      const color = CHANNEL_COLORS[channel];
      const label = CHANNEL_LABELS[channel];
      const count = this.counts[channel];

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(r.bottle.x, r.bottle.y, r.bottle.w, 14, [4, 4, 0, 0]);
      ctx.fill();

      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(r.bottle.x, r.bottle.y + 11, r.bottle.w, 3);

      ctx.fillStyle = "rgba(245,242,232,0.95)";
      ctx.fillRect(r.bottle.x, r.bottle.y + 14, r.bottle.w, r.bottle.h - 14);
      ctx.strokeStyle = "rgba(40,30,20,0.55)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.bottle.x, r.bottle.y, r.bottle.w, r.bottle.h);

      ctx.fillStyle = "rgba(40,30,20,0.95)";
      ctx.font = "700 12px 'Cursor Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, r.bottle.x + r.bottle.w / 2, r.bottle.y + 28);
      ctx.fillStyle = "rgba(40,30,20,0.65)";
      ctx.font = "10px 'Cursor Mono', monospace";
      ctx.fillText(
        `${count} drop${count === 1 ? "" : "s"}`,
        r.bottle.x + r.bottle.w / 2,
        r.bottle.y + 42,
      );

      const minusEnabled = count > 0;
      this.drawSquareButton(
        ctx,
        r.minus,
        "−",
        minusEnabled ? "rgba(245,242,232,0.95)" : "rgba(245,242,232,0.55)",
        "rgba(40,30,20,0.55)",
        minusEnabled ? "rgba(40,30,20,0.95)" : "rgba(40,30,20,0.4)",
      );
      this.drawSquareButton(
        ctx,
        r.plus,
        "+",
        color,
        "rgba(40,30,20,0.55)",
        "#fff",
      );
    }
    ctx.textAlign = "left";
  }

  private drawSquareButton(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    label: string,
    fill: string,
    stroke: string,
    text: string,
  ): void {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 4);
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.font = "700 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 6);
  }

  private drawBottomButtons(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = "rgba(120,110,98,0.85)";
    ctx.beginPath();
    ctx.roundRect(RINSE_BTN.x, RINSE_BTN.y, RINSE_BTN.w, RINSE_BTN.h, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(40,30,20,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "600 12px 'Cursor Gothic', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "rinse well",
      RINSE_BTN.x + RINSE_BTN.w / 2,
      RINSE_BTN.y + RINSE_BTN.h / 2 + 4,
    );

    const ok = isMixCloseEnough(this.mix, this.target);
    const flashing = performance.now() < this.missFlashUntil;
    const baseFill = ok ? "rgba(58,168,58,0.95)" : "rgba(80,72,62,0.85)";
    const fill = flashing ? "rgba(200,56,56,0.95)" : baseFill;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(SWIRL_BTN.x, SWIRL_BTN.y, SWIRL_BTN.w, SWIRL_BTN.h, 6);
    ctx.fill();
    ctx.strokeStyle = ok ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)";
    ctx.lineWidth = ok ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "700 13px 'Cursor Gothic', sans-serif";
    const label = flashing
      ? "not yet — keep mixing"
      : ok
        ? "SWIRL TO LOCK"
        : "swirl (waits for match)";
    ctx.fillText(
      label,
      SWIRL_BTN.x + SWIRL_BTN.w / 2,
      SWIRL_BTN.y + SWIRL_BTN.h / 2 + 4,
    );
    ctx.textAlign = "left";
    ctx.restore();
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
