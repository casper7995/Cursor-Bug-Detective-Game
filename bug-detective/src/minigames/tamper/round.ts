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
 * Build a deterministic 6-call round from the (already-namespaced) seed.
 * - Picks one of the scenes.
 * - Marks exactly one spot as the real tampered spot.
 * - Generates 6 Bugbot calls. About a third of them lie (2 of 6 by default,
 *   can vary 1..3 per seed). Each lying call is the player's chance to score
 *   a +250 catch by clicking the real tampered spot.
 */
export function buildTamperRound(seed: number): TamperRound {
  const rng = makeSeededRng(seed);
  const baseScene = pickSceneForSeed(rng);
  const spots = baseScene.spots;
  if (spots.length === 0) throw new Error("scene has no spots");

  // Pick the tampered spot deterministically.
  const tamperedIdx = Math.floor(rng() * spots.length) % spots.length;
  const tamperedSpot = spots[tamperedIdx] as TamperSpot;

  const scene: TamperScene = {
    ...baseScene,
    spots: spots.map((s, i) => ({ ...s, tampered: i === tamperedIdx })),
  };

  const calls: TamperCall[] = [];
  // Distribute 6 calls across spots so the player sees variety. Bugbot picks
  // a random spot each call (with replacement). About 2 of 6 calls are lies
  // — at least 1, at most 3 per seed.
  const numLies = 1 + Math.floor(rng() * 3); // 1..3
  const lyingCallIndices = pickIndicesForLies(numLies, rng);
  for (let i = 0; i < TAMPER_CALLS_PER_ROUND; i++) {
    const spot = spots[Math.floor(rng() * spots.length)] as TamperSpot;
    const truthIsTampered = spot.id === tamperedSpot.id;
    const isLying = lyingCallIndices.has(i);
    const claim: "tampered" | "clean" = isLying
      ? truthIsTampered
        ? "clean"
        : "tampered"
      : truthIsTampered
        ? "tampered"
        : "clean";
    const conf = 60 + Math.floor(rng() * 40); // 60..99
    calls.push({
      callIndex: i,
      bugbotPointsAtSpotId: spot.id,
      bugbotClaim: claim,
      bugbotConfidencePct: conf,
      bugbotIsLying: isLying,
    });
  }

  return { scene, tamperedSpotId: tamperedSpot.id, calls };
}

function pickIndicesForLies(n: number, rng: () => number): Set<number> {
  const out = new Set<number>();
  let safety = 0;
  while (out.size < Math.min(n, TAMPER_CALLS_PER_ROUND) && safety < 50) {
    out.add(Math.floor(rng() * TAMPER_CALLS_PER_ROUND));
    safety++;
  }
  return out;
}

/**
 * Decide if a player's verdict on a single call is correct. The "agree"/
 * "disagree" pair is symmetric:
 *   - Bugbot is honest → AGREE wins.
 *   - Bugbot is lying → DISAGREE wins.
 * "disagree-point" wins like a regular DISAGREE *and* awards CAUGHT_LIE if
 * the spot the player clicked matches the real tampered spot AND Bugbot was
 * lying. Pointing to the wrong spot is treated as a wrong call (penalty).
 */
export function scoreCall(
  call: TamperCall,
  verdict: CallVerdict,
  tamperedSpotId: string,
): { delta: number; rightCall: boolean; caughtLie: boolean } {
  const honest = !call.bugbotIsLying;
  switch (verdict.kind) {
    case "agree": {
      const right = honest;
      return {
        delta: right ? TAMPER_SCORE.RIGHT_CALL : TAMPER_SCORE.WRONG_CALL,
        rightCall: right,
        caughtLie: false,
      };
    }
    case "disagree": {
      const right = !honest;
      return {
        delta: right ? TAMPER_SCORE.RIGHT_CALL : TAMPER_SCORE.WRONG_CALL,
        rightCall: right,
        caughtLie: false,
      };
    }
    case "disagree-point": {
      // Player must (a) be right that Bugbot is lying AND (b) point at the
      // truly tampered spot. Anything less is a wrong call.
      const right = !honest && verdict.spotId === tamperedSpotId;
      if (right) {
        return {
          delta: TAMPER_SCORE.RIGHT_CALL + TAMPER_SCORE.CAUGHT_LIE,
          rightCall: true,
          caughtLie: true,
        };
      }
      return {
        delta: TAMPER_SCORE.WRONG_CALL,
        rightCall: false,
        caughtLie: false,
      };
    }
    default: {
      const _: never = verdict;
      void _;
      return { delta: 0, rightCall: false, caughtLie: false };
    }
  }
}

export interface TamperResult {
  readonly score: number;
  readonly rightCalls: number;
  readonly wrongCalls: number;
  readonly caughtLies: number;
  readonly accuracy01: number;
}

/** Sum + clamp the per-call deltas. */
export function scoreTamperRound(
  round: TamperRound,
  verdicts: readonly CallVerdict[],
): TamperResult {
  let total = 0;
  let right = 0;
  let wrong = 0;
  let caught = 0;
  const n = Math.min(round.calls.length, verdicts.length);
  for (let i = 0; i < n; i++) {
    const call = round.calls[i] as TamperCall;
    const v = verdicts[i] as CallVerdict;
    const r = scoreCall(call, v, round.tamperedSpotId);
    total += r.delta;
    if (r.rightCall) right++;
    else wrong++;
    if (r.caughtLie) caught++;
  }
  const score = Math.max(0, Math.min(1000, total));
  return {
    score,
    rightCalls: right,
    wrongCalls: wrong,
    caughtLies: caught,
    accuracy01: n > 0 ? right / n : 0,
  };
}

/** Desk clue: need solid calls plus at least one caught lie. */
export function tamperEarnsDeskClue(result: TamperResult): boolean {
  return result.rightCalls >= 3 && result.caughtLies >= 1;
}

/**
 * One-line result flash after each call, tied to the chosen verdict
 * and `scoreCall`’s `rightCall` / `caughtLie`.
 */
export function tamperVerdictFeedbackLine(
  verdict: CallVerdict,
  o: { rightCall: boolean; caughtLie: boolean },
): string {
  if (o.caughtLie) {
    return "Caught: you pointed to the real change.";
  }
  if (o.rightCall) {
    if (verdict.kind === "agree") {
      return "Correct: Bugbot was right.";
    }
    return "Correct: Bugbot was wrong.";
  }
  if (verdict.kind === "disagree-point") {
    return "That was not the changed row.";
  }
  if (verdict.kind === "agree") {
    return "Miss — Bugbot was wrong about this row.";
  }
  return "Miss — Bugbot was right about this row.";
}

export function spotById(scene: TamperScene, id: string): TamperSpot | null {
  return scene.spots.find((s) => s.id === id) ?? null;
}
