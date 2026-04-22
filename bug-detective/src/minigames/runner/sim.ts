import { makeSeededRng } from "../../api/seedClient";
import type { AnomalyId } from "../../scene/anomalies";
import { snippetWidthForPlankId } from "./snippets";
import type { RunnerMode } from "./types";

/** Top-left canvas coords; y increases downward. */
export interface CodePlank {
  readonly id: number;
  readonly x0: number;
  readonly x1: number;
  /** Top surface y — player’s feet rest here. */
  readonly yTop: number;
  /** Sim-elapsed ms when the player first landed; null = pristine. */
  touchedAtMs: number | null;
  /** Sim time when this plank was generated — pristine planks decay from here. */
  bornAtMs: number;
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
  readonly maxScroll: number;
  /** Peak climb in abstract “meters” for HUD / game-over. */
  readonly maxClimbM: number;
  readonly finished: boolean;
  readonly failed: boolean;
  readonly planks: readonly CodePlank[];
  readonly genCursor: number;
  readonly rng: () => number;
  /** Monotonic sim time in ms (for plank fade / touch). */
  readonly elapsedMs: number;
  /** Next plank id to assign when generating. */
  readonly nextPlankId: number;
  /** Boost meter 0..1 — charges on landings, drains while holding boost. */
  readonly boost01: number;
  /** Last solid surface yTop the player stood on (void death uses this). */
  readonly lastGroundSurfaceY: number;
  /** Feet y at run start (for max climb). */
  readonly runStartFeetY: number;
  /** Minimum feet y reached this run (smaller = higher climb). */
  readonly minFeetY: number;
  /** Drives themed snippet text / plank widths in endless generation. */
  readonly anomalyId: AnomalyId;
}

const PLAYER_W = 44;
const PLAYER_H = 52;
/** Screen-space x of player left edge; world x = scroll + this. */
export const PLAYER_SCREEN_X = 96;
const GRAVITY = 3200;
/** Slightly stronger jump — easier gaps and vertical steps (was -720). */
export const RUNNER_JUMP_V0 = -800;
const JUMP_V0 = RUNNER_JUMP_V0;

/** Exported for tests / tooling — keep in sync with stepRunnerSim. */
export const RUNNER_SPEED_BASE = 228;
export const RUNNER_SPEED_BOOST_MAX = 540;
const SPEED_BASE = RUNNER_SPEED_BASE;
const SPEED_BOOST_MAX = RUNNER_SPEED_BOOST_MAX;
const BOOST_CHARGE_PER_LANDING = 0.38;
const BOOST_DRAIN_PER_SEC = 0.2;
/** Fall this far below last ground surface (px) → void death (~0.32s after walk-off). */
export const VOID_DEPTH_PX = 176;
/** Fewer world pixels per HUD “meter” — same climb reads as higher / more rewarding. */
const CLIMB_PX_PER_M = 2;

const MIN_GAP = 32;

/** Layout: max plank height band (no solid floor — visual only). */
export const LAYOUT_FLOOR_Y = 292;

/** Ms after first touch before plank stops supporting the player. */
export const PLANK_LIFE_MS = 4800;
/** Base ms before an untouched plank stops supporting (tier shortens this). */
export const PRISTINE_LIFE_BASE_MS = 7000;
/** Keep culled planks a little longer so fade-out can finish. */
const PLANK_CULL_GRACE_MS = 200;

export function pristineLifeMsForTier(tier: number): number {
  return Math.max(3500, PRISTINE_LIFE_BASE_MS - Math.max(0, tier) * 350);
}

/** Max upward jump height (px) from jump velocity and gravity. */
export const MAX_JUMP_UP = (JUMP_V0 * JUMP_V0) / (2 * GRAVITY);

/** Time in air for a full jump that lands at the same height. */
export function jumpAirTimeSec(): number {
  return (-2 * JUMP_V0) / GRAVITY;
}

