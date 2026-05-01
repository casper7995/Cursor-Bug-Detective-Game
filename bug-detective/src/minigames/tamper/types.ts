/** Spot the Tampering — Bugbot mini. Pure types only. */

export type SceneId = "case-file-set" | "evidence-bench" | "lamp-corner";

export interface TamperSpot {
  /** Stable id within the scene; persists across same-seed builds. */
  readonly id: string;
  /** Center in 512×320 game-canvas coords. */
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /** ORIGINAL diff line (left / top block). */
  readonly label: string;
  /**
   * TONIGHT line when **this** spot is the round’s real tamper. Other rows
   * match `label` in both panels so the player can spot the one real change.
   */
  readonly tonightIfThisTampered: string;
  /** Key for `drawPropSketch` icon on ORIGINAL and on TONIGHT when not tampered. */
  readonly sketchKey: string;
  /**
   * Optional icon key for TONIGHT when this row is the real tamper — must be
   * a branch in `drawPropSketch` for a visible difference.
   */
  readonly tonightSketchKey?: string;
}

export interface TamperScene {
  readonly id: SceneId;
  /** Display name for the result card / Bugbot intro. */
  readonly displayName: string;
  /** All candidate spots — at least 5 per scene. Each call rolls its own
   *  tampered spot, so the panel diff resets every call. */
  readonly spots: readonly TamperSpot[];
}

export interface TamperCall {
  readonly callIndex: number;
  /**
   * Which spot is the real tampered prop on TONIGHT for **this call**.
   * Rerolled each call so every Bugbot decision asks the player to re-scan
   * the panels rather than reusing call 1's deduction.
   */
  readonly tamperedSpotId: string;
  /** Which spot Bugbot is pointing at this call. */
  readonly bugbotPointsAtSpotId: string;
  /** What Bugbot is claiming about that spot. */
  readonly bugbotClaim: "tampered" | "clean";
  /** 60..99. */
  readonly bugbotConfidencePct: number;
  /** Whether the claim disagrees with reality. */
  readonly bugbotIsLying: boolean;
}

export type CallVerdict =
  | { kind: "agree" }
  | { kind: "disagree" }
  | { kind: "disagree-point"; spotId: string };

export interface TamperRound {
  readonly scene: TamperScene;
  /** Distinct tampered spots seen across this round, in encounter order. */
  readonly tamperedSpotIdsThisRound: readonly string[];
  /** 6 calls Bugbot makes during the round. */
  readonly calls: readonly TamperCall[];
}

/**
 * Score weights — total clamped to [0, 1000]. Direction-correct calls earn a
 * flat base plus a speed bonus scaled by how much call time was left when the
 * verdict landed; pointing at the real change adds a small precision bonus.
 * Wrong calls do NOT subtract — the game competes on accuracy and speed,
 * not on punishing missed taps.
 */
export const TAMPER_SCORE = {
  /** Per right call (Yes/No matches reality on the highlighted prop). */
  RIGHT_CALL_BASE: 80,
  /** Max time bonus per right call (multiplied by remaining time fraction). */
  TIME_BONUS_MAX: 70,
  /** Bonus when player additionally points at the real change with disagree-point. */
  POINT_BONUS: 40,
  WRONG_CALL: 0,
} as const;

/** Threshold kept for back-compat (no longer changes scoring). */
export const TAMPER_CONFIDENT_THRESHOLD = 85;

export const TAMPER_CALLS_PER_ROUND = 6;

/** Minimum Agree/Disagree direction correct (of 6) to pin the desk clue. */
export const TAMPER_CLUE_MIN_RIGHT_VERDICTS = 4;
