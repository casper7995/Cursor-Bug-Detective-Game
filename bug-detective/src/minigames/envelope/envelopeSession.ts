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
  drawEnvelopeTutorialDiagram,
  getDeskHelpButtonRect,
  hitDeskHelpButton,
  TutorialGate,
} from "../desk/tutorialGate";
import {
  buildCipher,
  initialChipPool,
  initialMapping,
  isCipherSolved,
  type Cipher,
} from "./envelopeCipher";

const W = RUNNER_DRAW.canvasW;
const H = RUNNER_DRAW.canvasH;

export interface EnvelopeSessionOpts {
  readonly overlayCtx: CanvasRenderingContext2D;
  readonly getOverlayViewport: () => { cssW: number; cssH: number };
  readonly targetWord: string;
  readonly rng?: () => number;
  readonly onExit: () => void;
}

/**
 * Evidence envelope — substitution cipher: map glyphs to letters via the key.
 */
export class EnvelopeSession {
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly getOverlayViewport: () => { cssW: number; cssH: number };
  private readonly onExit: () => void;
  private readonly renderCtx: CanvasRenderingContext2D;
  private readonly cipher: Cipher;
  private readonly mapping: Record<string, string | null>;
  private chipPool: string[];
  private chipInHand: { letter: string; from: "pool" | number } | null = null;
  private pointerX = 0;
  private pointerY = 0;
  private outcome: MiniGameOutcome | null = null;
  private readonly startedAtMs = performance.now();
  private pointerBound = false;
  private readonly gate = new TutorialGate({
    title: "Decode the case file",
    tagline: "Each symbol stands for one letter. Decode the word.",
    howToLines: [
      "Drag a letter chip onto the symbol it stands for in the KEY.",
      "The line at the top updates as you fill in symbols.",
      "Some chips are decoys — only the right ones complete the word.",
    ],
    drawDiagram: drawEnvelopeTutorialDiagram,
    storageKey: "bd:miniTutorial:envelope",
  });

  constructor(opts: EnvelopeSessionOpts) {
    this.overlayCtx = opts.overlayCtx;
    this.getOverlayViewport = opts.getOverlayViewport;
    this.onExit = opts.onExit;
    const rng = opts.rng ?? Math.random;
    this.cipher = buildCipher(opts.targetWord, rng);
    this.mapping = initialMapping(this.cipher);
    this.chipPool = initialChipPool(this.cipher);

    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2d");
    this.renderCtx = ctx;
  }

  private isLockedGlyph(g: string): boolean {
    return this.cipher.prefilled.includes(g);
  }

  private keyRows(): {
    glyph: string;
    glyphX: number;
    slotX: number;
    slotY: number;
    slotW: number;
    slotH: number;
    locked: boolean;
  }[] {
    const n = this.cipher.uniqueGlyphs.length;
    const colH = 22;
    const mid = Math.ceil(n / 2);
    const y0 = 120;
    return this.cipher.uniqueGlyphs.map((glyph, i) => {
      const col = i < mid ? 0 : 1;
      const row = col === 0 ? i : i - mid;
      const x0 = col === 0 ? 40 : W * 0.48;
      const slotX = x0 + 52;
      return {
        glyph,
        glyphX: x0 + 4,
        slotX,
        slotY: y0 + row * colH,
        slotW: 34,
        slotH: 20,
        locked: this.isLockedGlyph(glyph),
      };
    });
  }

  /** Vertical stack below the KEY so chips stay inside the card for long cipher alphabets. */
  private chipPanelLayout(rows: ReturnType<EnvelopeSession["keyRows"]>): {
    label3Y: number;
    decoyY: number;
    chipBandTop: number;
  } {
    const keyBottom = rows.length
      ? Math.max(...rows.map((r) => r.slotY + r.slotH))
      : 140;
    const label3Y = keyBottom + 10;
    const decoyY = label3Y + 12;
    let chipBandTop = decoyY + 12;
    chipBandTop = Math.min(chipBandTop, H - 62);
    return { label3Y, decoyY, chipBandTop };
  }