/** Approx horizontal reach (px) for a jump at constant horizontal speed. */
export function horizontalJumpRange(speed: number): number {
  return speed * jumpAirTimeSec();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Tier from peak climb — drives endless ramp (death-gap cadence + speed). */
export function endlessTierFromMaxClimbM(maxClimbM: number): number {
  return Math.floor(Math.max(0, maxClimbM) / 100);
}

/**
 * +5% horizontal speed per tier (uncapped — endless keeps speeding up).
 * Used for scroll speed and gap generation in step + plank gen.
 */
export function effectiveSpeedBaseForTier(tier: number): number {
  const t = Math.max(0, tier);
  return SPEED_BASE * (1 + 0.05 * t);
}

/** Upper bound for normal (non–death-pit) gaps only — death gaps exceed this on purpose. */
export function maxGapForSpeed(speed: number): number {
  return Math.min(100, horizontalJumpRange(speed) - 36);
}

/**
 * Gap after this plank id is wider than base-speed jump reach — player must boost.
 * `endlessTier` tightens cadence: period = max(3, 7 - min(tier, 4)) planks.
 */
export function isDeathGapAfterPlankId(sid: number, endlessTier = 0): boolean {
  const period = Math.max(3, 7 - Math.min(Math.max(0, endlessTier), 4));
  return sid % period === 0 && sid > 3;
}

function deathGapPx(rng: () => number, speedForReach: number): number {
  const maxDeath = horizontalJumpRange(SPEED_BOOST_MAX) - 16;
  const raw = Math.round(horizontalJumpRange(speedForReach) + 24 + rng() * 40);
  return Math.min(raw, maxDeath);
}

export function deriveRunnerSeed(dailySeed: number): number {
  return (dailySeed ^ 0x9e3779b9) >>> 0;
}

function isPlankSolid(
  p: CodePlank,
  elapsedMs: number,
  pristineLifeMs: number,
): boolean {
  if (p.touchedAtMs !== null) {
    return elapsedMs - p.touchedAtMs < PLANK_LIFE_MS;
  }
  return elapsedMs - p.bornAtMs < pristineLifeMs;
}

/**
 * Lowest walkable surface under the player (feet y), or +Infinity if none.
 * `pristineLifeMs` is from `pristineLifeMsForTier(tier)` for the active ramp.
 */
export function supportYTop(
  scroll: number,
  planks: readonly CodePlank[],
  elapsedMs: number,
  pristineLifeMs: number,
): number {
  const px0 = scroll + PLAYER_SCREEN_X;
  const px1 = px0 + PLAYER_W;
  let best = Number.POSITIVE_INFINITY;
  for (const p of planks) {
    if (!isPlankSolid(p, elapsedMs, pristineLifeMs)) continue;
    if (px1 > p.x0 && px0 < p.x1) {
      best = Math.min(best, p.yTop);
    }
  }
  return best;
}

export interface GeneratePlanksOpts {
  /** Continue vertical profile from the last plank in a prior batch. */
  readonly continueFromYTop?: number;
  readonly anomalyId?: AnomalyId;
  /** Endless ramp: death-gap frequency + gap sizing (default 0). */
  readonly endlessTier?: number;
  /** Sim elapsed ms when planks are born (for pristine decay). */
  readonly nowMs?: number;
}

export function generateInitialPlanks(
  rng: () => number,
  mode: RunnerMode,
  genCursor: number,
  goalDistance: number,
  startPlankId: number,
  opts?: GeneratePlanksOpts,
): { planks: CodePlank[]; nextCursor: number; nextPlankId: number } {
  const planks: CodePlank[] = [];
  let x = genCursor;
  let nextId = startPlankId;
  const anomalyId = opts?.anomalyId ?? "calendar-tomorrow";
  const endlessTier = opts?.endlessTier ?? 0;
  const bornAtMs = opts?.nowMs ?? 0;
  const speedForTier = effectiveSpeedBaseForTier(endlessTier);
  const targetEnd =
    mode === "daily"
      ? goalDistance + 400 + Math.floor(rng() * 400)
      : genCursor + 9000;

  const maxGap = maxGapForSpeed(speedForTier);
  let prevYTop =
    opts?.continueFromYTop ??
    clamp(280 - genCursor * 0.07 + (rng() - 0.5) * 36, 196, 270);

  while (x < targetEnd) {
    const sid = nextId++;
    const textW = snippetWidthForPlankId(sid, anomalyId);
    const w = Math.max(88 + Math.floor(rng() * 110), textW + 16);
    const baseGap =
      MIN_GAP + Math.floor(rng() * Math.max(1, maxGap - MIN_GAP + 1));
    const gap = isDeathGapAfterPlankId(sid, endlessTier)
      ? deathGapPx(rng, speedForTier)
      : baseGap;

    const midX = x + w * 0.5;
    const climbBaseY = 280 - midX * 0.07;
    const jitter = (rng() - 0.5) * 42;
    // Bias upward (smaller yTop): triangular-ish toward climbing
    const upBias = rng() * rng() * 18;
    let yTop = climbBaseY + jitter - upBias;

    const minNext = prevYTop - (MAX_JUMP_UP - 8);
    const maxNext = prevYTop + 40;
    yTop = clamp(yTop, minNext, maxNext);
    // No upper cap — climb can keep rising; camera follows.
    yTop = Math.max(80, yTop);

    planks.push({
      id: sid,
      x0: x,
      x1: x + w,
      yTop,
      touchedAtMs: null,
      bornAtMs,
    });
    prevYTop = yTop;
    x += w + gap;
  }
  return { planks, nextCursor: x, nextPlankId: nextId };
}

export function createRunnerSim(
  dailySeed: number,
  mode: RunnerMode,
  cfg: RunnerSimConfig,
  anomalyId: AnomalyId = "calendar-tomorrow",
): RunnerSimState {
  const rng = makeSeededRng(deriveRunnerSeed(dailySeed));
  const gen = generateInitialPlanks(rng, mode, 40, cfg.dailyGoalDistance, 0, {
    anomalyId,
  });
  const { planks, nextCursor, nextPlankId } = gen;
  return finalizeNewSim(mode, planks, nextCursor, nextPlankId, rng, anomalyId);
}

/** Deterministic re-seed for endless restarts / same-mode retry. */
export function createRunnerSimWithSeed(
  runSeed: number,
  mode: RunnerMode,
  cfg: RunnerSimConfig,
  anomalyId: AnomalyId = "calendar-tomorrow",
): RunnerSimState {
  const rng = makeSeededRng(deriveRunnerSeed(runSeed));
  const gen = generateInitialPlanks(rng, mode, 40, cfg.dailyGoalDistance, 0, {
    anomalyId,
  });
  const { planks, nextCursor, nextPlankId } = gen;
  return finalizeNewSim(mode, planks, nextCursor, nextPlankId, rng, anomalyId);
}

function finalizeNewSim(
  mode: RunnerMode,
  planks: CodePlank[],
  genCursor: number,
  nextPlankId: number,
  rng: () => number,
  anomalyId: AnomalyId,
): RunnerSimState {
  const pristine0 = pristineLifeMsForTier(0);
  const surface0 = supportYTop(0, planks, 0, pristine0);
  const playerY = Number.isFinite(surface0)
    ? surface0 - PLAYER_H
    : LAYOUT_FLOOR_Y - PLAYER_H;
  const feet0 = playerY + PLAYER_H;
  return {
    mode,
    scroll: 0,
    playerY,
    playerVy: 0,
    grounded: true,
    maxScroll: 0,
    maxClimbM: 0,
    finished: false,
    failed: false,
    planks,
    genCursor,
    rng,
    elapsedMs: 0,
    nextPlankId,
    boost01: 0.75,
    lastGroundSurfaceY: Number.isFinite(surface0) ? surface0 : LAYOUT_FLOOR_Y,
    runStartFeetY: feet0,
    minFeetY: feet0,
    anomalyId,
  };
}

function findLandPlank(
  scroll: number,
  feetY: number,
  planks: readonly CodePlank[],
  elapsedMs: number,
  pristineLifeMs: number,
): CodePlank | null {
  const px0 = scroll + PLAYER_SCREEN_X;
  const px1 = px0 + PLAYER_W;
  let best: CodePlank | null = null;
  let bestY = Number.POSITIVE_INFINITY;
  for (const p of planks) {
    if (!isPlankSolid(p, elapsedMs, pristineLifeMs)) continue;
    if (px1 > p.x0 && px0 < p.x1 && p.yTop < bestY && feetY >= p.yTop - 4) {
      best = p;
      bestY = p.yTop;
    }
  }
  return best;
}

export function stepRunnerSim(
  state: RunnerSimState,
  dtSec: number,
  wantJump: boolean,
  wantBoost: boolean,
  cfg: RunnerSimConfig,
): RunnerSimState {
  if (state.finished || state.failed) return state;

  const nextElapsed = state.elapsedMs + dtSec * 1000;
  const wasGrounded = state.grounded;

  let boost01 = state.boost01;
  const rampTier = endlessTierFromMaxClimbM(state.maxClimbM);
  const pristineLifeMs = pristineLifeMsForTier(rampTier);
  const speed0 = effectiveSpeedBaseForTier(rampTier);
  const speed =
    speed0 + (SPEED_BOOST_MAX - speed0) * boost01 * (wantBoost ? 1 : 0);
  const scroll = state.scroll + speed * dtSec;

  let playerVy = state.playerVy;
  let playerY = state.playerY;

  let planks: CodePlank[] = state.planks.map((p) => ({ ...p }));

  const surfaceY = supportYTop(scroll, planks, nextElapsed, pristineLifeMs);
  const feetY0 = playerY + PLAYER_H;
  let grounded =
    feetY0 >= surfaceY - 2.5 &&
    feetY0 <= surfaceY + 20 &&
    Math.abs(playerVy) < 420 &&
    Number.isFinite(surfaceY);

  if (grounded && wantJump) {
    playerVy = JUMP_V0;
    grounded = false;
  }

  if (!grounded) {
    playerVy += GRAVITY * dtSec;
    playerY += playerVy * dtSec;
  }

  const feet2 = playerY + PLAYER_H;
  const surf2 = surfaceY;
  if (
    playerVy >= 0 &&
    Number.isFinite(surf2) &&
    feet2 >= surf2 - 0.5 &&
    feet2 <= surf2 + 32
  ) {
    playerY = surf2 - PLAYER_H;
    playerVy = 0;
    grounded = true;
    const land = findLandPlank(
      scroll,
      feet2,
      planks,
      nextElapsed,
      pristineLifeMs,
    );
    if (land && land.touchedAtMs === null) {
      const i = planks.findIndex((p) => p.id === land.id);
      if (i >= 0) planks[i] = { ...planks[i]!, touchedAtMs: nextElapsed };
    }
  }

  if (grounded && !wasGrounded) {
    boost01 = Math.min(1, boost01 + BOOST_CHARGE_PER_LANDING);
  }

  if (wantBoost && boost01 > 0) {
    boost01 = Math.max(0, boost01 - BOOST_DRAIN_PER_SEC * dtSec);
  }

  let lastGroundSurfaceY = state.lastGroundSurfaceY;
  if (grounded) {
    const lp = findLandPlank(
      scroll,
      playerY + PLAYER_H,
      planks,
      nextElapsed,
      pristineLifeMs,
    );
    if (lp) lastGroundSurfaceY = lp.yTop;
    else if (Number.isFinite(surfaceY)) lastGroundSurfaceY = surfaceY;
  }

  const feetY = playerY + PLAYER_H;
  const minFeetY = Math.min(state.minFeetY, feetY);
  const verticalPx = Math.max(0, state.runStartFeetY - minFeetY);
  /** Forward progress also nudges the score so long flat runs still gain “m”. */
  const maxClimbM = Math.floor(
    verticalPx / CLIMB_PX_PER_M + scroll / RUNNER_SPEED_BASE,
  );

  if (!grounded && feetY > lastGroundSurfaceY + VOID_DEPTH_PX) {
    return {
      ...state,
      failed: true,
      scroll,
      playerY,
      playerVy,
      elapsedMs: nextElapsed,
      planks,
      maxScroll: Math.max(state.maxScroll, scroll),
      boost01,
      lastGroundSurfaceY,
      minFeetY,
      maxClimbM,
    };
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
      elapsedMs: nextElapsed,
      planks,
      boost01,
      lastGroundSurfaceY,
      minFeetY,
      maxClimbM,
    };
  }

  let genCursor = state.genCursor;
  let nextPlankId = state.nextPlankId;
  const rng = state.rng;
  if (state.mode === "endless" && scroll + 1000 > genCursor) {
    const lastPlank = planks.length > 0 ? planks[planks.length - 1] : null;
    const genTier = endlessTierFromMaxClimbM(maxClimbM);
    const add = generateInitialPlanks(
      rng,
      "endless",
      genCursor,
      cfg.dailyGoalDistance,
      nextPlankId,
      lastPlank
        ? {
            continueFromYTop: lastPlank.yTop,
            anomalyId: state.anomalyId,
            endlessTier: genTier,
            nowMs: nextElapsed,
          }
        : {
            anomalyId: state.anomalyId,
            endlessTier: genTier,
            nowMs: nextElapsed,
          },
    );
    planks = [...planks, ...add.planks];
    genCursor = add.nextCursor;
    nextPlankId = add.nextPlankId;
  }

  const cullBefore = scroll - 260;
  planks = planks.filter((p) => {
    if (p.x1 > cullBefore) return true;
    if (p.touchedAtMs !== null) {
      return nextElapsed < p.touchedAtMs + PLANK_LIFE_MS + PLANK_CULL_GRACE_MS;
    }
    return nextElapsed < p.bornAtMs + pristineLifeMs + PLANK_CULL_GRACE_MS;
  });

  const maxScroll = Math.max(state.maxScroll, scroll);

  return {
    ...state,
    scroll,
    playerY,
    playerVy,
    grounded,
    maxScroll,
    maxClimbM,
    planks,
    genCursor,
    nextPlankId,
    rng,
    failed: false,
    finished: state.finished,
    elapsedMs: nextElapsed,
    boost01,
    lastGroundSurfaceY,
    minFeetY,
    runStartFeetY: state.runStartFeetY,
  };
}

export const RUNNER_DRAW = {
  canvasW: 512,
  canvasH: 320,
  playerW: PLAYER_W,
  playerH: PLAYER_H,
  groundY: LAYOUT_FLOOR_Y,
} as const;
