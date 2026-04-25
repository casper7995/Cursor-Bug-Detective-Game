/** Errand Race — desk mini, restyled as a Cursor Agents queue. */

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
  canAssignHelper,
  errandEarnsDeskClue,
  namespacedSeed,
  nudgeSignalsAfterInspect,
  scoreErrandRun,
} from "./round";
import {
  ERRAND_NUM_HELPERS,
  ERRAND_TRIPWIRE_ABORT_S,
  type Drawer,
  type DrawerIndex,
  type ErrandRound,
  type Helper,
  type HelperIndex,
  type InterventionKind,
  type TaskSignalProfile,
} from "./types";
import {
  agentRowAt,
  drawAgentsCard,
  drawErrandIntro,
  drawErrandResult,
  drawErrandTutorialDiagram,
  drawTasksCard,
  hitWatchIntervention,
  taskCardAt,
} from "./draw";
import { clueTokenForErrand } from "./clueTokens";
import {
  sfxErrandAlertChoice,
  sfxErrandDispatch,
  sfxErrandGrab,
  sfxErrandReject,
  sfxErrandTrapPing,
} from "../../audio/audio";

const W = RUNNER_DRAW.canvasW;
const H = RUNNER_DRAW.canvasH;

const INTRO_DURATION_S = 1.35;
const DISPATCH_TIMEOUT_S = 6.0;
const WATCH_CAP_S = 18.0;
const RETURN_DURATION_S = 1.6;
const RESULT_AUTOCLOSE_S = 3.2;

export interface ErrandSessionOpts {
  readonly overlayCtx: CanvasRenderingContext2D;
  readonly getOverlayViewport: () => { cssW: number; cssH: number };
  readonly clueWord: string;
  readonly onExit: () => void;
}

