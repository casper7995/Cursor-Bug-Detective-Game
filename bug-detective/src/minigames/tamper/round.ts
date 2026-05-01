/** Pure round-builder + scoring for Spot the Tampering. */

import { makeSeededRng } from "../../api/seedClient";
import { TAMPER_SCENES } from "./scenes";
import {
  type CallVerdict,
  type TamperCall,
  type TamperRound,
  type TamperScene,
  type TamperSpot,
  TAMPER_CALLS_PER_ROUND,
  TAMPER_CLUE_MIN_RIGHT_VERDICTS,
  TAMPER_SCORE,
} from "./types";

/** FNV-1a fold of a label into a base seed. */
export function namespacedSeed(base: number, label: string): number {
  let h = base >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickSceneForSeed(rng: () => number): TamperScene {
  const idx = Math.floor(rng() * TAMPER_SCENES.length);
  return TAMPER_SCENES[idx % TAMPER_SCENES.length] as TamperScene;
}

/**
 * Build a deterministic 6-call round. Each call rolls its own tampered
 * spot (independent deck from Bugbot's pointing target) so the panel
 * diff resets every call. Lies cluster in the back half so tension ramps.
 */
export function buildTamperRound(seed: number): TamperRound {
  const rng = makeSeededRng(seed);
  const scene = pickSceneForSeed(rng);
  const spots = scene.spots;
  if (spots.length === 0) throw new Error("scene has no spots");

  // T-10: without-replacement decks so Bugbot doesn't point at — or tamper
  // — the same prop back-to-back. Independent decks decorrelate the two axes.
  const pointDeck = makeWithoutReplacementDeck(spots, rng);
  const tamperDeck = makeWithoutReplacementDeck(spots, rng);
  const calls: TamperCall[] = [];

  // Bias roughly half the calls so Bugbot points at the real change (keeps
  // both Yes/No verdicts in play across a round). The deck pulls already give
  // a fair distribution; we let RNG decide and only nudge when needed.
  for (let i = 0; i < TAMPER_CALLS_PER_ROUND; i++) {
    let pointSpot = pointDeck();
    const tamperedSpot = tamperDeck();
    if (i < 2 && pointSpot.id !== tamperedSpot.id) {
      // Force the first call (and sometimes the second) to be a "Yes" so
      // tutorial flow trains the most common case first.
      if (i === 0) pointSpot = tamperedSpot;
    }
    const circledIsReal = pointSpot.id === tamperedSpot.id;
    // Bugbot's claim is purely cosmetic chatter now — it always frames the
    // pointed prop as the suspect. The player judges whether the highlighted
    // prop actually changed; the chat line is flavor, not a logic puzzle.
    const claim: "tampered" | "clean" = "tampered";
    const conf = 60 + Math.floor(rng() * 40);
    calls.push({
      callIndex: i,
      tamperedSpotId: tamperedSpot.id,
      bugbotPointsAtSpotId: pointSpot.id,
      bugbotClaim: claim,
      bugbotConfidencePct: conf,
      // Kept for back-compat: "lying" now means "Bugbot pointed at the wrong
      // prop." Scoring no longer reads this field.
      bugbotIsLying: !circledIsReal,
    });
  }

  // Distinct tampered spots in encounter order — feeds the result-card recap.
  const seen = new Set<string>();
  const tamperedSpotIdsThisRound: string[] = [];
  for (const c of calls) {
    if (!seen.has(c.tamperedSpotId)) {
      seen.add(c.tamperedSpotId);
      tamperedSpotIdsThisRound.push(c.tamperedSpotId);
    }
  }

  return { scene, tamperedSpotIdsThisRound, calls };
}

/**
 * Stateful "deck" — returns the next spot, reshuffling when exhausted.
 * Same shuffle is used for both the pointing axis and the tamper axis.
 */
function makeWithoutReplacementDeck(
  spots: readonly TamperSpot[],
  rng: () => number,
): () => TamperSpot {
  let deck = shuffle(spots, rng);
  let idx = 0;
  return () => {
    if (idx >= deck.length) {
      deck = shuffle(spots, rng);
      idx = 0;
    }
    return deck[idx++] as TamperSpot;
  };
}

/**
 * Pick which call indices Bugbot will lie on. We bias toward the back half
 * of the round (calls 4–6, indices 3..5) so tension ramps; the front half is
 * where the player learns the scene. ~70% back-half / ~30% front-half draws.
 */
/**
 * Fisher–Yates shuffle, returns a fresh array. Deterministic because rng
 * is seeded — same seed yields same order across runs.
 */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

export interface CallScore {
  readonly delta: number;
  readonly rightCall: boolean;
  /** Player additionally pointed at the real changed prop (precision bonus). */
  readonly pointBonus: boolean;
  /** Back-compat flags — always false in the new model. */
  readonly caughtLie: boolean;
  readonly confidentCatch: boolean;
}

/**
 * Did Bugbot circle the prop that actually changed in TONIGHT? Drives every
 * verdict — the question the player answers each call.
 */
export function circledIsRealChange(call: TamperCall): boolean {
  return call.bugbotPointsAtSpotId === call.tamperedSpotId;
}

/**
 * Direction correctness keyed off the highlighted prop, NOT off Bugbot's
 * "claim" line. Player rule: hit YES (agree) when the circled prop is the
 * real change; hit NO (disagree / disagree-point) when it isn't.
 */
export function verdictDirectionCorrect(
  call: TamperCall,
  verdict: CallVerdict,
): boolean {
  const real = circledIsRealChange(call);
  if (real) return verdict.kind === "agree";
  return verdict.kind === "disagree" || verdict.kind === "disagree-point";
}

/**
 * Per-call score. `timeFrac01` is how much call time was left when the
 * player committed (1 = fast tap, 0 = let the clock run out). Wrong calls
 * never go negative — players compete on accuracy + speed.
 */
export function scoreCall(
  call: TamperCall,
  verdict: CallVerdict,
  timeFrac01 = 0,
): CallScore {
  const right = verdictDirectionCorrect(call, verdict);
  if (!right) {
    return {
      delta: TAMPER_SCORE.WRONG_CALL,
      rightCall: false,
      pointBonus: false,
      caughtLie: false,
      confidentCatch: false,
    };
  }
  const t = Math.max(0, Math.min(1, timeFrac01));
  let delta =
    TAMPER_SCORE.RIGHT_CALL_BASE + Math.round(TAMPER_SCORE.TIME_BONUS_MAX * t);
  let pointBonus = false;
  if (
    verdict.kind === "disagree-point" &&
    !circledIsRealChange(call) &&
    verdict.spotId === call.tamperedSpotId
  ) {
    delta += TAMPER_SCORE.POINT_BONUS;
    pointBonus = true;
  }
  return {
    delta,
    rightCall: true,
    pointBonus,
    caughtLie: pointBonus,
    confidentCatch: false,
  };
}

export interface TamperResult {
  readonly score: number;
  /** Calls where the verdict matched reality (Yes/No on circled prop). */
  readonly rightCalls: number;
  /** Same as rightCalls — kept for back-compat with the result UI. */
  readonly rightVerdicts: number;
  readonly wrongCalls: number;
  /** Number of right calls that also pointed at the real change for bonus. */
  readonly caughtLies: number;
  readonly accuracy01: number;
  /** Average remaining-time fraction across right calls (0..1). */
  readonly avgTimeFrac01: number;
}

/**
 * Sum + clamp the per-call deltas. `timeFracs` is parallel to `verdicts`;
 * a missing entry counts as 0 (no speed bonus).
 */
export function scoreTamperRound(
  round: TamperRound,
  verdicts: readonly CallVerdict[],
  timeFracs: readonly number[] = [],
): TamperResult {
  let total = 0;
  let right = 0;
  let wrong = 0;
  let bonus = 0;
  let timeAcc = 0;
  const n = Math.min(round.calls.length, verdicts.length);
  for (let i = 0; i < n; i++) {
    const call = round.calls[i] as TamperCall;
    const v = verdicts[i] as CallVerdict;
    const t = timeFracs[i] ?? 0;
    const r = scoreCall(call, v, t);
    total += r.delta;
    if (r.rightCall) {
      right++;
      timeAcc += Math.max(0, Math.min(1, t));
    } else {
      wrong++;
    }
    if (r.pointBonus) bonus++;
  }
  const score = Math.max(0, Math.min(1000, total));
  return {
    score,
    rightCalls: right,
    rightVerdicts: right,
    wrongCalls: wrong,
    caughtLies: bonus,
    accuracy01: n > 0 ? right / n : 0,
    avgTimeFrac01: right > 0 ? timeAcc / right : 0,
  };
}

/** Desk clue: enough correct Agree/Disagree calls (see TAMPER_CLUE_MIN_RIGHT_VERDICTS). */
export function tamperEarnsDeskClue(result: TamperResult): boolean {
  return result.rightVerdicts >= TAMPER_CLUE_MIN_RIGHT_VERDICTS;
}

/**
 * One-line result flash after each call. Plain English: the question is
 * always "did the highlighted prop change?"; the line just confirms or denies.
 */
export function tamperVerdictFeedbackLine(
  verdict: CallVerdict,
  o: {
    rightCall: boolean;
    caughtLie?: boolean;
    pointBonus?: boolean;
    confidentCatch?: boolean;
  },
): string {
  const point = o.pointBonus ?? o.caughtLie ?? false;
  if (point) return "Nice — you pointed at the real change.";
  if (o.rightCall) {
    if (verdict.kind === "agree") return "Correct — that prop changed.";
    return "Correct — that prop is clean.";
  }
  if (verdict.kind === "disagree-point") return "That wasn’t the real change.";
  if (verdict.kind === "agree") return "Miss — that prop didn’t change.";
  return "Miss — that prop actually changed.";
}

export function spotById(scene: TamperScene, id: string): TamperSpot | null {
  return scene.spots.find((s) => s.id === id) ?? null;
}
