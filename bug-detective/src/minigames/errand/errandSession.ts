/** Cursor Agents lane defense — desk mini (notebook slot `errand`). */

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
  createLaneDefenseRuntime,
  laneDefenseDeployBlockReason,
  laneDefenseDeployToLane,
  laneDefenseDeskScore,
  laneDefensePromoteAgent,
  namespacedSeed,
  pickedAgent,
  queueHead,
  stepLaneDefenseRuntime,
  type LaneDefenseRuntime,
} from "./round";
import {
  drawErrandIntro,
  drawErrandResult,
  drawLaneDefenseField,
  drawErrandTutorialDiagram,
  hitLaneDefenseLane,
  hitLaneDefenseQueueKind,
} from "./draw";
import { AGENT_TRAY, type AgentKind, type LaneIndex } from "./types";
import { clueTokenForErrand } from "./clueTokens";
import {
  sfxErrandDispatch,
  sfxErrandGrab,
  sfxErrandReject,
  sfxErrandTrapPing,
} from "../../audio/audio";

const W = RUNNER_DRAW.canvasW;
const H = RUNNER_DRAW.canvasH;

const INTRO_DURATION_S = 1.55;

export interface ErrandSessionOpts {
  readonly overlayCtx: CanvasRenderingContext2D;
  readonly getOverlayViewport: () => { cssW: number; cssH: number };
  readonly clueWord: string;
  readonly onExit: () => void;
}

type Phase =
  | { kind: "intro"; t: number }
  | { kind: "play" }
  | { kind: "defeat"; t: number };

export class ErrandSession {
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly getOverlayViewport: () => { cssW: number; cssH: number };
  private readonly onExit: () => void;
  private readonly renderCtx: CanvasRenderingContext2D;
  private readonly clueWord: string;
  private rt: LaneDefenseRuntime;
  private phase: Phase = { kind: "intro", t: 0 };
  private outcome: MiniGameOutcome | null = null;
  private pointerBound = false;
  private hoverQueue: AgentKind | null = null;
  private hoverLane: LaneIndex | null = null;
  /** Brief lane row highlight after 1/2/3 */
  private keyLaneFlash: LaneIndex | null = null;
  private keyLaneFlashT = 0;
  private transientFooter: string | null = null;
  private transientFooterClear: ReturnType<typeof setTimeout> | null = null;

  private readonly gate = new TutorialGate({
    title: "Cursor Agents — lane defense",
    tagline:
      "Hold three lanes against inbound defects—including Zero-Day bosses.",
    howToLines: [
      "Q / W / E pick a hero (Fixer / Reviewer / Firewall).",
      "1 / 2 / 3 deploy that hero to top / mid / bottom lane.",
      "Fixer = cheap, long uptime, steady beam. Reviewer = slow + chip. Firewall = burst nuke, short uptime.",
      "Spend FOCUS on heroes; READY ring = available, WAIT = recharging.",
      "Clue secures at wave 3 or 60s survived; then X / Esc pins the cipher.",
    ],
    diagramHeight: 84,
    drawDiagram: drawErrandTutorialDiagram,
    storageKey: "bd:miniTutorial:errand",
  });

