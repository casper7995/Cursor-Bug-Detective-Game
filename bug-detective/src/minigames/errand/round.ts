/** Lane defense — pure helpers (determinism + scoring + clue lock). */

import { makeSeededRng } from "../../api/seedClient";
import {
  AGENT_TRAY,
  ENEMY_STATS,
  LANE_COUNT,
  LANE_DEFENSE,
  type AgentKind,
  type EnemyKind,
  type EnemyUnit,
  type LaneIndex,
  type PlacedAgent,
} from "./types";

export function namespacedSeed(base: number, label: string): number {
  let h = base >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Notebook clue locks when current wave reaches `clueLockWaves`, or time exceeds `clueLockSeconds`. */
export function survivalNotebookLock(
  waveNumber: number,
  secondsHeld: number,
): boolean {
  return (
    waveNumber >= LANE_DEFENSE.clueLockWaves ||
    secondsHeld >= LANE_DEFENSE.clueLockSeconds
  );
}

export interface LaneDefenseScoreInput {
  readonly clueLocked: boolean;
  readonly bossesDefeated: number;
  readonly completedWaves: number;
  readonly secondsHeld: number;
}

/**
 * 0 if no clue locked (early defeat). Otherwise tiered 400 / 700 / 1000.
 */
export function scoreLaneDefense(i: LaneDefenseScoreInput): number {
  if (!i.clueLocked) return 0;
  let s = 400;
  if (i.bossesDefeated >= 1) s = LANE_DEFENSE.scoreTierBoss;
  if (
    i.completedWaves >= LANE_DEFENSE.marathonWaves ||
    i.secondsHeld >= LANE_DEFENSE.marathonSeconds
  ) {
    s = LANE_DEFENSE.scoreTierMarathon;
  }
  return Math.max(0, Math.min(1000, s));
}

export interface WaveSpawnPlan {
  readonly wave: number;
  readonly kind: EnemyKind;
  readonly lane: LaneIndex;
}

function laneFromRng(rng: () => number): LaneIndex {
  return Math.floor(rng() * LANE_COUNT) as LaneIndex;
}

/** Picks non-boss enemy for filler spawns. */
export function pickSkirmishEnemy(wave: number, rng: () => number): EnemyKind {
  const roll = rng();
  if (wave <= 2) {
    if (roll < 0.65) return "syntaxBug";
    return "phishingPacket";
  }
  if (wave <= 5) {
    if (roll < 0.35) return "syntaxBug";
    if (roll < 0.7) return "regressionBug";
    if (roll < 0.88) return "phishingPacket";
    return "ransomwareBlob";
  }
  if (roll < 0.22) return "syntaxBug";
  if (roll < 0.5) return "regressionBug";
  if (roll < 0.78) return "phishingPacket";
  return "ransomwareBlob";
}

/**
 * Deterministic roster for a wave (excluding tutorial-scripted spawns).
 * Wave `w` has `3 + w * 2` bodies; boss waves append one Zero-Day at end.
 */
export function buildWaveSpawnRoster(
  seed: number,
  wave: number,
): readonly WaveSpawnPlan[] {
  const rng = makeSeededRng(namespacedSeed(seed, `wave:${wave}`));
  const count = 3 + wave * 2;
  const plans: WaveSpawnPlan[] = [];
  // First boss arrives on wave === firstBossWave; subsequent bosses every 3 waves.
  const bossThisWave =
    wave === LANE_DEFENSE.firstBossWave ||
    (wave > LANE_DEFENSE.firstBossWave &&
      (wave - LANE_DEFENSE.firstBossWave) % 3 === 0);

  for (let i = 0; i < count; i++) {
    plans.push({
      wave,
      kind: pickSkirmishEnemy(wave, rng),
      lane: laneFromRng(rng),
    });
  }
  if (bossThisWave) {
    plans.push({
      wave,
      kind: "zeroDay",
      lane: laneFromRng(rng),
    });
  }
  return plans;
}

export function spawnIntervalForWave(wave: number): number {
  return Math.max(0.85, 2.05 - wave * 0.07);
}

/**
 * Is a Zero-Day boss within `bossWarningLeadSec` of its spawn point in the
 * current wave? Used by the renderer to telegraph incoming bosses with a
 * ribbon flash. Returns null if no boss is queued in the rest of this wave.
 */
export function bossWarningActive(rt: {
  readonly roster: readonly WaveSpawnPlan[];
  readonly spawnIdx: number;
  readonly spawnAcc: number;
  readonly wave: number;
  readonly wavePause: number;
}): boolean {
  if (rt.wavePause > 0) return false;
  const interval = spawnIntervalForWave(rt.wave);
  for (let i = rt.spawnIdx; i < rt.roster.length; i++) {
    const plan = rt.roster[i];
    if (!plan) break;
    if (plan.kind !== "zeroDay") continue;
    const stepsAhead = i - rt.spawnIdx;
    const secsToSpawn =
      Math.max(0, interval - rt.spawnAcc) + stepsAhead * interval;
    return secsToSpawn <= LANE_DEFENSE.bossWarningLeadSec;
  }
  return false;
}

export function makeEnemyIdStream(seed: number): () => number {
  const rng = makeSeededRng(namespacedSeed(seed, "enemyIds"));
  let n = 1;
  return () => {
    n += 1 + Math.floor(rng() * 3);
    return n;
  };
}

export interface AgentQueueEntry {
  readonly kind: AgentKind;
  readyAt: number;
  promoted: boolean;
}

/** Create a unit at spawn line. */
export function spawnEnemyUnit(
  id: number,
  lane: LaneIndex,
  kind: EnemyKind,
): EnemyUnit {
  const st = ENEMY_STATS[kind];
  return {
    id,
    lane,
    kind,
    x: 1,
    hp: st.maxHp,
    maxHp: st.maxHp,
    baseSpeed: st.speed,
    leakDamage: st.leakDamage,
    isBoss: st.isBoss,
    bossSummonAcc: 0,
  };
}

// --- Runtime simulation (lane defense survival) ---

function rngStep(s: number): { u: number; next: number } {
  let state = s | 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { u, next: state >>> 0 };
}

function pullU(rt: LaneDefenseRuntime): number {
  const { u, next } = rngStep(rt.rng);
  rt.rng = next;
  return u;
}

export interface LaneDefenseRuntime {
  seed: number;
  rng: number;
  elapsed: number;
  baseHealth: number;
  capacity: number;
  focus: number;
  defeated: boolean;
  clueLocked: boolean;
  wave: number;
  roster: readonly WaveSpawnPlan[];
  spawnIdx: number;
  spawnAcc: number;
  wavePause: number;
  enemies: EnemyUnit[];
  placed: PlacedAgent[];
  nextEnemyId: number;
  bossesDefeated: number;
  wavesFinished: number;
  queue: AgentQueueEntry[];
  deployFx: DeployEffect[];
  nextDeployFxId: number;
  feedbackFx: FeedbackEffect[];
  nextFeedbackFxId: number;
  /** Frame counter that decays each step; renderer uses for BASE-meter shake. */
  baseHitShake: number;
  selectedTray: AgentKind | null;
}

export interface DeployEffect {
  readonly id: number;
  readonly kind: AgentKind;
  readonly lane: LaneIndex;
  readonly startedAt: number;
  readonly duration: number;
}

/**
 * Transient visual + audio cue. Renderer maps `kind` to an icon/color.
 * `worldX` is in the play-field's normalised x (1=spawn, 0=desk) so the
 * renderer can position relative to the lane row.
 */
export type FeedbackEffectKind = "kill" | "leak" | "spend";
export interface FeedbackEffect {
  readonly id: number;
  readonly kind: FeedbackEffectKind;
  readonly lane: LaneIndex;
  readonly worldX: number;
  readonly value: number;
  readonly startedAt: number;
  readonly duration: number;
}

export function createLaneDefenseRuntime(seed: number): LaneDefenseRuntime {
  const rng0 = namespacedSeed(seed, "laneDefenseCore") >>> 0;
  return {
    seed,
    rng: rng0,
    elapsed: 0,
    baseHealth: LANE_DEFENSE.baseHealthMax,
    capacity: LANE_DEFENSE.startingCapacity,
    focus: LANE_DEFENSE.startingFocus,
    defeated: false,
    clueLocked: false,
    wave: 1,
    roster: buildWaveSpawnRoster(seed, 1),
    spawnIdx: 0,
    spawnAcc: 0,
    wavePause: 0,
    enemies: [],
    placed: [],
    nextEnemyId: 1,
    bossesDefeated: 0,
    wavesFinished: 0,
    queue: AGENT_TRAY.map((a) => ({
      kind: a.kind,
      readyAt: 0,
      promoted: false,
    })),
    deployFx: [],
    nextDeployFxId: 1,
    feedbackFx: [],
    nextFeedbackFxId: 1,
    baseHitShake: 0,
    selectedTray: null,
  };
}

export function queueHead(rt: LaneDefenseRuntime): AgentQueueEntry | null {
  let best: { entry: AgentQueueEntry; index: number } | null = null;
  for (let index = 0; index < rt.queue.length; index++) {
    const entry = rt.queue[index]!;
    if (entry.readyAt > rt.elapsed) continue;
    if (best === null) {
      best = { entry, index };
      continue;
    }
    if (entry.promoted !== best.entry.promoted) {
      if (entry.promoted) best = { entry, index };
      continue;
    }
    if (index < best.index) best = { entry, index };
  }
  return best?.entry ?? null;
}

export function laneDefensePromoteAgent(
  rt: LaneDefenseRuntime,
  kind: AgentKind,
): LaneDefenseRuntime {
  if (rt.defeated || !rt.queue.some((q) => q.kind === kind)) return rt;
  return {
    ...rt,
    queue: rt.queue.map((q) => ({ ...q, promoted: q.kind === kind })),
  };
}

export function laneDefenseDeployToLane(
  rt: LaneDefenseRuntime,
  lane: LaneIndex,
): LaneDefenseRuntime {
  if (rt.defeated) return rt;
  const head = queueHead(rt);
  if (head === null) return rt;
  const def = AGENT_TRAY.find((a) => a.kind === head.kind);
  if (!def || rt.focus < def.cost) return rt;

  const hadLane = rt.placed.some((p) => p.lane === lane);
  const occupiedOther = rt.placed.filter((p) => p.lane !== lane).length;
  if (!hadLane && occupiedOther >= LANE_DEFENSE.maxPlacedAgents) return rt;

  return {
    ...rt,
    placed: rt.placed
      .filter((p) => p.lane !== lane)
      .concat({ lane, kind: def.kind }),
    deployFx: rt.deployFx.concat({
      id: rt.nextDeployFxId,
      kind: def.kind,
      lane,
      startedAt: rt.elapsed,
      duration: 0.62,
    }),
    nextDeployFxId: rt.nextDeployFxId + 1,
    feedbackFx: rt.feedbackFx.concat({
      id: rt.nextFeedbackFxId,
      kind: "spend",
      lane,
      worldX: 0.5,
      value: def.cost,
      startedAt: rt.elapsed,
      duration: 0.55,
    }),
    nextFeedbackFxId: rt.nextFeedbackFxId + 1,
    queue: rt.queue.map((q) =>
      q.kind === def.kind
        ? { ...q, readyAt: rt.elapsed + def.recharge, promoted: false }
        : q,
    ),
    focus: rt.focus - def.cost,
    selectedTray: null,
  };
}

export function laneDefensePickTray(
  rt: LaneDefenseRuntime,
  kind: AgentKind | null,
): LaneDefenseRuntime {
  return { ...rt, selectedTray: kind };
}

export function laneDefenseTryPlace(
  rt: LaneDefenseRuntime,
  lane: LaneIndex,
): LaneDefenseRuntime {
  if (rt.defeated || rt.selectedTray === null) return rt;
  const selected = rt.selectedTray;
  const promoted = laneDefensePromoteAgent(rt, selected);
  if (queueHead(promoted)?.kind !== selected) return rt;
  return laneDefenseDeployToLane(promoted, lane);
}

function frontEnemy(
  enemies: readonly EnemyUnit[],
  lane: LaneIndex,
): EnemyUnit | null {
  let best: EnemyUnit | null = null;
  let bx = Infinity;
  for (const e of enemies) {
    if (e.lane !== lane) continue;
    if (e.x < bx) {
      bx = e.x;
      best = e;
    }
  }
  return best;
}

function reviewerSlowLanes(placed: readonly PlacedAgent[]): Set<LaneIndex> {
  const s = new Set<LaneIndex>();
  for (const p of placed) {
    if (p.kind === "reviewer") s.add(p.lane);
  }
  return s;
}

export function stepLaneDefenseRuntime(
  rt: LaneDefenseRuntime,
  dt: number,
): LaneDefenseRuntime {
  if (rt.defeated || dt <= 0) return rt;

  const next: LaneDefenseRuntime = {
    ...rt,
    enemies: rt.enemies.map((e) => ({ ...e })),
    placed: rt.placed.map((p) => ({ ...p })),
    queue: rt.queue.map((q) => ({ ...q })),
    deployFx: rt.deployFx.map((fx) => ({ ...fx })),
    feedbackFx: rt.feedbackFx.map((fx) => ({ ...fx })),
  };

  next.elapsed += dt;
  next.deployFx = next.deployFx.filter(
    (fx) => next.elapsed - fx.startedAt < fx.duration,
  );
  next.feedbackFx = next.feedbackFx.filter(
    (fx) => next.elapsed - fx.startedAt < fx.duration,
  );
  next.baseHitShake = Math.max(0, next.baseHitShake - dt * 4);
  next.clueLocked = survivalNotebookLock(next.wave, next.elapsed);

  if (next.wavePause > 0) {
    next.wavePause -= dt;
    if (next.wavePause <= 0) {
      next.wavePause = 0;
      next.wavesFinished++;
      next.wave++;
      next.roster = buildWaveSpawnRoster(next.seed, next.wave);
      next.spawnIdx = 0;
      next.spawnAcc = 0;
    }
    return next;
  }

  next.focus = Math.min(
    LANE_DEFENSE.focusMax,
    next.focus + LANE_DEFENSE.focusRegenPerSec * dt,
  );
  next.capacity = Math.min(
    LANE_DEFENSE.capacityMax,
    next.capacity + LANE_DEFENSE.capacityRegenPerSec * dt,
  );

  const interval = spawnIntervalForWave(next.wave);
  next.spawnAcc += dt;
  while (next.spawnIdx < next.roster.length && next.spawnAcc >= interval) {
    next.spawnAcc -= interval;
    const plan = next.roster[next.spawnIdx]!;
    next.spawnIdx++;
    next.enemies.push(spawnEnemyUnit(next.nextEnemyId++, plan.lane, plan.kind));
  }

  const slow = reviewerSlowLanes(next.placed);

  for (const p of next.placed) {
    const front = frontEnemy(next.enemies, p.lane);
    if (!front || front.hp <= 0) continue;
    if (p.kind === "fixer") {
      front.hp -= LANE_DEFENSE.fixerDps * dt;
    }
  }

  const summons: EnemyUnit[] = [];
  for (const e of next.enemies) {
    if (e.isBoss) {
      e.bossSummonAcc += dt;
      if (e.bossSummonAcc >= LANE_DEFENSE.bossSummonInterval) {
        e.bossSummonAcc = 0;
        const lane = Math.floor(pullU(next) * LANE_COUNT) as LaneIndex;
        summons.push(spawnEnemyUnit(next.nextEnemyId++, lane, "syntaxBug"));
      }
    }
  }
  if (summons.length > 0) next.enemies.push(...summons);

  for (const e of next.enemies) {
    const mul = slow.has(e.lane) ? LANE_DEFENSE.reviewerSlowMul : 1;
    e.x -= e.baseSpeed * mul * dt;
  }

  let bossesDelta = 0;
  next.enemies = next.enemies.filter((e) => {
    if (e.hp > 0) return true;
    if (e.isBoss) bossesDelta++;
    next.feedbackFx.push({
      id: next.nextFeedbackFxId++,
      kind: "kill",
      lane: e.lane,
      worldX: e.x,
      value: e.maxHp,
      startedAt: next.elapsed,
      duration: 0.55,
    });
    return false;
  });
  next.bossesDefeated += bossesDelta;

  const afterLeak: EnemyUnit[] = [];
  for (const e of next.enemies) {
    if (e.x <= 0) {
      let dmg = e.leakDamage;
      const firewallHere = next.placed.some(
        (p) => p.lane === e.lane && p.kind === "firewall",
      );
      if (firewallHere) dmg *= LANE_DEFENSE.firewallLeakMul;
      let cap = next.capacity;
      const absorb = Math.min(cap, dmg);
      cap -= absorb;
      dmg -= absorb;
      next.baseHealth -= dmg;
      next.capacity = cap;
      next.feedbackFx.push({
        id: next.nextFeedbackFxId++,
        kind: "leak",
        lane: e.lane,
        worldX: 0,
        value: e.leakDamage,
        startedAt: next.elapsed,
        duration: 0.7,
      });
      // Only shake when health actually dropped (not when fully absorbed).
      if (dmg > 0) next.baseHitShake = 1;
      continue;
    }
    afterLeak.push(e);
  }
  next.enemies = afterLeak;

  if (next.baseHealth <= 0) {
    next.baseHealth = 0;
    next.defeated = true;
    next.enemies = [];
    return next;
  }

  if (
    next.spawnIdx >= next.roster.length &&
    next.enemies.length === 0 &&
    next.wavePause === 0
  ) {
    next.wavePause = LANE_DEFENSE.interWavePauseSec;
  }

  return next;
}

export function laneDefenseDeskScore(rt: LaneDefenseRuntime): number {
  return scoreLaneDefense({
    clueLocked: rt.clueLocked,
    bossesDefeated: rt.bossesDefeated,
    completedWaves: rt.wavesFinished,
    secondsHeld: rt.elapsed,
  });
}
