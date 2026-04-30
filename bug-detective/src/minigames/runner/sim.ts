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

export interface RunnerProjectile {
  readonly x: number;
  /** Hit / draw center y (down-positive canvas space). */
  readonly y: number;
  readonly text: string;
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
  /** Endless-only: “error code” gap hazards. */
  readonly projectiles: readonly RunnerProjectile[];
  /** `elapsedMs` when the next gap projectile may spawn. */
  readonly nextProjectileSpawnAtMs: number;
  /**
   * Daily: scroll has crossed the goal line; sim keeps running. Does not set `finished`
   * so the player can keep going (and we can append more course).
   */
  readonly dailyLineCrossed: boolean;
  /** Sim time of last grounded frame; used for coyote-time jumps. */
  readonly lastGroundedAtMs: number;
  /** Sim time of last `wantJump` press while airborne; used for jump buffer. */
  readonly bufferedJumpAtMs: number;
  /** Edge-tracker so a held jump key only buffers once per press. */
  readonly prevWantJump: boolean;
}

/** Jump still allowed within this window of leaving the ground without jumping. */
export const COYOTE_TIME_MS = 80;
/** Jump press within this window before grounding triggers on land. */
export const JUMP_BUFFER_MS = 100;

/** Default world-scroll distance to count as the daily “finish line” (HUD + score). */
export const DEFAULT_DAILY_GOAL_SCROLL = 4000;

const PLAYER_W = 44;
const PLAYER_H = 52;
/**
 * Support uses a narrow underfoot band (not full body width) so a visible gap
 * between snippets is not bridged by the mascot’s full hit box.
 */
const SUPPORT_FOOT_W = 20;
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

export const RUNNER_PROJECTILE_W = 78;
export const RUNNER_PROJECTILE_H = 16;
const PROJECTILE_W = RUNNER_PROJECTILE_W;
const PROJECTILE_H = RUNNER_PROJECTILE_H;
const PROJECTILE_SPAWN_MIN_GAP_PX = 88;
const PROJECTILE_SPAWN_AHEAD_MIN = 150;
const PROJECTILE_SPAWN_AHEAD_MAX = 520;
const PROJECTILE_MIN_CLIMB_M = 100;
const PROJECTILE_SPAWN_TIER = 1;

const ERR_CODE_PHRASES = [
  "EADDRINUSE",
  "TypeError",
  "NaN",
  "segfault",
  "ENOENT",
] as const;

function playerHitByProjectile(
  scroll: number,
  playerY: number,
  p: RunnerProjectile,
): boolean {
  const px0 = scroll + PLAYER_SCREEN_X;
  const px1 = px0 + PLAYER_W;
  const y0 = p.y - PROJECTILE_H / 2;
  const y1 = p.y + PROJECTILE_H / 2;
  const py0 = playerY;
  const py1 = playerY + PLAYER_H;
  if (p.x + PROJECTILE_W < px0 || p.x > px1) return false;
  return y0 < py1 && y1 > py0;
}

function trySpawnErrorProjectileInGap(
  scroll: number,
  planks: readonly CodePlank[],
  rng: () => number,
  nowMs: number,
  minNextSpawnMs: number,
  maxClimbM: number,
  endlessTier: number,
): { projectiles: RunnerProjectile[]; nextSpawnAt: number; spawned: boolean } {
  if (nowMs < minNextSpawnMs) {
    return { projectiles: [], nextSpawnAt: minNextSpawnMs, spawned: false };
  }
  if (
    maxClimbM < PROJECTILE_MIN_CLIMB_M ||
    endlessTier < PROJECTILE_SPAWN_TIER
  ) {
    return { projectiles: [], nextSpawnAt: minNextSpawnMs, spawned: false };
  }

  for (let i = 0; i < planks.length - 1; i++) {
    const a = planks[i]!;
    const b = planks[i + 1]!;
    if (a.x0 > b.x0) continue;
    const gapW = b.x0 - a.x1;
    if (gapW < PROJECTILE_SPAWN_MIN_GAP_PX) continue;
    if (a.x1 < scroll + PROJECTILE_SPAWN_AHEAD_MIN) continue;
    if (a.x1 > scroll + PROJECTILE_SPAWN_AHEAD_MAX) continue;
    const mid = a.x1 + Math.min(110, Math.max(22, gapW * 0.45));
    if (mid > b.x0 - 28) continue;
    const y = (a.yTop + b.yTop) * 0.5 - 20;
    const text = ERR_CODE_PHRASES[Math.floor(rng() * ERR_CODE_PHRASES.length)]!;
    return {
      projectiles: [{ x: mid - PROJECTILE_W * 0.5, y, text }],
      nextSpawnAt: nowMs + 1500 + rng() * 1100,
      spawned: true,
    };
  }
  return {
    projectiles: [],
    nextSpawnAt: nowMs + 400,
    spawned: false,
  };
}

