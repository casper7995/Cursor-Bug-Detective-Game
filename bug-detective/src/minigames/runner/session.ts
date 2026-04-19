import { drawRunnerFrame } from "./draw";
import {
  createRunnerSim,
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

export class RunnerSession {
  private sim: RunnerSimState;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: import("three").CanvasTexture;
  readonly mode: RunnerMode;
  private outcome: RunnerRunOutcome | null = null;

  constructor(
    seed: number,
    mode: RunnerMode,
    THREE: typeof import("three"),
    cfg: RunnerSimConfig = DEFAULT_CFG,
  ) {
    this.mode = mode;
    this.sim = createRunnerSim(seed, mode, cfg);
    const c = document.createElement("canvas");
    c.width = cfg.canvasW;
    c.height = cfg.canvasH;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.texture = tex;
  }

  getTexture(): import("three").CanvasTexture {
    return this.texture;
  }

  step(
    dtSec: number,
    wantJump: boolean,
    cfg: RunnerSimConfig = DEFAULT_CFG,
  ): void {
    if (this.outcome) return;
    this.sim = stepRunnerSim(this.sim, dtSec, wantJump, cfg);

    const modeLabel =
      this.mode === "daily" ? "code run — daily" : "code run — endless";
    const hint =
      this.mode === "daily"
        ? "Space jump · reach the end"
        : "Space jump · stay alive";

    drawRunnerFrame(this.ctx, {
      scroll: this.sim.scroll,
      playerY: this.sim.playerY,
      planks: this.sim.planks,
      modeLabel,
      hint,
    });
    this.texture.needsUpdate = true;

    if (this.sim.finished && this.mode === "daily") {
      this.outcome = { kind: "daily_clear" };
    }
    if (this.sim.failed) {
      this.outcome =
        this.mode === "endless"
          ? { kind: "endless_stop", score: this.sim.maxScroll }
          : { kind: "daily_fail" };
    }
  }

  getOutcome(): RunnerRunOutcome | null {
    return this.outcome;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
