/** Errand Race — desk mini, restyled as Cursor Agents task triage. */

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
  buildErrandRound,
  errandEarnsDeskClue,
  namespacedSeed,
  scoreErrandRun,
} from "./round";
import {
  ERRAND_NUM_HELPERS,
  type Drawer,
  type DrawerContent,
  type DrawerIndex,
  type ErrandRound,
  type Helper,
  type HelperIndex,
} from "./types";
import {
  drawAgentsCard,
  drawErrandIntro,
  drawErrandResult,
  drawErrandTutorialDiagram,
  drawTasksCard,
  taskCardAt,
} from "./draw";
import { clueTokenForErrand } from "./clueTokens";
import {
  sfxErrandDispatch,
  sfxErrandReject,
  sfxErrandTrapPing,
} from "../../audio/audio";

const W = RUNNER_DRAW.canvasW;
const H = RUNNER_DRAW.canvasH;

const INTRO_DURATION_S = 1.35;
const RESULT_AUTOCLOSE_S = 3.2;

export interface ErrandSessionOpts {
  readonly overlayCtx: CanvasRenderingContext2D;
  readonly getOverlayViewport: () => { cssW: number; cssH: number };
  readonly clueWord: string;
  readonly onExit: () => void;
}

type Phase =
  | { kind: "intro"; t: number }
  | { kind: "pick"; t: number }
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
  private hoverTaskIdx: number | null = null;
  private agentsRemaining = ERRAND_NUM_HELPERS;
  private playerPicks = 0;
  private revealedTasks = new Map<DrawerIndex, DrawerContent>();
  /** Brief footer hint after an invalid pick. */
  private transientFooter: string | null = null;
  private transientFooterClear: ReturnType<typeof setTimeout> | null = null;
  private readonly gate = new TutorialGate({
    title: "Cursor Agents — task triage",
    tagline: "Pick 3 task cards. Find a clue. Avoid the trap.",
    howToLines: [
      "You have 3 agents. Click a task card, or press 1–5, to spend one.",
      "Cards show relevance and risk before you pick — use them, then click.",
      "Evidence locks with 2 clue tasks, or 1 clue and zero trap hits.",
      "Cup / key are favorable hints; the warning mark is high risk.",
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
        trait: this.round.agentTraits[i]!,
        tripwireT: 0,
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
    const stopTutorialPropagation = (consumed: boolean): void => {
      if (!consumed) return;
      this.pointerBound = this.pointerBound;
    };
    const routeTutorialPointer = (clientX: number, clientY: number): void => {
      if (!this.gate.isBlocking()) return;
      const p = this.gameFromClient(clientX, clientY);
      stopTutorialPropagation(this.gate.handlePointer(p.x, p.y, W, H) !== null);
    };
    const move = (e: PointerEvent): void => {
      const p = this.gameFromClient(e.clientX, e.clientY);
      if (this.outcome || this.gate.isBlocking()) {
        this.hoverTaskIdx = null;
        return;
      }
      this.hoverTaskIdx =
        this.phase.kind === "pick" ? this.pickableTaskAt(p.x, p.y) : null;
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
        const action = this.gate.handlePointer(p.x, p.y, W, H);
        if (action !== null) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (this.phase.kind === "result") {
        this.finalizeOutcome();
        return;
      }
      if (this.phase.kind === "pick") {
        const taskIdx = taskCardAt(this.round.drawers, p.x, p.y);
        if (taskIdx !== null) {
          this.pickTask(taskIdx);
          e.preventDefault();
        }
      }
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerdown", down);
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
      const m = /^Digit([1-5])$/.exec(e.code) ?? /^Numpad([1-5])$/.exec(e.code);
      if (!m) return;
      const taskIdx = Number.parseInt(m[1]!, 10) - 1;
      this.pickTask(taskIdx);
      e.preventDefault();
    };
    const onDocPointerDown = (e: PointerEvent): void => {
      routeTutorialPointer(e.clientX, e.clientY);
    };
    const onDocMouseDown = (e: MouseEvent): void => {
      routeTutorialPointer(e.clientX, e.clientY);
    };
    const onDocClick = (e: MouseEvent): void => {
      routeTutorialPointer(e.clientX, e.clientY);
    };
    const onDocTouchStart = (e: TouchEvent): void => {
      const t = e.changedTouches[0] ?? e.touches[0];
      if (!t) return;
      routeTutorialPointer(t.clientX, t.clientY);
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
      if (this.transientFooterClear) {
        clearTimeout(this.transientFooterClear);
        this.transientFooterClear = null;
      }
    };
  }

  private flashTransientFooter(msg: string): void {
    this.transientFooter = msg;
    if (this.transientFooterClear) clearTimeout(this.transientFooterClear);
    this.transientFooterClear = setTimeout(() => {
      this.transientFooter = null;
      this.transientFooterClear = null;
    }, 900);
  }

  private signalFeedbackLine(d: Drawer): string {
    const rel = d.signalProfile.relevance01;
    const risk = 1 - d.signalProfile.safety01;
    const relL = rel >= 0.55 ? "high rel" : rel >= 0.35 ? "med rel" : "low rel";
    const riskL =
      risk >= 0.55 ? "high risk" : risk >= 0.35 ? "med risk" : "low risk";
    return `${relL}, ${riskL}`;
  }

  private pickableTaskAt(x: number, y: number): number | null {
    const taskIdx = taskCardAt(this.round.drawers, x, y);
    if (taskIdx === null) return null;
    if (this.agentsRemaining <= 0) return null;
    if (this.revealedTasks.has(taskIdx as DrawerIndex)) return null;
    return taskIdx;
  }

  private pickTask(taskIdx: number): void {
    if (this.phase.kind !== "pick") return;
    const drawer = this.round.drawers[taskIdx] as Drawer | undefined;
    if (!drawer) return;
    if (this.revealedTasks.has(drawer.index)) {
      sfxErrandReject();
      this.flashTransientFooter("That task was already picked.");
      return;
    }
    if (this.agentsRemaining <= 0) {
      sfxErrandReject();
      this.flashTransientFooter("No agents left. Check the result.");
      return;
    }

    const helper = this.helpers[this.playerPicks] as Helper | undefined;
    if (helper) {
      helper.drawerAssigned = drawer.index;
      helper.fillProgress = 1;
      helper.state = drawer.content === "trap" ? "lost" : "returning";
      helper.result = drawer.content === "clue" ? "clue" : null;
    }

    this.revealedTasks.set(drawer.index, drawer.content);
    this.playerPicks += 1;
    this.agentsRemaining -= 1;
    this.hoverTaskIdx = null;

    if (drawer.content === "trap") {
      sfxErrandTrapPing();
      this.flashTransientFooter(
        `Trap: ${this.signalFeedbackLine(drawer)} — one agent lost.`,
      );
    } else {
      sfxErrandDispatch();
      if (drawer.content === "clue") {
        this.flashTransientFooter(`Clue: ${this.signalFeedbackLine(drawer)}`);
      } else {
        this.flashTransientFooter(
          `Noise: ${this.signalFeedbackLine(drawer)} — keep looking.`,
        );
      }
    }

    if (this.shouldShowResult()) {
      this.phase = { kind: "result", t: 0 };
    }
  }

  private totalClueTasks(): number {
    return this.round.drawers.filter((d) => d.content === "clue").length;
  }

  private clueCount(): number {
    let clues = 0;
    for (const outcome of this.revealedTasks.values()) {
      if (outcome === "clue") clues++;
    }
    return clues;
  }

  private trapCount(): number {
    let traps = 0;
    for (const outcome of this.revealedTasks.values()) {
      if (outcome === "trap") traps++;
    }
    return traps;
  }

  private resultTotals(): {
    clues: number;
    helpersSafe: number;
    helpersLost: number;
  } {
    const helpersLost = this.trapCount();
    return {
      clues: this.clueCount(),
      helpersSafe: ERRAND_NUM_HELPERS - helpersLost,
      helpersLost,
    };
  }

  private shouldShowResult(): boolean {
    return (
      this.agentsRemaining <= 0 || this.clueCount() >= this.totalClueTasks()
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
          this.phase = { kind: "pick", t: 0 };
        }
        break;
      }
      case "pick": {
        this.phase = { kind: "pick", t: this.phase.t + dtSec };
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

  private finalizeOutcome(): void {
    if (this.outcome) return;
    const totals = this.resultTotals();
    const score = scoreErrandRun(totals);
    if (totals.clues === 0) {
      this.onExit();
      return;
    }
    if (!errandEarnsDeskClue(totals.clues, this.trapCount())) {
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
    // Light page background
    ctx.fillStyle = "#eceae3";
    ctx.fillRect(0, 0, W, H);

    // Title strip
    ctx.fillStyle = CURSOR_AI.ink;
    ctx.font = "700 12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Cursor Agents", 18, 26);
    ctx.fillStyle = CURSOR_AI.inkSubtle;
    ctx.font = "11px 'Cursor Mono', ui-monospace, monospace";
    ctx.fillText("· task triage", 110, 26);

    drawTasksCard(
      ctx,
      this.round.drawers,
      this.revealedTasks,
      this.phase.kind === "pick" ? this.hoverTaskIdx : null,
      this.agentsRemaining,
    );
    drawAgentsCard(
      ctx,
      this.agentsRemaining,
      this.playerPicks,
      this.clueCount(),
      this.trapCount(),
    );

    // Footer status text
    const phaseText = this.phaseFooterText();
    if (phaseText) {
      ctx.fillStyle = CURSOR_AI.inkSubtle;
      ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(phaseText, W / 2, H - 10);
      ctx.textAlign = "left";
    }

    // Phase overlays
    if (this.phase.kind === "intro") {
      drawErrandIntro(ctx, W, H, this.phase.t / INTRO_DURATION_S);
    } else if (this.phase.kind === "result") {
      const totals = this.resultTotals();
      const score = scoreErrandRun(totals);
      drawErrandResult(ctx, W, H, totals, score);
    }

    drawDeskChromeAi(ctx);
    this.gate.draw(ctx, W, H);
    this.blit();
  }

  private phaseFooterText(): string | null {
    if (this.transientFooter) return this.transientFooter;
    switch (this.phase.kind) {
      case "pick":
        return "read rel / risk on each card · 2 clues or 1 clue with no trap locks evidence";
      case "result":
        return this.clueCount() > 0
          ? "evidence word locked · click to close"
          : "no clue found · click to close";
      default:
        return null;
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
