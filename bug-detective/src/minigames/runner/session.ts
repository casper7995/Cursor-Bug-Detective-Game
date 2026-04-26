import type { AnomalyId } from "../../scene/anomalies";
import {
  sfxRunnerBoostPulse,
  sfxRunnerCluePing,
  sfxRunnerFloorChime,
  sfxRunnerJump,
  sfxRunnerLand,
  sfxWrong,
} from "../../audio/audio";
import { drawRunnerFrame } from "./draw";
import type { RunnerClueSet } from "./clueTokens";
import {
  createRunnerSimWithSeed,
  DEFAULT_DAILY_GOAL_SCROLL,
  type RunnerSimConfig,
  type RunnerSimState,
  stepRunnerSim,
  RUNNER_DRAW,
} from "./sim";
import type { RunnerMode, RunnerRunOutcome } from "./types";

const DEFAULT_CFG: RunnerSimConfig = {
  canvasW: RUNNER_DRAW.canvasW,
  canvasH: RUNNER_DRAW.canvasH,
  dailyGoalDistance: DEFAULT_DAILY_GOAL_SCROLL,
};

const TIER_RIBBON_MS = 1200;

export interface RunnerSessionOptions {
  readonly baseSeed: number;
  readonly mode: RunnerMode;
  readonly THREE: typeof import("three");
  /** Fullscreen overlay context (may be larger than logical game). */
  readonly overlayCtx: CanvasRenderingContext2D;
  /** CSS-pixel viewport for letterboxing. */
  readonly getOverlayViewport: () => { cssW: number; cssH: number };
  /** When false, skip updating the monitor mesh texture (overlay fully visible). */
  readonly shouldUpdateMonitorTexture: () => boolean;
  readonly cfg?: RunnerSimConfig;
  readonly clueSet: RunnerClueSet;
  readonly anomalyId: AnomalyId;
  /** Same text as hover tooltip on the bug prop — shown in runner HUD. */
  readonly clueTooltipHint: string;
}

export class RunnerSession {
  private sim: RunnerSimState;
  private readonly renderCtx: CanvasRenderingContext2D;
  private readonly texture: import("three").CanvasTexture;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly getOverlayViewport: () => { cssW: number; cssH: number };
  private readonly shouldUpdateMonitorTexture: () => boolean;
  private readonly cfg: RunnerSimConfig;
  private readonly clueSet: RunnerClueSet;
  private readonly anomalyId: AnomalyId;
  private readonly clueTooltipHint: string;
  readonly mode: RunnerMode;
  private baseSeed: number;
  private runIndex = 0;
  private outcome: RunnerRunOutcome | null = null;
  private gameOver = false;
  private failureAnimMs = 0;
  private playedFailSfx = false;
  private lastTierRibbonFloor = 0;
  private tierRibbon: { tier: number; ageMs: number } | null = null;
  private readonly seenClueTokens = new Set<string>();
  private readonly onClueTokenSeenBound = (token: string): void => {
    const before = this.seenClueTokens.size;
    this.seenClueTokens.add(token);
    if (this.seenClueTokens.size > before) sfxRunnerCluePing();
  };

  constructor(opts: RunnerSessionOptions) {
    const {
      baseSeed,
      mode,
      THREE,
      overlayCtx,
      getOverlayViewport,
      shouldUpdateMonitorTexture,
      cfg = DEFAULT_CFG,
      clueSet,
      anomalyId,
      clueTooltipHint,
    } = opts;
    this.mode = mode;
    this.baseSeed = baseSeed;
    this.anomalyId = anomalyId;
    this.clueTooltipHint = clueTooltipHint;
    this.overlayCtx = overlayCtx;
    this.getOverlayViewport = getOverlayViewport;
    this.shouldUpdateMonitorTexture = shouldUpdateMonitorTexture;
    this.cfg = cfg;
    this.clueSet = clueSet;

    const c = document.createElement("canvas");
    c.width = cfg.canvasW;
    c.height = cfg.canvasH;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.renderCtx = ctx;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.texture = tex;

    this.sim = createRunnerSimWithSeed(this.getRunSeed(), mode, cfg, anomalyId);
  }

