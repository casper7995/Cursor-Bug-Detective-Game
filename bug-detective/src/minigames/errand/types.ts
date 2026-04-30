/** Cursor Agents lane defense — desk mini (notebook slot remains `errand`). */

export const LANE_COUNT = 3;
export type LaneIndex = 0 | 1 | 2;

export type AgentKind = "fixer" | "reviewer" | "firewall";

export type EnemyKind =
  | "syntaxBug"
  | "regressionBug"
  | "phishingPacket"
  | "ransomwareBlob"
  | "zeroDay";

export interface AgentTrayDef {
  readonly kind: AgentKind;
  readonly label: string;
  /** Short tooltip for queue / tutorial. */
  readonly blurb: string;
  readonly cost: number;
  /** Seconds before this Hero can return to the head of the queue. */
  readonly recharge: number;
}

export const AGENT_TRAY: readonly AgentTrayDef[] = [
  {
    kind: "fixer",
    label: "Fixer",
    blurb: "Steady repair beam on the front threat in this lane.",
    cost: 25,
    recharge: 1.6,
  },
  {
    kind: "reviewer",
    label: "Reviewer",
    blurb: "Slows everything pushing through this lane.",
    cost: 35,
    recharge: 2.2,
  },
  {
    kind: "firewall",
    label: "Firewall",
    blurb: "Halves desk damage when leaks slip past in this lane.",
    cost: 45,
    recharge: 2.8,
  },
] as const;

export interface EnemyArchetype {
  readonly maxHp: number;
  readonly speed: number;
  readonly leakDamage: number;
  readonly isBoss: boolean;
  /**
   * Multiplier applied to Fixer DPS against this enemy. <1 makes the enemy
   * Fixer-resistant, encouraging Reviewer slow + sustained DPS, or stacking
   * multiple Fixers across lanes. Defaults to 1.
   */
  readonly fixerDpsMul?: number;
  /**
   * Multiplier on leak damage when NO Firewall is present in the leaked
   * lane. >1 punishes "no Firewall" play, encouraging the Firewall pick on
   * waves heavy in this enemy. Defaults to 1.
   */
  readonly noFirewallLeakMul?: number;
}

export const ENEMY_STATS: Record<EnemyKind, EnemyArchetype> = {
  syntaxBug: { maxHp: 22, speed: 0.17, leakDamage: 9, isBoss: false },
  regressionBug: {
    maxHp: 52,
    speed: 0.11,
    leakDamage: 12,
    isBoss: false,
    // Heavy hitter — without Firewall to soften, leaks twice as hard.
    noFirewallLeakMul: 2,
  },
  phishingPacket: {
    maxHp: 18,
    speed: 0.26,
    leakDamage: 10,
    isBoss: false,
    // Slippery — Fixer DPS bounces off; Reviewer slow buys time.
    fixerDpsMul: 0.5,
  },
  ransomwareBlob: { maxHp: 110, speed: 0.055, leakDamage: 18, isBoss: false },
  zeroDay: { maxHp: 380, speed: 0.075, leakDamage: 32, isBoss: true },
};

/** Lane-local agent (at most one per lane in v1). */
export interface PlacedAgent {
  readonly lane: LaneIndex;
  readonly kind: AgentKind;
}

export interface EnemyUnit {
  id: number;
  lane: LaneIndex;
  kind: EnemyKind;
  /** 1 = right/spawn, 0 = desk line. */
  x: number;
  hp: number;
  maxHp: number;
  baseSpeed: number;
  leakDamage: number;
  isBoss: boolean;
  /** Boss: summon a syntax bug every N seconds. */
  bossSummonAcc: number;
}

export const LANE_DEFENSE = {
  baseHealthMax: 100,
  /** Routing capacity — absorbs leaks before core desk HP. */
  capacityMax: 56,
  capacityRegenPerSec: 5.5,
  startingCapacity: 56,
  focusMax: 100,
  focusRegenPerSec: 8.5,
  startingFocus: 48,
  maxPlacedAgents: 3,
  /** DPS onto front enemy in lane. */
  fixerDps: 13,
  reviewerSlowMul: 0.52,
  /** Leak damage multiplier when a firewall is present in that lane. */
  firewallLeakMul: 0.5,
  bossSummonInterval: 11,
  bossWarningLeadSec: 9,
  interWavePauseSec: 1.85,
  /** First wave that spawns a Zero-Day (after warning). */
  firstBossWave: 2,
  /** Notebook locks once current wave index reaches this (1-based) or time gate hits. */
  clueLockWaves: 3,
  clueLockSeconds: 60,
  scoreTierBoss: 700,
  scoreTierMarathon: 1000,
  marathonWaves: 8,
  marathonSeconds: 180,
} as const;