/** Layout: max plank height band (no solid floor — visual only). */
export const LAYOUT_FLOOR_Y = 292;

/** Ms after first touch before plank stops supporting the player. */
export const PLANK_LIFE_MS = 4800;
/** Base ms before an untouched plank stops supporting (tier shortens this). */
export const PRISTINE_LIFE_BASE_MS = 7000;
/** Keep culled planks a little longer so fade-out can finish. */
const PLANK_CULL_GRACE_MS = 200;

/** No death gaps in endless tier 0 until this plank id (inclusive of normal gaps only below). */
export const ENDLESS_DEATH_GAP_WARMUP_MIN_PLANK_ID = 20;
/** No death gaps in endless tier 0 while HUD climb stays below this (matches ~15–20m onboarding). */
export const ENDLESS_DEATH_GAP_WARMUP_MIN_CLIMB_M = 18;

export function pristineLifeMsForTier(
  tier: number,
  mode?: RunnerMode,
  maxClimbM = 0,
): number {
  const bonus = mode === "endless" && tier === 0 ? 800 : 0;
  const base = PRISTINE_LIFE_BASE_MS - Math.max(0, tier) * 350 + bonus;
  const heightBonus = mode === "endless" ? Math.min(4500, maxClimbM * 5) : 0;
  return Math.max(3500, base + heightBonus);
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
 * +7% horizontal speed per tier (uncapped — endless keeps speeding up).
 * Used for scroll speed and gap generation in step + plank gen.
 */
export function effectiveSpeedBaseForTier(tier: number): number {
  const t = Math.max(0, tier);
  return SPEED_BASE * (1 + 0.07 * t);
}

/**
 * Full-boost horizontal speed at this tier. Scales the tier-0 ratio (540/228) so
 * held-boost run speed is not hard-capped at 540 for the first ~20 tiers.
 * At tier 0, equals {@link RUNNER_SPEED_BOOST_MAX}.
 */
export function boostSpeedForTier(tier: number): number {
  return effectiveSpeedBaseForTier(tier) * (SPEED_BOOST_MAX / SPEED_BASE);
}

/**
 * Horizontal scroll speed for one step. Boost never reduces speed when base tier
 * already exceeds max boost (avoids negative lerp).
 */
export function horizontalRunSpeedPxPerSec(
  rampTier: number,
  boost01: number,
  wantBoost: boolean,
): number {
  const speed0 = effectiveSpeedBaseForTier(rampTier);
  if (!wantBoost || boost01 <= 0) return speed0;
  const speedBoost = boostSpeedForTier(rampTier);
  const boosted = speed0 + (speedBoost - speed0) * boost01;
  return Math.max(speed0, boosted);
}

/** Pixels to leave under a raw jump-physics reach for “normal” gaps. */
const GAP_BASE_MARGIN = 40;
/** Stricter underfoot margin for “must boost” gap ceiling. */
const GAP_BOOST_MARGIN = 32;

/**
 * Best-case horizontal travel (px) in one jump at `speed` (no extra slack).
 * Used by generation + reachability tests.
 */
export function maxBaseReachPx(speed: number): number {
  return Math.max(0, horizontalJumpRange(speed) - GAP_BASE_MARGIN);
}

/**
 * Upper travel (px) in one hop at this tier’s full-boost speed.
 * Death-gap ceilings and boost-gap generation use this.
 */
export function maxBoostReachForTier(tier: number): number {
  return Math.max(
    0,
    horizontalJumpRange(boostSpeedForTier(tier)) - GAP_BOOST_MARGIN,
  );
}

/**
 * Tier-0 full-boost reach (back-compat with older tests / call sites).
 * Prefer {@link maxBoostReachForTier} for tier-aware generation.
 */
export function maxBoostReachPx(): number {
  return maxBoostReachForTier(0);
}

/**
 * A boost-only gap should be this much wider than the base run’s normal max at least.
 * (Otherwise it is not meaningfully a “hold boost” beat.)
 */
const BOOST_GAP_MIN_OVER_BASE = 5;

/**
 * Tighten horizontal span when the next platform is **higher** (smaller yTop).
 * Long gaps + big upward steps are the main “no landing” failure mode; this keeps
 * combined gap+step within what the one-airtime model supports.
 */
function tightenGapForClimbPx(
  gap: number,
  prevYTop: number,
  nextYTop: number,
  endlessTier: number,
): number {
  const climbPx = Math.max(0, prevYTop - nextYTop);
  if (climbPx < 0.1) return gap;
  const w = 0.018 + Math.min(0.012, endlessTier * 0.0012);
  const f = 1 - w * Math.min(38, climbPx);
  return Math.max(MIN_GAP, Math.floor(gap * f));
}

/** Upper bound for normal (non–death-pit) gaps only — never exceeds ~base jump. */
export function maxGapForSpeed(speed: number): number {
  return Math.min(100, maxBaseReachPx(speed));
}

/**
 * 1.0 at tier 0, down to ~0.5 at very high endless tiers — shrinks the rng plank
 * width while {@link snippetWidthForPlankId} + padding still sets a minimum.
 */
export function plankWidthTightenForEndlessTier(endlessTier: number): number {
  return Math.max(0.5, 1 - 0.022 * Math.min(30, Math.max(0, endlessTier)));
}

/**
 * Gap after this plank id is wider than base-speed jump reach — player must boost.
 * Tightens cadence as tier increases (as early as every 2 planks in high tier).
 */
export function isDeathGapAfterPlankId(sid: number, endlessTier = 0): boolean {
  const t = Math.max(0, endlessTier);
  const period = Math.max(2, 6 - Math.min(t, 4));
  return sid % period === 0 && sid > 3;
}

/**
 * Endless tier 0 only: suppress death pits until the player has real height
 * and enough platforms have spawned (avoids instant fail before clues/boost read).
 */
export function shouldSuppressEndlessDeathGap(
  mode: RunnerMode,
  endlessTier: number,
  sid: number,
  maxClimbM: number,
): boolean {
  if (mode !== "endless" || endlessTier !== 0) return false;
  return (
    sid < ENDLESS_DEATH_GAP_WARMUP_MIN_PLANK_ID ||
    maxClimbM < ENDLESS_DEATH_GAP_WARMUP_MIN_CLIMB_M
  );
}

export function deathGapPx(
  rng: () => number,
  speedForReach: number,
  endlessTier: number,
): number {
  const minNeed = maxBaseReachPx(speedForReach) + BOOST_GAP_MIN_OVER_BASE;
  const cap = maxBoostReachForTier(endlessTier);
  if (minNeed >= cap) return Math.max(MIN_GAP, cap);
  const headroom = cap - minNeed;
  const slackRng = endlessTier <= 1 ? 0.2 : 0.5;
  const extra = headroom * rng() * slackRng;
  return Math.min(cap, Math.max(MIN_GAP, minNeed, Math.floor(minNeed + extra)));
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

/** World x span under the feet (narrow) for support and landing, not full sprite width. */
function footXRange(scroll: number): {
  readonly fx0: number;
  readonly fx1: number;
} {
  const cx = scroll + PLAYER_SCREEN_X + PLAYER_W * 0.5;
  const half = SUPPORT_FOOT_W * 0.5;
  return { fx0: cx - half, fx1: cx + half };
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
  const { fx0, fx1 } = footXRange(scroll);
  let best = Number.POSITIVE_INFINITY;
  for (const p of planks) {
    if (!isPlankSolid(p, elapsedMs, pristineLifeMs)) continue;
    if (fx1 > p.x0 && fx0 < p.x1) {
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
  /** Sim elapsed ms when the batch is allocated (pristine base for daily / shared start). */
  readonly nowMs?: number;
  /**
   * World scroll at generation time. When set (initial daily, endless, or stitched batches),
   * each untouched plank’s `bornAtMs` is delayed by travel time from the player to that
   * plank at full-boost speed so far-ahead snippets do not “fade out” before you arrive.
   */
  readonly scrollForPristine?: number;
  /** Current HUD max climb (m); endless warm-up uses this with plank id. */
  readonly maxClimbMForWarmup?: number;
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
  const maxClimbMForWarmup = opts?.maxClimbMForWarmup ?? 0;
  const nowBase = opts?.nowMs ?? 0;
  const scrollRef = opts?.scrollForPristine;
  const speedForTier = effectiveSpeedBaseForTier(endlessTier);
  const targetEnd =
    mode === "daily"
      ? goalDistance + 400 + Math.floor(rng() * 400)
      : genCursor + 9000;

  const maxNormalGap = maxGapForSpeed(speedForTier);
  const boostFloor = maxBaseReachPx(speedForTier) + BOOST_GAP_MIN_OVER_BASE;
  const boostCeil = maxBoostReachForTier(endlessTier);
  const travelRefSpeed = Math.max(
    SPEED_BOOST_MAX,
    boostSpeedForTier(endlessTier),
  );
  const widthTighten = plankWidthTightenForEndlessTier(endlessTier);
  let prevYTop =
    opts?.continueFromYTop ??
    clamp(280 - genCursor * 0.07 + (rng() - 0.5) * 36, 196, 270);

  while (x < targetEnd) {
    const sid = nextId++;
    const textW = snippetWidthForPlankId(sid, anomalyId);
    const wPad = 16;
    const wRng = 88 + Math.floor(rng() * 110);
    const w = Math.max(Math.ceil(wRng * widthTighten), textW + wPad);
    const baseRngGap =
      MIN_GAP + Math.floor(rng() * Math.max(1, maxNormalGap - MIN_GAP + 1));
    const wantDeathGap =
      isDeathGapAfterPlankId(sid, endlessTier) &&
      !shouldSuppressEndlessDeathGap(
        mode,
        endlessTier,
        sid,
        maxClimbMForWarmup,
      );
    let gap = wantDeathGap
      ? deathGapPx(rng, speedForTier, endlessTier)
      : baseRngGap;

    const midX = x + w * 0.5;
    const climbBaseY = 280 - midX * 0.07;
    const jitter = (rng() - 0.5) * 42;
    // Bias upward (smaller yTop): triangular-ish toward climbing
    const upBias = rng() * rng() * 18;
    let yTop = climbBaseY + jitter - upBias;

    const minNext = prevYTop - (MAX_JUMP_UP - 8);
    const maxNext = prevYTop + 40;
    yTop = clamp(yTop, minNext, maxNext);
    // minNext / maxNext bound vertical reach; no high screen-clamp (camera follows).

    gap = tightenGapForClimbPx(gap, prevYTop, yTop, endlessTier);
    if (wantDeathGap) {
      gap = Math.min(gap, boostCeil);
      gap = Math.max(gap, Math.min(boostFloor, boostCeil));
    } else {
      gap = Math.min(gap, maxNormalGap);
    }

    // Integer gap + advance keeps plank x0/x1 from float drift in gap checks.
    gap = Math.max(MIN_GAP, Math.round(gap));

    // Stagger pristine decay so far-ahead planks stay solid until the player can reach them.
    let bornAtMs: number;
    if (scrollRef != null) {
      const dist = Math.max(0, x - (scrollRef + PLAYER_SCREEN_X));
      const travelMs = (dist / travelRefSpeed) * 1000;
      bornAtMs = Math.floor(nowBase + travelMs);
    } else {
      bornAtMs = nowBase;
    }

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
    nowMs: 0,
    scrollForPristine: 0,
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
    nowMs: 0,
    scrollForPristine: 0,
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
  const pristine0 = pristineLifeMsForTier(0, mode);
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
    projectiles: [],
    nextProjectileSpawnAtMs: mode === "endless" ? 5000 : 0,
    dailyLineCrossed: false,
    lastGroundedAtMs: 0,
    bufferedJumpAtMs: -Infinity,
    prevWantJump: false,
  };
}

function findLandPlank(
  scroll: number,
  feetY: number,
  planks: readonly CodePlank[],
  elapsedMs: number,
  pristineLifeMs: number,
): CodePlank | null {
  const { fx0, fx1 } = footXRange(scroll);
  let best: CodePlank | null = null;
  let bestY = Number.POSITIVE_INFINITY;
  for (const p of planks) {
    if (!isPlankSolid(p, elapsedMs, pristineLifeMs)) continue;
    if (fx1 > p.x0 && fx0 < p.x1 && p.yTop < bestY && feetY >= p.yTop - 4) {
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
  if (state.failed) return state;
  if (state.finished) return state;

  const nextElapsed = state.elapsedMs + dtSec * 1000;
  const wasGrounded = state.grounded;

  let boost01 = state.boost01;
  const rampTier = endlessTierFromMaxClimbM(state.maxClimbM);
  const pristineLifeMs = pristineLifeMsForTier(
    rampTier,
    state.mode,
    state.mode === "endless" ? state.maxClimbM : 0,
  );
  const speed = horizontalRunSpeedPxPerSec(rampTier, boost01, wantBoost);
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

  // Edge-detect a fresh jump press so a held key buffers exactly once.
  const justPressedJump = wantJump && !state.prevWantJump;

  // Update buffer timestamp on a fresh press (regardless of grounded).
  let bufferedJumpAtMs = state.bufferedJumpAtMs;
  if (justPressedJump) bufferedJumpAtMs = nextElapsed;

  // Coyote allowance: did we leave ground (without jumping) very recently?
  const coyoteOK =
    !grounded && nextElapsed - state.lastGroundedAtMs <= COYOTE_TIME_MS;

  // Buffer allowance: did we press jump just before landing?
  const bufferOK = grounded && nextElapsed - bufferedJumpAtMs <= JUMP_BUFFER_MS;

  if ((grounded && wantJump) || coyoteOK || bufferOK) {
    playerVy = JUMP_V0;
    grounded = false;
    bufferedJumpAtMs = -Infinity; // consume the buffer
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

  const climbTier = endlessTierFromMaxClimbM(maxClimbM);
  let projectiles: RunnerProjectile[] = state.projectiles.filter(
    (p) => p.x + PROJECTILE_W > scroll - 120,
  );
  for (const p of projectiles) {
    if (playerHitByProjectile(scroll, playerY, p)) {
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
        projectiles,
        nextProjectileSpawnAtMs: state.nextProjectileSpawnAtMs,
      };
    }
  }

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
      projectiles,
      nextProjectileSpawnAtMs: state.nextProjectileSpawnAtMs,
    };
  }

  const nextDailyLineCrossed =
    state.dailyLineCrossed ||
    (state.mode === "daily" && scroll >= cfg.dailyGoalDistance);

  let genCursor = state.genCursor;
  let nextPlankId = state.nextPlankId;
  const rng = state.rng;
  if (
    (state.mode === "endless" ||
      (state.mode === "daily" && nextDailyLineCrossed)) &&
    scroll + 1000 > genCursor
  ) {
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
            scrollForPristine: scroll,
            maxClimbMForWarmup: maxClimbM,
          }
        : {
            anomalyId: state.anomalyId,
            endlessTier: genTier,
            nowMs: nextElapsed,
            scrollForPristine: scroll,
            maxClimbMForWarmup: maxClimbM,
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

  let nextProjectileSpawnAtMs = state.nextProjectileSpawnAtMs;
  if (state.mode === "endless") {
    const spawn = trySpawnErrorProjectileInGap(
      scroll,
      planks,
      rng,
      nextElapsed,
      nextProjectileSpawnAtMs,
      maxClimbM,
      climbTier,
    );
    if (spawn.spawned) {
      projectiles = [...projectiles, ...spawn.projectiles];
    }
    nextProjectileSpawnAtMs = spawn.nextSpawnAt;
  }

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
    finished: false,
    dailyLineCrossed: nextDailyLineCrossed,
    elapsedMs: nextElapsed,
    boost01,
    lastGroundSurfaceY,
    minFeetY,
    runStartFeetY: state.runStartFeetY,
    projectiles,
    nextProjectileSpawnAtMs,
    lastGroundedAtMs: grounded ? nextElapsed : state.lastGroundedAtMs,
    bufferedJumpAtMs,
    prevWantJump: wantJump,
  };
}

export const RUNNER_DRAW = {
  canvasW: 512,
  canvasH: 320,
  playerW: PLAYER_W,
  playerH: PLAYER_H,
  groundY: LAYOUT_FLOOR_Y,
} as const;
