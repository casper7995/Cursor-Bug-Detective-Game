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
  /**
   * Lane uptime per deploy — drains while the wave is active; at 0 the hero
   * leaves the lane (forces refresh / triage instead of infinite AFK beams).
   */
  readonly activeChargeSec: number;
}

export const AGENT_TRAY: readonly AgentTrayDef[] = [
  {
    kind: "fixer",
    label: "Fixer",
    blurb: "Cheap, sustained. Long uptime, fast recharge — steady repair beam.",
    cost: 20,
    recharge: 1.4,
    activeChargeSec: 18,
  },
  {
    kind: "reviewer",
    label: "Reviewer",
    blurb: "Slows the lane and chips. Mid cost, mid uptime.",
    cost: 30,
    recharge: 2.2,
    activeChargeSec: 12,
  },
  {
    kind: "firewall",
    label: "Firewall",
    blurb:
      "Burst nuker — biggest DPS for a few seconds. Save FOCUS for fat bugs and bosses.",
    cost: 42,
    recharge: 3.2,
    activeChargeSec: 6,
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
}

export const ENEMY_STATS: Record<EnemyKind, EnemyArchetype> = {
  syntaxBug: { maxHp: 22, speed: 0.17, leakDamage: 9, isBoss: false },
  regressionBug: {
    maxHp: 52,
    speed: 0.11,
    leakDamage: 12,
    isBoss: false,
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
  zeroDay: { maxHp: 240, speed: 0.058, leakDamage: 30, isBoss: true },
};

/** Lane-local agent (at most one per lane in v1). */
export interface PlacedAgent {
  readonly lane: LaneIndex;
  readonly kind: AgentKind;
  /**
   * Remaining active dispatch time (seconds). When it reaches 0 after a step,
   * the agent is removed from the lane. Not drained during inter-wave pause.
   */
  chargeSec: number;
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
  focusRegenPerSec: 11.5,
  startingFocus: 62,
  maxPlacedAgents: 3,
  /** Primary DPS from Fixer onto front enemy (see `fixerDpsMul` on archetypes). */
  fixerDps: 14,
  /** Chip DPS from Reviewer while slowing the lane — no enemy resist multiplier. */
  reviewerChipDps: 9,
  /** Burst DPS from Firewall on front threat (short lane uptime). */
  firewallChipDps: 38,
  reviewerSlowMul: 0.5,
  bossSummonInterval: 14,
  bossWarningLeadSec: 9,
  interWavePauseSec: 1.85,
  /** First wave that spawns a Zero-Day (after warning). */
  firstBossWave: 4,
  /** Notebook locks once current wave index reaches this (1-based) or time gate hits. */
  clueLockWaves: 3,
  clueLockSeconds: 60,
  scoreTierBoss: 700,
  scoreTierMarathon: 1000,
  marathonWaves: 8,
  marathonSeconds: 180,
} as const;
