/** Spot the Tampering — Bugbot mini. Pure types only. */

export type SceneId = "case-file-set" | "evidence-bench" | "lamp-corner";

export interface TamperSpot {
  /** Stable id within the scene; persists across same-seed builds. */
  readonly id: string;
  /** Center in 512×320 game-canvas coords. */
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /**
   * True if the spot is the real tampered prop in TONIGHT (the right-hand
   * panel). Each round has exactly one tampered spot.
   */
  readonly tampered: boolean;
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
  /** All candidate spots — at least 5 per scene; one of them carries
   *  `tampered: true` when the round is built. */
  readonly spots: readonly TamperSpot[];
}

export interface TamperCall {
  readonly callIndex: number;
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
  /** Spot id of the real tampered evidence. */
  readonly tamperedSpotId: string;
  /** 6 calls Bugbot makes during the round. */
  readonly calls: readonly TamperCall[];
}

/** Score weights — total clamped to [0, 1000]. */
export const TAMPER_SCORE = {
  RIGHT_CALL: 150,
  WRONG_CALL: -75,
  CAUGHT_LIE: 250,
  /** Extra reward when the caught lie was high-confidence (>= 85%). */
  CONFIDENT_CATCH_BONUS: 100,
} as const;

/** Threshold used to decide whether a caught lie earns the confident-catch bonus. */
export const TAMPER_CONFIDENT_THRESHOLD = 85;

export const TAMPER_CALLS_PER_ROUND = 6;