  private chipPoolLayoutAtBand(chipBandTop: number): {
    x: number;
    y: number;
    letter: string;
    poolIndex: number;
  }[] {
    const y = chipBandTop;
    const n = this.chipPool.length;
    const gap = 8;
    const cw = 34;
    const total = n * cw + (n - 1) * gap;
    const x0 = (W - total) / 2;
    return this.chipPool.map((letter, i) => ({
      x: x0 + i * (cw + gap) + cw / 2,
      y: y + 14,
      letter,
      poolIndex: i,
    }));
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

  attachPointer(root: HTMLElement): void {
    if (this.pointerBound) return;
    this.pointerBound = true;
    const down = (e: PointerEvent): void => {
      if (this.outcome) return;
      const p = this.gameFromClient(e.clientX, e.clientY);
      this.pointerX = p.x;
      this.pointerY = p.y;
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
      const rowsPick = this.keyRows();
      const chipBandTop = this.chipPanelLayout(rowsPick).chipBandTop;
      for (const c of this.chipPoolLayoutAtBand(chipBandTop)) {
        if (Math.hypot(p.x - c.x, p.y - c.y) < 18) {
          const letter = this.chipPool.splice(c.poolIndex, 1)[0] as
            | string
            | undefined;
          if (letter) this.chipInHand = { letter, from: "pool" };
          return;
        }
      }
      const rows = this.keyRows();
      for (let si = 0; si < rows.length; si++) {
        const r = rows[si]!;
        if (r.locked) continue;
        const g = r.glyph;
        if (
          p.x >= r.slotX &&
          p.x <= r.slotX + r.slotW &&
          p.y >= r.slotY &&
          p.y <= r.slotY + r.slotH &&
          this.mapping[g]
        ) {
          const letter = this.mapping[g]!;
          this.mapping[g] = null;
          this.chipPool.push(letter);
          this.chipInHand = { letter, from: si };
          return;
        }
      }
    };
    const up = (e: PointerEvent): void => {
      if (this.gate.isBlocking() || !this.chipInHand || this.outcome) return;
      const p = this.gameFromClient(e.clientX, e.clientY);
      const rows = this.keyRows();
      let dropped = false;
      for (let si = 0; si < rows.length; si++) {
        const r = rows[si]!;
        if (r.locked) continue;
        const g = r.glyph;
        if (
          p.x >= r.slotX &&
          p.x <= r.slotX + r.slotW &&
          p.y >= r.slotY &&
          p.y <= r.slotY + r.slotH
        ) {
          const prev = this.mapping[g];
          if (prev) this.chipPool.push(prev);
          this.mapping[g] = this.chipInHand.letter;
          dropped = true;
          break;
        }
      }
      if (!dropped) {
        this.chipPool.push(this.chipInHand.letter);
      }
      this.chipInHand = null;
      if (isCipherSolved(this.cipher, this.mapping)) {
        const elapsed = (performance.now() - this.startedAtMs) / 1000;
        const score = Math.max(0, Math.floor(1000 - 6 * elapsed));
        this.outcome = {
          clueToken: this.cipher.word,
          score,
        };
      }
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointermove", (e: PointerEvent) => {
      const pt = this.gameFromClient(e.clientX, e.clientY);
      this.pointerX = pt.x;
      this.pointerY = pt.y;
    });
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
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
    };
  }

  private previewLine(): string {
    let s = "";
    for (let i = 0; i < this.cipher.word.length; i++) {
      const g = this.cipher.glyphs[i]!;
      const m = this.mapping[g];
      s += m != null ? m : g;
      if (i < this.cipher.word.length - 1) s += " ";
    }
    return s;
  }

  step(_dtSec: number): void {
    const ctx = this.renderCtx;
    ctx.fillStyle = CURSOR.bgTop;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = CURSOR.warmCream;
    ctx.strokeStyle = `rgba(245,78,0,0.45)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(28, 36, W - 56, H - 72, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = CURSOR.gold;
    ctx.font = "600 12px 'Cursor Gothic', ui-sans-serif, sans-serif";
    ctx.fillText("EVIDENCE — DECODE THE CASE FILE", 44, 54);
    ctx.strokeStyle = `rgba(245,78,0,0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(44, 62);
    ctx.lineTo(W - 44, 62);
    ctx.stroke();
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

    const cardInnerRight = W - 36;
    ctx.font = "600 11px 'Cursor Gothic', sans-serif";
    ctx.fillStyle = CURSOR.gold;
    ctx.fillText("1 · ENCRYPTED WORD", 44, 76);
    ctx.fillStyle = CURSOR.ink;
    ctx.font = "600 14px 'Cursor Mono', monospace";
    const preview = this.previewLine();
    ctx.fillText(preview.length > 42 ? preview.slice(0, 80) : preview, 44, 94);

    ctx.font = "600 11px 'Cursor Gothic', sans-serif";
    ctx.fillStyle = CURSOR.gold;
    ctx.fillText("2 · KEY (symbol = letter)", 44, 112);

    const keyRows = this.keyRows();
    const chipPanel = this.chipPanelLayout(keyRows);
    for (const r of keyRows) {
      ctx.fillStyle = CURSOR.ink;
      ctx.font = "700 16px sans-serif";
      ctx.fillText(r.glyph, r.glyphX, r.slotY + 18);
      ctx.fillStyle = CURSOR.text;
      ctx.font = "14px sans-serif";
      ctx.fillText("=", r.slotX - 22, r.slotY + 18);
      ctx.strokeStyle = `rgba(245,78,0,0.55)`;
      ctx.strokeRect(r.slotX, r.slotY, r.slotW, r.slotH);
      const letter = this.mapping[r.glyph];
      if (letter) {
        ctx.fillStyle = r.locked ? CURSOR.text : CURSOR.orange;
        ctx.font = "700 16px 'Cursor Mono', monospace";
        ctx.fillText(letter, r.slotX + 8, r.slotY + 17);
      }
      if (r.locked) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.font = "10px sans-serif";
        const hintX = Math.min(r.slotX + r.slotW + 6, cardInnerRight - 28);
        ctx.fillText("hint", hintX, r.slotY + 16);
      }
    }

    ctx.font = "600 11px 'Cursor Gothic', sans-serif";
    ctx.fillStyle = CURSOR.gold;
    ctx.fillText("3 · LETTER CHIPS — drag onto the key", 44, chipPanel.label3Y);

    for (const c of this.chipPoolLayoutAtBand(chipPanel.chipBandTop)) {
      ctx.fillStyle = "rgba(26,24,18,0.92)";
      ctx.beginPath();
      ctx.arc(c.x, c.y, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = CURSOR.gold;
      ctx.stroke();
      ctx.fillStyle = CURSOR.textHi;
      ctx.font = "700 16px 'Cursor Mono', monospace";
      ctx.fillText(c.letter, c.x - 6, c.y + 5);
    }

    if (this.chipInHand) {
      ctx.fillStyle = "rgba(245,78,0,0.95)";
      ctx.beginPath();
      ctx.arc(this.pointerX, this.pointerY, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 16px 'Cursor Mono', monospace";
      ctx.fillText(
        this.chipInHand.letter,
        this.pointerX - 6,
        this.pointerY + 5,
      );
    }

    ctx.fillStyle = CURSOR.ink;
    ctx.font = "11px 'Cursor Gothic', sans-serif";
    ctx.fillText(
      "Some chips are decoys — only the right letters finish the word.",
      44,
      chipPanel.decoyY,
    );

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