  constructor(opts: ErrandSessionOpts) {
    this.overlayCtx = opts.overlayCtx;
    this.getOverlayViewport = opts.getOverlayViewport;
    this.onExit = opts.onExit;
    this.clueWord = opts.clueWord;
    const seed = namespacedSeed(0xa0b1c2d3, `errand:${opts.clueWord}`);
    this.rt = createLaneDefenseRuntime(seed);
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

  private flashFooter(msg: string, clearMs = 900): void {
    this.transientFooter = msg;
    if (this.transientFooterClear) clearTimeout(this.transientFooterClear);
    this.transientFooterClear = setTimeout(() => {
      this.transientFooter = null;
      this.transientFooterClear = null;
    }, clearMs);
  }

  /** @returns true when deploy succeeded (launch FX + spend). */
  private deployLane(laneHit: LaneIndex): boolean {
    const block = laneDefenseDeployBlockReason(this.rt, laneHit);
    if (block !== "none") {
      sfxErrandReject();
      const picked = pickedAgent(this.rt) ?? queueHead(this.rt);
      const def = picked
        ? AGENT_TRAY.find((a) => a.kind === picked.kind)
        : undefined;
      if (block === "focus" && def) {
        this.flashFooter(
          `Need ${def.cost} FOCUS (have ${Math.floor(this.rt.focus)}) — wait or pick Fixer (Q).`,
          2200,
        );
      } else if (block === "recharging" && def) {
        const wait = Math.max(0, picked!.readyAt - this.rt.elapsed);
        this.flashFooter(
          `${def.label} recharging (${wait.toFixed(1)}s) — hold or pick Q/W/E.`,
          1800,
        );
      } else if (block === "no_head") {
        this.flashFooter("All heroes recharging — hold the line.", 1800);
      } else if (block === "field_cap") {
        this.flashFooter(
          "Max heroes on field — deploy into a lane to swap.",
          2000,
        );
      }
      return false;
    }
    const next = laneDefenseDeployToLane(this.rt, laneHit);
    if (next === this.rt) return false;
    this.rt = next;
    sfxErrandDispatch();
    const placed = this.rt.placed.find((p) => p.lane === laneHit)!;
    const def = AGENT_TRAY.find((a) => a.kind === placed.kind)!;
    const laneName = ["top", "mid", "bottom"][laneHit]!;
    this.flashFooter(
      `${def.label} deployed (${laneName}) — works front bug until uptime ends.`,
      1600,
    );
    return true;
  }

  attachPointer(root: HTMLElement): void {
    if (this.pointerBound) return;
    this.pointerBound = true;
    const routeTutorialPointer = (clientX: number, clientY: number): void => {
      if (!this.gate.isBlocking()) return;
      const p = this.gameFromClient(clientX, clientY);
      this.gate.handlePointer(p.x, p.y, W, H);
    };
    const move = (e: PointerEvent): void => {
      const p = this.gameFromClient(e.clientX, e.clientY);
      if (this.outcome || this.gate.isBlocking()) {
        this.hoverQueue = null;
        this.hoverLane = null;
        return;
      }
      if (this.phase.kind !== "play") {
        this.hoverQueue = null;
        this.hoverLane = null;
        return;
      }
      this.hoverQueue = hitLaneDefenseQueueKind(p.x, p.y, this.rt);
      this.hoverLane = hitLaneDefenseLane(p.x, p.y);
    };
    const down = (e: PointerEvent): void => {
      const p = this.gameFromClient(e.clientX, e.clientY);
      if (this.outcome) return;
      if (this.gate.isBlocking()) {
        const action = this.gate.handlePointer(p.x, p.y, W, H);
        if (action !== null) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      // Defeat must run before close-button handling so X / backdrop clicks
      // pin notebook cipher when clueLocked (Escape shares this path).
      if (this.phase.kind === "defeat") {
        this.finalizeDefeatOutcome();
        return;
      }
      if (hitDeskCloseButton(p.x, p.y)) {
        if (this.phase.kind === "play" && this.rt.clueLocked) {
          this.pinClueOutcomeAndEnd();
        } else {
          this.onExit();
        }
        return;
      }
      if (hitDeskHelpButton(p.x, p.y, W)) {
        this.gate.reopen();
        return;
      }
      if (this.phase.kind !== "play") return;

      const queueHit = hitLaneDefenseQueueKind(p.x, p.y, this.rt);
      if (queueHit !== null) {
        this.rt = laneDefensePromoteAgent(this.rt, queueHit);
        const label = AGENT_TRAY.find((a) => a.kind === queueHit)!.label;
        sfxErrandGrab();
        this.flashFooter(`${label} promoted to head.`);
        return;
      }

      const laneHit = hitLaneDefenseLane(p.x, p.y);
      if (laneHit !== null) {
        void this.deployLane(laneHit);
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
        if (this.phase.kind === "defeat") {
          this.finalizeDefeatOutcome();
          e.preventDefault();
          return;
        }
        if (this.phase.kind === "play" && this.rt.clueLocked) {
          this.pinClueOutcomeAndEnd();
          e.preventDefault();
          return;
        }
        this.onExit();
        return;
      }
      if (this.gate.isBlocking() || this.outcome) return;
      if (this.phase.kind === "defeat") {
        if (e.code === "Enter" || e.code === "Space") {
          this.finalizeDefeatOutcome();
          e.preventDefault();
        }
        return;
      }
      if (this.phase.kind !== "play") return;
      // Split mapping (per user request): Q/W/E pick the hero, 1/2/3 deploy
      // to the chosen lane. Numpad mirrors digit keys for laptop / numpad
      // users; the previous "any of these → deploy this lane" combined
      // mapping was confusing once heroes had distinct cooldowns.
      const heroKeys: Record<string, AgentKind> = {
        KeyQ: "fixer",
        KeyW: "reviewer",
        KeyE: "firewall",
      };
      const heroPick = heroKeys[e.code];
      if (heroPick !== undefined) {
        const before = pickedAgent(this.rt)?.kind ?? null;
        this.rt = laneDefensePromoteAgent(this.rt, heroPick);
        const def = AGENT_TRAY.find((a) => a.kind === heroPick)!;
        const entry = this.rt.queue.find((q) => q.kind === heroPick)!;
        const ready = entry.readyAt <= this.rt.elapsed;
        if (before !== heroPick) {
          sfxErrandGrab();
          if (ready) {
            this.flashFooter(`${def.label} selected — press 1/2/3 to deploy.`);
          } else {
            const wait = Math.max(0, entry.readyAt - this.rt.elapsed);
            this.flashFooter(
              `${def.label} selected — recharging (${wait.toFixed(1)}s).`,
              1600,
            );
          }
        }
        e.preventDefault();
        return;
      }
      const laneKeys: Record<string, LaneIndex> = {
        Digit1: 0,
        Digit2: 1,
        Digit3: 2,
        Numpad1: 0,
        Numpad2: 1,
        Numpad3: 2,
      };
      const laneIdx = laneKeys[e.code];
      if (laneIdx !== undefined) {
        if (this.deployLane(laneIdx)) {
          this.keyLaneFlash = laneIdx;
          this.keyLaneFlashT = 0.28;
        }
        e.preventDefault();
      }
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

  step(dtSec: number): void {
    if (this.gate.isBlocking()) {
      this.draw();
      return;
    }
    switch (this.phase.kind) {
      case "intro": {
        const t = this.phase.t + dtSec;
        if (t >= INTRO_DURATION_S) this.phase = { kind: "play" };
        else this.phase = { kind: "intro", t };
        break;
      }
      case "play": {
        this.keyLaneFlashT = Math.max(0, this.keyLaneFlashT - dtSec);
        if (this.keyLaneFlashT <= 0) this.keyLaneFlash = null;
        const prevHp = this.rt.baseHealth;
        this.rt = stepLaneDefenseRuntime(this.rt, dtSec);
        if (this.rt.baseHealth < prevHp) sfxErrandTrapPing();
        if (this.rt.defeated) {
          this.phase = { kind: "defeat", t: 0 };
          sfxErrandTrapPing();
        }
        break;
      }
      case "defeat": {
        // Hold the defeat result on screen until the player clicks; the
        // pointer handler below calls finalizeDefeatOutcome() on click.
        this.phase = { kind: "defeat", t: this.phase.t + dtSec };
        break;
      }
      default: {
        const _: never = this.phase;
        void _;
      }
    }
    this.draw();
  }

  private pinClueOutcomeAndEnd(): void {
    if (this.outcome) return;
    if (!this.rt.clueLocked) {
      this.onExit();
      return;
    }
    this.outcome = {
      clueToken: clueTokenForErrand(this.clueWord),
      score: laneDefenseDeskScore(this.rt),
    };
  }

  private finalizeDefeatOutcome(): void {
    if (this.outcome) return;
    if (!this.rt.defeated) return;
    if (!this.rt.clueLocked) {
      this.onExit();
      return;
    }
    this.outcome = {
      clueToken: clueTokenForErrand(this.clueWord),
      score: laneDefenseDeskScore(this.rt),
    };
  }

  private draw(): void {
    const ctx = this.renderCtx;
    ctx.fillStyle = "#eceae3";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = CURSOR_AI.ink;
    ctx.font = "700 12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Cursor Agents", 18, 26);
    ctx.fillStyle = CURSOR_AI.inkSubtle;
    ctx.font = "11px 'Cursor Mono', ui-monospace, monospace";
    ctx.fillText("· lane defense", 110, 26);

    if (this.phase.kind === "play" || this.phase.kind === "defeat") {
      const laneHi =
        this.hoverLane ?? (this.keyLaneFlashT > 0 ? this.keyLaneFlash : null);
      drawLaneDefenseField(ctx, this.rt, {
        queue: this.hoverQueue,
        lane: laneHi,
      });
    }

    const footer = this.phaseFooterText();
    if (footer) {
      ctx.fillStyle = CURSOR_AI.inkSubtle;
      ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(footer, W / 2, H - 10);
      ctx.textAlign = "left";
    }

    if (this.phase.kind === "intro") {
      drawErrandIntro(ctx, W, H, this.phase.t / INTRO_DURATION_S);
    } else if (this.phase.kind === "defeat") {
      drawErrandResult(ctx, W, H, {
        deskScore: laneDefenseDeskScore(this.rt),
        clueLocked: this.rt.clueLocked,
        wavesFinished: this.rt.wavesFinished,
        bossesDefeated: this.rt.bossesDefeated,
        elapsedSec: this.rt.elapsed,
        bugsKilled: this.rt.bugsKilled,
        focusSpent: this.rt.focusSpent,
      });
    }

    drawDeskChromeAi(ctx);
    this.gate.draw(ctx, W, H);
    this.blit();
  }

  private phaseFooterText(): string | null {
    if (this.transientFooter) return this.transientFooter;
    switch (this.phase.kind) {
      case "play":
        if (this.rt.clueLocked) {
          return "CLUE SECURED · X / Esc pins cipher · keep redeploying before uptime ends";
        }
        return "Q/W/E pick hero · 1/2/3 deploy lane · FOCUS ≥ card · Esc exit";
      case "defeat":
        return this.rt.clueLocked
          ? "cipher pins on click / Space / Enter / Esc"
          : "clue not secured · Esc — exit without cipher";
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