  private getRunSeed(): number {
    return (this.baseSeed + this.runIndex * 0x9e3779b9) >>> 0;
  }

  getTexture(): import("three").CanvasTexture {
    return this.texture;
  }

  isGameOver(): boolean {
    return this.gameOver;
  }

  getDeathDistance(): number {
    return this.sim.maxScroll;
  }

  getPeakHeightM(): number {
    return this.sim.maxClimbM;
  }

  getSeenClueList(): readonly string[] {
    return [...this.seenClueTokens].sort();
  }

  getRunProgress01(): number {
    if (this.mode !== "daily") return 0;
    return Math.min(1, this.sim.scroll / this.cfg.dailyGoalDistance);
  }

  getBoostPercent(): number {
    return Math.round(this.sim.boost01 * 100);
  }

  /** Daily goal distance reached: clue pins; run may continue past the line. */
  isDailyCleared(): boolean {
    return this.mode === "daily" && this.sim.dailyLineCrossed && !this.gameOver;
  }

  /** New course, same mode; clears game over. */
  restartSameMode(): void {
    this.gameOver = false;
    this.failureAnimMs = 0;
    this.playedFailSfx = false;
    this.lastTierRibbonFloor = 0;
    this.tierRibbon = null;
    this.outcome = null;
    this.seenClueTokens.clear();
    this.runIndex += 1;
    this.sim = createRunnerSimWithSeed(
      this.getRunSeed(),
      this.mode,
      this.cfg,
      this.anomalyId,
    );
  }

  /** Endless: exit with score. Daily: mark fail exit. */
  exitFromGameOverToDesktop(): void {
    if (this.mode === "endless") {
      this.outcome = {
        kind: "endless_stop",
        score: Math.floor(this.sim.maxClimbM),
      };
    } else {
      this.outcome = { kind: "daily_fail" };
    }
  }

  step(dtSec: number, wantJump: boolean, wantBoost: boolean): void {
    if (this.outcome) return;

    if (!this.gameOver) {
      const wasGrounded = this.sim.grounded;
      const boostBefore = this.sim.boost01;
      this.sim = stepRunnerSim(this.sim, dtSec, wantJump, wantBoost, this.cfg);
      // Jump applies JUMP_V0 then gravity in the same step, so vy is never
      // exactly JUMP_V0 after step — detect an actual impulse (upward vy).
      if (wantJump && wasGrounded && this.sim.playerVy < 0) {
        sfxRunnerJump();
      }
      if (!wasGrounded && this.sim.grounded) sfxRunnerLand();
      if (wantBoost && boostBefore > this.sim.boost01 + 0.002)
        sfxRunnerBoostPulse();
      if (this.sim.failed) {
        this.gameOver = true;
        this.failureAnimMs = 0;
        if (!this.playedFailSfx) {
          this.playedFailSfx = true;
          sfxWrong();
        }
      } else {
        const floorM = Math.floor(this.sim.maxClimbM / 100);
        if (floorM > this.lastTierRibbonFloor) {
          this.lastTierRibbonFloor = floorM;
          this.tierRibbon = { tier: floorM, ageMs: 0 };
          sfxRunnerFloorChime(floorM);
        }
      }
    } else {
      this.failureAnimMs += dtSec * 1000;
    }

    if (this.tierRibbon) {
      this.tierRibbon = {
        tier: this.tierRibbon.tier,
        ageMs: this.tierRibbon.ageMs + dtSec * 1000,
      };
      if (this.tierRibbon.ageMs >= TIER_RIBBON_MS) this.tierRibbon = null;
    }

    const modeLabel =
      this.mode === "daily" ? "code run — daily" : "code run — endless";

    const baseDraw = {
      scroll: this.sim.scroll,
      playerY: this.sim.playerY,
      planks: this.sim.planks,
      modeLabel,
      grounded: this.sim.grounded,
      elapsedMs: this.sim.elapsedMs,
      maxClimbM: this.sim.maxClimbM,
      boost01: this.sim.boost01,
      clueSet: this.clueSet,
      onClueTokenSeen: this.onClueTokenSeenBound,
      anomalyId: this.anomalyId,
      clueTooltipHint: this.clueTooltipHint,
      projectiles: this.sim.projectiles,
      dailyCleared: this.isDailyCleared(),
      ...(this.mode === "daily"
        ? { dailyGoalScroll: this.cfg.dailyGoalDistance }
        : {}),
    };
    const tierRibbon =
      this.tierRibbon &&
      this.tierRibbon.ageMs < TIER_RIBBON_MS &&
      this.tierRibbon.tier > 0
        ? this.tierRibbon
        : undefined;

    const ribbonOpt = tierRibbon ? { tierRibbon } : {};

    if (this.gameOver && !this.outcome) {
      drawRunnerFrame(this.renderCtx, {
        ...baseDraw,
        ...ribbonOpt,
        gameOver: {
          peakHeightM: this.sim.maxClimbM,
          cluesSeen: this.getSeenClueList(),
          mode: this.mode,
          failureAnimMs: this.failureAnimMs,
        },
      });
    } else {
      drawRunnerFrame(this.renderCtx, { ...baseDraw, ...ribbonOpt });
    }

    if (this.shouldUpdateMonitorTexture()) {
      this.texture.needsUpdate = true;
    }

    this.blitToOverlay();
  }

