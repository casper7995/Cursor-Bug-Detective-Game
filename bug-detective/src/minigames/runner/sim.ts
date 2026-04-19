import { makeSeededRng } from "../../api/seedClient";
import type { RunnerMode } from "./types";

/** Top-left canvas coords; y increases downward. */
export interface CodePlank {
  readonly x0: number;
  readonly x1: number;
  /** Top surface y — player’s feet rest here. */
  readonly yTop: number;
}

export interface RunnerSimConfig {
  readonly canvasW: number;
  readonly canvasH: number;
  /** World scroll distance that completes the daily run. */
  readonly dailyGoalDistance: number;
}

export interface RunnerSimState {
  readonly mode: RunnerMode;
  readonly scroll: number;
  readonly playerY: number;
  readonly playerVy: number;
  readonly grounded: boolean;
  readonly distanceScore: number;
  readonly maxScroll: number;
  readonly finished: boolean;
  readonly failed: boolean;
  readonly planks: readonly CodePlank[];
  readonly genCursor: number;
  readonly rng: () => number;
}

const PLAYER_W = 44;
const PLAYER_H = 52;
/** Screen-space x of player left edge; world x = scroll + this. */
export const PLAYER_SCREEN_X = 96;
const GRAVITY = 3200;
const JUMP_V0 = -720;
const RUN_SPEED_DAILY = 210;
const RUN_SPEED_ENDLESS = 255;
const GROUND_Y = 292; // main “desk” floor

export function deriveRunnerSeed(dailySeed: number): number {
  return (dailySeed ^ 0x9e3779b9) >>> 0;
}

export function generateInitialPlanks(
  rng: () => number,
  mode: RunnerMode,
  genCursor: number,
  goalDistance: number,
): { planks: CodePlank[]; nextCursor: number } {
  const planks: CodePlank[] = [];
  let x = genCursor;
  const targetEnd =
    mode === "daily"
      ? goalDistance + 400 + Math.floor(rng() * 400)
      : genCursor + 9000;

  while (x < targetEnd) {
    const w = 88 + Math.floor(rng() * 110);
    const gap = 64 + Math.floor(rng() * 96);
    const yJitter = Math.floor((rng() - 0.5) * 40);
    const yTop = Math.min(278, Math.max(196, GROUND_Y - 8 + yJitter));
    planks.push({ x0: x, x1: x + w, yTop });
    x += w + gap;
  }
  return { planks, nextCursor: x };
}

/** Lowest walkable surface under the player (feet y). */
function supportYTop(scroll: number, planks: readonly CodePlank[]): number {
  const px0 = scroll + PLAYER_SCREEN_X;
  const px1 = px0 + PLAYER_W;
  let best = GROUND_Y;
  for (const p of planks) {
    if (px1 > p.x0 && px0 < p.x1) {
      best = Math.min(best, p.yTop);
    }
  }
  return best;
}

export function createRunnerSim(
  dailySeed: number,
  mode: RunnerMode,
  cfg: RunnerSimConfig,
): RunnerSimState {
  const rng = makeSeededRng(deriveRunnerSeed(dailySeed));
  const { planks, nextCursor } = generateInitialPlanks(
    rng,
    mode,
    40,
    cfg.dailyGoalDistance,
  );
  return {
    mode,
    scroll: 0,
    playerY: GROUND_Y - PLAYER_H,
    playerVy: 0,
    grounded: true,
    distanceScore: 0,
    maxScroll: 0,
    finished: false,
    failed: false,
    planks,
    genCursor: nextCursor,
    rng,
  };
}

export function stepRunnerSim(
  state: RunnerSimState,
  dtSec: number,
  wantJump: boolean,
  cfg: RunnerSimConfig,
): RunnerSimState {
  if (state.finished || state.failed) return state;

  const speed = state.mode === "daily" ? RUN_SPEED_DAILY : RUN_SPEED_ENDLESS;
  const scroll = state.scroll + speed * dtSec;

  let playerVy = state.playerVy;
  let playerY = state.playerY;

  const surfaceY = supportYTop(scroll, state.planks);
  const feetY = playerY + PLAYER_H;
  let grounded =
    feetY >= surfaceY - 1.5 &&
    feetY <= surfaceY + 14 &&
    Math.abs(playerVy) < 420;

  if (grounded && wantJump) {
    playerVy = JUMP_V0;
    grounded = false;
  }

  if (!grounded) {
    playerVy += GRAVITY * dtSec;
    playerY += playerVy * dtSec;
  }

  // Land on surface
  const feet2 = playerY + PLAYER_H;
  const surf2 = surfaceY;
  if (playerVy >= 0 && feet2 >= surf2 - 0.5 && feet2 <= surf2 + 24) {
    playerY = surf2 - PLAYER_H;
    playerVy = 0;
    grounded = true;
  }

  if (playerY + PLAYER_H > cfg.canvasH + 48) {
    return { ...state, failed: true, scroll, playerY, playerVy };
  }

  if (state.mode === "daily" && scroll >= cfg.dailyGoalDistance) {
    return {
      ...state,
      finished: true,
      scroll: cfg.dailyGoalDistance,
      playerY,
      playerVy: 0,
      grounded: true,
      maxScroll: Math.max(state.maxScroll, cfg.dailyGoalDistance),
    };
  }

  let planks = state.planks;
  let genCursor = state.genCursor;
  const rng = state.rng;
  if (state.mode === "endless" && scroll + 1000 > genCursor) {
    const add = generateInitialPlanks(
      rng,
      "endless",
      genCursor,
      cfg.dailyGoalDistance,
    );
    planks = [...planks, ...add.planks];
    genCursor = add.nextCursor;
  }

  const cullBefore = scroll - 260;
  planks = planks.filter((p) => p.x1 > cullBefore);

  const maxScroll = Math.max(state.maxScroll, scroll);

  return {
    ...state,
    scroll,
    playerY,
    playerVy,
    grounded,
    distanceScore: Math.floor(scroll / 12),
    maxScroll,
    planks,
    genCursor,
    failed: false,
    finished: state.finished,
  };
}

export const RUNNER_DRAW = {
  canvasW: 512,
  canvasH: 320,
  playerW: PLAYER_W,
  playerH: PLAYER_H,
  groundY: GROUND_Y,
} as const;
