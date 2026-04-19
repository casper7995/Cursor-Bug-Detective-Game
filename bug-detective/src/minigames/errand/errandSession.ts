/** Errand Race — desk mini session class. */

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
import {
  buildErrandRound,
  canAssignHelper,
  namespacedSeed,
  scoreErrandRun,
} from "./round";
import {
  ERRAND_NUM_HELPERS,
  type Drawer,
  type DrawerIndex,
  type ErrandRound,
  type Helper,
  type HelperIndex,
} from "./types";
import {
  drawAbortModal,
  drawDrawerRow,
  drawErrandIntro,
  drawErrandResult,
  drawErrandTutorialDiagram,
  drawHelperHome,
  drawHelperSprite,
  drawerRect,
  helperHomeRect,
} from "./draw";
import { clueTokenForErrand } from "./clueTokens";

const W = RUNNER_DRAW.canvasW;
const H = RUNNER_DRAW.canvasH;

const INTRO_DURATION_S = 2.0;
const DISPATCH_TIMEOUT_S = 8.0;
const WATCH_CAP_S = 25.0;
const RETURN_DURATION_S = 1.6;
const RESULT_AUTOCLOSE_S = 4.0;
const ABORT_WINDOW_S = 2.0;

export interface ErrandSessionOpts {
  readonly overlayCtx: CanvasRenderingContext2D;
  readonly getOverlayViewport: () => { cssW: number; cssH: number };
  readonly clueWord: string;
  readonly onExit: () => void;
}

type Phase =
  | { kind: "intro"; t: number }
  | { kind: "dispatch"; t: number }
  | {
      kind: "alert";
      t: number;
      helperIdx: HelperIndex;
      hover: "abort" | "push" | null;
    }
  | { kind: "watch"; t: number }
  | { kind: "return"; t: number }
  | { kind: "result"; t: number };

export class ErrandSession {
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly getOverlayViewport: () => { cssW: number; cssH: number };
  private readonly onExit: () => void;
  private readonly renderCtx: CanvasRenderingContext2D;
  private readonly clueWord: string;
  private readonly round: ErrandRound;
  private helpers: Helper[];
  private phase: Phase = { kind: "intro", t: 0 };
  private outcome: MiniGameOutcome | null = null;
  private pointerBound = false;
  private pointerX = 0;
  private pointerY = 0;
  private grabbedHelper: HelperIndex | null = null;
  private alertedTrapHandled = new Set<HelperIndex>();
  private readonly gate = new TutorialGate({
    title: "Send the helpers",
    tagline: "Drag 3 helpers onto 5 drawers. Read the icons.",
    howToLines: [
      "Each helper fills one drawer at a time.",
      "Hint icons hint at content (cup/key tend to be clues, warn = trap).",
      "Trap drawers ping mid-fill — ABORT to be safe, PUSH for a 50/50.",
    ],
    drawDiagram: drawErrandTutorialDiagram,
    storageKey: "bd:miniTutorial:errand",
  });