  private blitToOverlay(): void {
    const { cssW, cssH } = this.getOverlayViewport();
    const octx = this.overlayCtx;
    const cw = octx.canvas.width;
    const ch = octx.canvas.height;
    const dpr = cw / Math.max(cssW, 1);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, cw, ch);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Full-viewport “arcade monitor” shell so letterbox gutters are intentional,
    // not empty black bars (gameplay canvas stays 512×320).
    const stageTop = "#0f0d0a";
    const stageBot = "#050403";
    const g = octx.createLinearGradient(0, 0, 0, cssH);
    g.addColorStop(0, stageTop);
    g.addColorStop(0.55, "#12100c");
    g.addColorStop(1, stageBot);
    octx.fillStyle = g;
    octx.fillRect(0, 0, cssW, cssH);
    octx.strokeStyle = "rgba(245,78,0,0.045)";
    octx.lineWidth = 1;
    for (let x = 0; x <= cssW; x += 28) {
      octx.beginPath();
      octx.moveTo(x, 0);
      octx.lineTo(x, cssH);
      octx.stroke();
    }
    for (let y = 0; y <= cssH; y += 28) {
      octx.beginPath();
      octx.moveTo(0, y);
      octx.lineTo(cssW, y);
      octx.stroke();
    }

    const scale = Math.min(
      cssW / RUNNER_DRAW.canvasW,
      cssH / RUNNER_DRAW.canvasH,
    );
    const dw = RUNNER_DRAW.canvasW * scale;
    const dh = RUNNER_DRAW.canvasH * scale;
    const dx = (cssW - dw) / 2;
    const dy = (cssH - dh) / 2;
    const bezel = 4;
    const rx = dx - bezel;
    const ry = dy - bezel;
    const rw = dw + bezel * 2;
    const rh = dh + bezel * 2;
    octx.save();
    octx.shadowColor = "rgba(245, 78, 0, 0.22)";
    octx.shadowBlur = 28;
    octx.fillStyle = "rgba(12, 10, 8, 0.55)";
    octx.beginPath();
    octx.roundRect(rx, ry, rw, rh, 10);
    octx.fill();
    octx.restore();
    octx.strokeStyle = "rgba(192, 133, 50, 0.45)";
    octx.lineWidth = 2;
    octx.beginPath();
    octx.roundRect(rx, ry, rw, rh, 10);
    octx.stroke();
    octx.drawImage(this.renderCtx.canvas, dx, dy, dw, dh);
  }

  getOutcome(): RunnerRunOutcome | null {
    return this.outcome;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