type Phase =
  | { kind: "intro"; t: number }
  | { kind: "dispatch"; t: number }
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
  /** How many times the player manually dispatched (excludes auto-fill). */
  private playerDispatched = 0;
  private nudgedTaskSignals = new Map<DrawerIndex, TaskSignalProfile>();
  private triagePointerHover: ReturnType<typeof hitWatchIntervention> = null;
  private agentRowHover: number | null = null;
  /** Brief footer hint after an invalid drop. */
  private transientFooter: string | null = null;
  private transientFooterClear: ReturnType<typeof setTimeout> | null = null;
  private trapPinged = new Set<HelperIndex>();
  private readonly gate = new TutorialGate({
    title: "Cursor Agents — dispatch queue",
    tagline: "Drag agents onto task cards. Read the icons.",
    howToLines: [
      "Each agent runs one task at a time (pace: fast / steady / careful).",
      "Drag a ready row, or press 1–5 to assign the next free agent to that task.",
      "On each live task: in (inspect) / off (abort) / run (hurry, or tripwire bet).",
      "Cup / key often align with clues. ⚠ tasks can trip; auto-abort if you wait too long.",
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
      this.pointerX = p.x;
      this.pointerY = p.y;
      stopTutorialPropagation(this.gate.handlePointer(p.x, p.y, W, H) !== null);
    };
    const move = (e: PointerEvent): void => {
      const p = this.gameFromClient(e.clientX, e.clientY);
      this.pointerX = p.x;
      this.pointerY = p.y;
      if (this.outcome || this.gate.isBlocking()) {
        this.triagePointerHover = null;
        this.agentRowHover = null;
        return;
      }
      if (this.phase.kind === "watch") {
        this.triagePointerHover = hitWatchIntervention(
          this.round.drawers,
          this.helpers,
          p.x,
          p.y,
        );
      } else {
        this.triagePointerHover = null;
      }
      if (this.phase.kind === "dispatch" || this.phase.kind === "watch") {
        this.agentRowHover = agentRowAt(this.helpers, p.x, p.y);
      } else {
        this.agentRowHover = null;
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
      if (this.phase.kind === "watch") {
        const tri = hitWatchIntervention(
          this.round.drawers,
          this.helpers,
          p.x,
          p.y,
        );
        if (tri) {
          this.applyIntervention(tri);
          e.preventDefault();
          return;
        }
      }
      if (this.phase.kind === "dispatch") {
        // Grab a waiting agent from its row.
        const idx = agentRowAt(this.helpers, p.x, p.y);
        if (idx !== null) {
          const helper = this.helpers[idx];
          if (helper && helper.state === "waiting") {
            sfxErrandGrab();
            this.grabbedHelper = idx as HelperIndex;
            try {
              root.setPointerCapture(e.pointerId);
            } catch {
              /* ignore — host may not support capture on this target */
            }
          }
        }
      }
    };
    const finishGrab = (e: PointerEvent): void => {
      const p = this.gameFromClient(e.clientX, e.clientY);
      this.pointerX = p.x;
      this.pointerY = p.y;
      if (this.grabbedHelper !== null) {
        try {
          root.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        // Drop on a task card?
        const taskIdx = taskCardAt(this.round.drawers, p.x, p.y);
        if (taskIdx !== null) {
          if (
            canAssignHelper(this.helpers, this.grabbedHelper as number, taskIdx)
          ) {
            const helper = this.helpers[this.grabbedHelper] as Helper;
            helper.drawerAssigned = taskIdx as DrawerIndex;
            helper.state = "filling";
            helper.fillProgress = 0;
            if (this.phase.kind === "dispatch") this.playerDispatched += 1;
            sfxErrandDispatch();
          } else {
            sfxErrandReject();
            this.flashTransientFooter("That task already has an agent.");
          }
        }
        this.grabbedHelper = null;
      }
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointerup", finishGrab);
    root.addEventListener("pointercancel", finishGrab);
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
      if (this.phase.kind !== "dispatch") return;
      const m = /^Digit([1-5])$/.exec(e.code) ?? /^Numpad([1-5])$/.exec(e.code);
      if (!m) return;
      const taskIdx = Number.parseInt(m[1]!, 10) - 1;
      const free = this.helpers.findIndex((h) => h.state === "waiting");
      if (free < 0) return;
      if (!canAssignHelper(this.helpers, free, taskIdx)) {
        sfxErrandReject();
        this.flashTransientFooter("That task already has an agent.");
        e.preventDefault();
        return;
      }
      const helper = this.helpers[free] as Helper;
      helper.drawerAssigned = taskIdx as DrawerIndex;
      helper.state = "filling";
      helper.fillProgress = 0;
      this.playerDispatched += 1;
      sfxErrandDispatch();
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
      root.removeEventListener("pointerup", finishGrab);
      root.removeEventListener("pointercancel", finishGrab);
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

  /** While dragging, highlight the task under the pointer if this agent can take it. */
  private dropHighlightTaskIdx(): number | null {
    if (this.phase.kind !== "dispatch" || this.grabbedHelper === null)
      return null;
    const hi = this.grabbedHelper as number;
    const under = taskCardAt(this.round.drawers, this.pointerX, this.pointerY);
    if (under !== null && canAssignHelper(this.helpers, hi, under)) {
      return under;
    }
    return null;
  }

  private allHelpersAssigned(): boolean {
    return this.helpers.every((h) => h.drawerAssigned !== null);
  }

  private autoAssignRemaining(): void {
    for (const helper of this.helpers) {
      if (helper.drawerAssigned !== null) continue;
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

  private getDisplaySignal(taskIdx: number): TaskSignalProfile {
    const n = this.nudgedTaskSignals.get(taskIdx as DrawerIndex);
    if (n) return n;
    return (this.round.drawers[taskIdx] as Drawer).signalProfile;
  }

  private applyIntervention(k: {
    taskIdx: number;
    kind: InterventionKind;
  }): void {
    const helper = this.helpers.find((h) => h.drawerAssigned === k.taskIdx) as
      | Helper
      | undefined;
    if (!helper || (helper.state !== "filling" && helper.state !== "alert")) {
      return;
    }
    const drawer = this.round.drawers[k.taskIdx] as Drawer;
    if (k.kind === "inspect") {
      if (this.nudgedTaskSignals.has(k.taskIdx as DrawerIndex)) return;
      this.nudgedTaskSignals.set(
        k.taskIdx as DrawerIndex,
        nudgeSignalsAfterInspect(drawer.content, drawer.signalProfile),
      );
      return;
    }
    if (k.kind === "abort") {
      this.cancelOrAbort(helper, helper.state === "alert");
      return;
    }
    if (k.kind === "push") {
      if (helper.state === "alert") {
        this.resolvePushGamble(helper);
      } else {
        helper.fillProgress = Math.min(1, helper.fillProgress + 0.22);
        this.checkFillThresholds(helper);
      }
    }
  }

  private resolvePushGamble(helper: Helper): void {
    if (helper.state !== "alert" || helper.drawerAssigned === null) return;
    const d = this.round.drawers[helper.drawerAssigned] as Drawer;
    sfxErrandAlertChoice("push");
    if (d.trapPushIsClue) {
      helper.state = "returning";
      helper.result = "clue";
    } else {
      helper.state = "lost";
      helper.result = null;
    }
    this.alertedTrapHandled.add(helper.index);
  }

  private cancelOrAbort(helper: Helper, inTripwire: boolean): void {
    if (helper.drawerAssigned === null) return;
    if (inTripwire) {
      sfxErrandAlertChoice("abort");
    } else {
      sfxErrandReject();
    }
    helper.state = "returning";
    helper.result = null;
    this.alertedTrapHandled.add(helper.index);
  }

  private checkFillThresholds(helper: Helper): void {
    if (helper.state !== "filling" || helper.drawerAssigned === null) return;
    const drawer = this.round.drawers[helper.drawerAssigned] as Drawer;
    if (
      drawer.content === "trap" &&
      !this.alertedTrapHandled.has(helper.index) &&
      helper.fillProgress >= drawer.trapAlertAt01
    ) {
      if (!this.trapPinged.has(helper.index)) {
        this.trapPinged.add(helper.index);
        sfxErrandTrapPing();
      }
      helper.state = "alert";
      helper.tripwireT = 0;
      return;
    }
    if (helper.fillProgress >= 1) {
      helper.result = drawer.content === "clue" ? "clue" : null;
      helper.state = "returning";
    }
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
        if (this.allHelpersAssigned() || this.phase.t >= DISPATCH_TIMEOUT_S) {
          if (!this.allHelpersAssigned()) this.autoAssignRemaining();
          this.phase = { kind: "watch", t: 0 };
        }
        break;
      }
      case "watch": {
        this.phase = { kind: "watch", t: this.phase.t + dtSec };
        for (const helper of this.helpers) {
          if (helper.state !== "alert") continue;
          helper.tripwireT += dtSec;
          if (helper.tripwireT >= ERRAND_TRIPWIRE_ABORT_S) {
            this.cancelOrAbort(helper, true);
          }
        }
        this.advanceFillers(dtSec);
        if (this.allHelpersDone() || this.phase.t >= WATCH_CAP_S) {
          this.phase = { kind: "return", t: 0 };
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

  private advanceFillers(dtSec: number): void {
    for (const helper of this.helpers) {
      if (helper.state !== "filling") continue;
      if (helper.drawerAssigned === null) continue;
      const drawer = this.round.drawers[helper.drawerAssigned] as Drawer;
      const effMs = drawer.fillRateMs * helper.trait.paceScale;
      const inc = (dtSec * 1000) / effMs;
      helper.fillProgress = Math.min(1, helper.fillProgress + inc);
      this.checkFillThresholds(helper);
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
      this.onExit();
      return;
    }
    if (!errandEarnsDeskClue(this.playerDispatched, clues)) {
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
    ctx.fillText("· dispatch queue", 110, 26);

    const watchTriage =
      this.phase.kind === "watch" && this.gate.isBlocking() === false
        ? {
            getDisplaySignal: (i: number) => this.getDisplaySignal(i),
            watchMode: true,
            watchHover: this.triagePointerHover,
            inspectUsed: (i: number) =>
              this.nudgedTaskSignals.has(i as DrawerIndex),
          }
        : null;
    drawTasksCard(
      ctx,
      this.round.drawers,
      this.helpers,
      this.dropHighlightTaskIdx(),
      watchTriage,
    );
    drawAgentsCard(
      ctx,
      this.helpers,
      this.round.drawers,
      this.grabbedHelper,
      this.agentRowHover,
      this.pointerX,
      this.pointerY,
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
      drawErrandResult(
        ctx,
        W,
        H,
        { clues, helpersSafe: safe, helpersLost: lost },
        score,
      );
    }

    drawDeskChromeAi(ctx);
    this.gate.draw(ctx, W, H);
    this.blit();
  }

  private phaseFooterText(): string | null {
    if (this.transientFooter) return this.transientFooter;
    switch (this.phase.kind) {
      case "dispatch":
        return `drag agents onto tasks (or keys 1–5) · auto-dispatch in ${Math.max(
          0,
          Math.ceil(DISPATCH_TIMEOUT_S - this.phase.t),
        )}s if you stall`;
      case "watch":
        return "agents running · ⚠ tasks may ping for review";
      case "return":
        return "agents reporting back…";
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
