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
  type RunnerSimConfig,
  type RunnerSimState,
  stepRunnerSim,
  RUNNER_DRAW,
} from "./sim";
import type { RunnerMode, RunnerRunOutcome } from "./types";

const DEFAULT_CFG: RunnerSimConfig = {
  canvasW: RUNNER_DRAW.canvasW,
  canvasH: RUNNER_DRAW.canvasH,
  dailyGoalDistance: 2600,
};

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

  step(
    dtSec: number,
    wantJump: boolean,
    wantBoost: boolean,
    gameOverUi?: {
      restartProgress01: number;
    },
  ): void {
    if (this.outcome) return;

    if (!this.gameOver) {
      const wasGrounded = this.sim.grounded;
      const boostBefore = this.sim.boost01;
      this.sim = stepRunnerSim(this.sim, dtSec, wantJump, wantBoost, this.cfg);
      if (wasGrounded && wantJump) sfxRunnerJump();
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
      if (this.tierRibbon.ageMs >= 1200) this.tierRibbon = null;
    }

    const modeLabel =
      this.mode === "daily" ? "code run — daily" : "code run — endless";

    const onClue = (token: string): void => {
      const before = this.seenClueTokens.size;
      this.seenClueTokens.add(token);
      if (this.seenClueTokens.size > before) sfxRunnerCluePing();
    };

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
      onClueTokenSeen: onClue,
      anomalyId: this.anomalyId,
      clueTooltipHint: this.clueTooltipHint,
    };
    const tierRibbon =
      this.tierRibbon &&
      this.tierRibbon.ageMs < 1200 &&
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
          restartProgress01: gameOverUi?.restartProgress01 ?? 0,
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

    if (this.sim.finished && this.mode === "daily" && !this.gameOver) {
      this.outcome = { kind: "daily_clear" };
    }
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
    const scale = Math.min(
      cssW / RUNNER_DRAW.canvasW,
      cssH / RUNNER_DRAW.canvasH,
    );
    const dw = RUNNER_DRAW.canvasW * scale;
    const dh = RUNNER_DRAW.canvasH * scale;
    const dx = (cssW - dw) / 2;
    const dy = (cssH - dh) / 2;
    octx.drawImage(this.renderCtx.canvas, dx, dy, dw, dh);
  }

  getOutcome(): RunnerRunOutcome | null {
    return this.outcome;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