  constructor(opts: ErrandSessionOpts) {
    this.overlayCtx = opts.overlayCtx;
    this.getOverlayViewport = opts.getOverlayViewport;
    this.onExit = opts.onExit;
    this.clueWord = opts.clueWord;
    const seed = namespacedSeed(0xa0b1c2d3, `errand:${opts.clueWord}`);
    this.round = buildErrandRound(seed);
    this.helpers = Array.from(
      { length: ERRAND_NUM_HELPERS },
      (_, i): Helper => ({
        index: i as HelperIndex,
        state: "waiting",
        drawerAssigned: null,
        fillProgress: 0,
        result: null,
      }),
    );
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
      this.pointerX = p.x;
      this.pointerY = p.y;
      if (this.phase.kind === "alert") {
        const rects = drawAbortModalHitRects(W, H);
        if (inRect(p.x, p.y, rects.abort)) this.phase.hover = "abort";
        else if (inRect(p.x, p.y, rects.push)) this.phase.hover = "push";
        else this.phase.hover = null;
      }
    };
    const down = (e: PointerEvent): void => {
      const p = this.gameFromClient(e.clientX, e.clientY);
      this.pointerX = p.x;
      this.pointerY = p.y;
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
      if (this.phase.kind === "alert") {
        const rects = drawAbortModalHitRects(W, H);
        if (inRect(p.x, p.y, rects.abort)) this.resolveAlert("abort");
        else if (inRect(p.x, p.y, rects.push)) this.resolveAlert("push");
        return;
      }
      if (this.phase.kind === "dispatch") {
        // Try to grab a helper from home row.
        for (let i = 0; i < this.helpers.length; i++) {
          const h = this.helpers[i] as Helper;
          if (h.state !== "waiting") continue;
          const r = helperHomeRect(i);
          if (inRect(p.x, p.y, r)) {
            this.grabbedHelper = i as HelperIndex;
            return;
          }
        }
      }
    };
    const up = (e: PointerEvent): void => {
      const p = this.gameFromClient(e.clientX, e.clientY);
      this.pointerX = p.x;
      this.pointerY = p.y;
      if (this.grabbedHelper === null) return;
      // Drop on a drawer if any.
      let dropped = false;
      for (let i = 0; i < this.round.drawers.length; i++) {
        const r = drawerRect(i);
        if (inRect(p.x, p.y, r)) {
          if (
            canAssignHelper(this.helpers, this.grabbedHelper as number, i)
          ) {
            const helper = this.helpers[this.grabbedHelper] as Helper;
            helper.drawerAssigned = i as DrawerIndex;
            helper.state = "filling";
            helper.fillProgress = 0;
            dropped = true;
          }
          break;
        }
      }
      void dropped;
      this.grabbedHelper = null;
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointerup", up);
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
      root.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
    };
  }

  private allHelpersAssigned(): boolean {
    return this.helpers.every((h) => h.drawerAssigned !== null);
  }

  private autoAssignRemaining(): void {
    for (const helper of this.helpers) {
      if (helper.drawerAssigned !== null) continue;
      // Pick the first drawer not already assigned.
      for (let i = 0; i < this.round.drawers.length; i++) {
        if (canAssignHelper(this.helpers, helper.index, i)) {
          helper.drawerAssigned = i as DrawerIndex;
          helper.state = "filling";
          helper.fillProgress = 0;
          break;
        }
      }
    }
  }

  private resolveAlert(choice: "abort" | "push"): void {
    if (this.phase.kind !== "alert") return;
    const helper = this.helpers[this.phase.helperIdx] as Helper;
    const drawer = this.round.drawers[
      helper.drawerAssigned as number
    ] as Drawer;
    if (choice === "abort") {
      helper.state = "returning";
      helper.result = null;
    } else {
      // Push — coin flip per drawer.
      if (drawer.trapPushIsClue) {
        helper.state = "returning";
        helper.result = "clue";
      } else {
        helper.state = "lost";
        helper.result = null;
      }
    }
    this.alertedTrapHandled.add(this.phase.helperIdx);
    this.phase = { kind: "watch", t: 0 };
  }

  private allHelpersDone(): boolean {
    return this.helpers.every(
      (h) => h.state === "returning" || h.state === "lost",
    );
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
          this.phase = { kind: "dispatch", t: 0 };
        }
        break;
      }
      case "dispatch": {
        this.phase = { kind: "dispatch", t: this.phase.t + dtSec };
        if (
          this.allHelpersAssigned() ||
          this.phase.t >= DISPATCH_TIMEOUT_S
        ) {
          if (!this.allHelpersAssigned()) this.autoAssignRemaining();
          this.phase = { kind: "watch", t: 0 };
        }
        break;
      }
      case "watch": {
        this.phase = { kind: "watch", t: this.phase.t + dtSec };
        this.advanceFillers(dtSec);
        // Trigger trap alerts.
        for (const helper of this.helpers) {
          if (helper.state !== "filling") continue;
          if (helper.drawerAssigned === null) continue;
          const drawer = this.round.drawers[
            helper.drawerAssigned
          ] as Drawer;
          if (
            drawer.content === "trap" &&
            !this.alertedTrapHandled.has(helper.index) &&
            helper.fillProgress >= drawer.trapAlertAt01
          ) {
            helper.state = "alert";
            this.phase = {
              kind: "alert",
              t: 0,
              helperIdx: helper.index,
              hover: null,
            };
            return;
          }
        }
        if (this.allHelpersDone() || this.phase.t >= WATCH_CAP_S) {
          this.phase = { kind: "return", t: 0 };
        }
        break;
      }
      case "alert": {
        this.phase = {
          kind: "alert",
          t: this.phase.t + dtSec,
          helperIdx: this.phase.helperIdx,
          hover: this.phase.hover,
        };
        if (this.phase.t >= ABORT_WINDOW_S) {
          // Timeout: default to ABORT (safe but no clue).
          this.resolveAlert("abort");
        }
        break;
      }
      case "return": {
        this.phase = { kind: "return", t: this.phase.t + dtSec };
        if (this.phase.t >= RETURN_DURATION_S) {
          this.phase = { kind: "result", t: 0 };
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

  private advanceFillers(dtSec: number): void {
    for (const helper of this.helpers) {
      if (helper.state !== "filling") continue;
      if (helper.drawerAssigned === null) continue;
      const drawer = this.round.drawers[helper.drawerAssigned] as Drawer;
      const inc = (dtSec * 1000) / drawer.fillRateMs;
      helper.fillProgress = Math.min(1, helper.fillProgress + inc);
      if (helper.fillProgress >= 1) {
        // Resolve.
        helper.result = drawer.content === "clue" ? "clue" : null;
        helper.state = "returning";
      }
    }
  }

  private finalizeOutcome(): void {
    if (this.outcome) return;
    let clues = 0;
    let safe = 0;
    let lost = 0;
    for (const h of this.helpers) {
      if (h.state === "lost") lost++;
      else safe++;
      if (h.result === "clue") clues++;
    }
    const score = scoreErrandRun({
      clues,
      helpersSafe: safe,
      helpersLost: lost,
    });
    if (clues === 0) {
      // Player can replay; no slot fill, stay open until they Esc.
      // Show the result card but don't emit outcome — main loop checks
      // getOutcome() per frame. Mark `outcome` only via Esc / close button.
      // For safety, we still let them dismiss with result-card click.
      this.onExit();
      return;
    }
    this.outcome = {
      clueToken: clueTokenForErrand(this.clueWord),
      score,
    };
  }

  private draw(): void {
    const ctx = this.renderCtx;
    ctx.fillStyle = CURSOR.bgTop;
    ctx.fillRect(0, 0, W, H);

    // Background panel
    ctx.fillStyle = CURSOR.warmCream;
    ctx.strokeStyle = "rgba(245,78,0,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(16, 40, W - 32, H - 60, 10);
    ctx.fill();
    ctx.stroke();

    // Title strip
    ctx.fillStyle = CURSOR.gold;
    ctx.font = "600 12px 'Cursor Gothic', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("ERRAND RACE — DISPATCH HELPERS", 28, 30);

    drawDrawerRow(ctx, this.round.drawers, this.helpers);

    // Show helpers either at home (waiting) or moved into drawer slots.
    drawHelperHome(
      ctx,
      this.helpers,
      this.grabbedHelper,
      this.pointerX,
      this.pointerY,
    );
    // Helpers actively in drawers — already drawn as the H# marker in
    // drawDrawerRow, but draw a small sprite atop the drawer for clarity.
    for (const h of this.helpers) {
      if (h.state === "filling" || h.state === "alert") {
        if (h.drawerAssigned === null) continue;
        const r = drawerRect(h.drawerAssigned);
        drawHelperSprite(ctx, r.x + r.w / 2, r.y + r.h / 2 - 6, h);
      } else if (h.state === "returning" || h.state === "lost") {
        // Position outcome marker over the helper home slot.
        const home = helperHomeRect(h.index);
        drawHelperSprite(ctx, home.x + home.w / 2, home.y + home.h / 2, h);
        ctx.fillStyle =
          h.state === "lost"
            ? CURSOR.orange
            : h.result === "clue"
              ? "rgba(80,180,80,0.95)"
              : "rgba(247,247,244,0.7)";
        ctx.font = "9px 'Cursor Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(
          h.state === "lost"
            ? "lost"
            : h.result === "clue"
              ? "+CLUE"
              : "junk",
          home.x + home.w / 2,
          home.y + home.h + 14,
        );
      }
    }

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
      drawErrandIntro(ctx, W, H, this.phase.t / INTRO_DURATION_S);
    } else if (this.phase.kind === "alert") {
      drawAbortModal(
        ctx,
        W,
        H,
        this.phase.helperIdx,
        Math.max(0, 1 - this.phase.t / ABORT_WINDOW_S),
      );
    } else if (this.phase.kind === "result") {
      let clues = 0;
      let safe = 0;
      let lost = 0;
      for (const h of this.helpers) {
        if (h.state === "lost") lost++;
        else safe++;
        if (h.result === "clue") clues++;
      }
      const score = scoreErrandRun({
        clues,
        helpersSafe: safe,
        helpersLost: lost,
      });
      drawErrandResult(ctx, W, H, { clues, helpersSafe: safe, helpersLost: lost }, score);
    } else if (this.phase.kind === "dispatch") {
      ctx.fillStyle = CURSOR.ink;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "drag a helper onto a drawer · auto-dispatch in " +
          Math.max(0, Math.ceil(DISPATCH_TIMEOUT_S - this.phase.t)) +
          "s",
        W / 2,
        H - 20,
      );
      ctx.textAlign = "left";
    } else if (this.phase.kind === "watch") {
      ctx.fillStyle = CURSOR.ink;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("watch your helpers · trap drawers will ping", W / 2, H - 20);
      ctx.textAlign = "left";
    } else if (this.phase.kind === "return") {
      ctx.fillStyle = CURSOR.ink;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("helpers returning…", W / 2, H - 20);
      ctx.textAlign = "left";
    }

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

function inRect(
  x: number,
  y: number,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Mirror modal layout from drawAbortModal so hit-testing stays in sync. */
function drawAbortModalHitRects(
  W: number,
  H: number,
): {
  abort: { x: number; y: number; w: number; h: number };
  push: { x: number; y: number; w: number; h: number };
} {
  const w = 320;
  const h = 130;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  const bw = 130;
  const bh = 36;
  const by = y + h - bh - 24;
  return {
    abort: { x: x + 18, y: by, w: bw, h: bh },
    push: { x: x + w - bw - 18, y: by, w: bw, h: bh },
  };
}
