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
  TAMPER_CONFIDENT_THRESHOLD,
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
 * - Each of the 6 calls rolls its own `tamperedSpotId` so the panel diff
 *   resets every call — knowing call 1's answer tells you nothing about
 *   call 2.
 * - About a third of calls lie (1..3 per seed). Lies cluster in the back
 *   half; lying calls let the player score a +250 catch by clicking the
 *   call's tampered spot (and +100 more if Bugbot was confident).
 */
export function buildTamperRound(seed: number): TamperRound {
  const rng = makeSeededRng(seed);
  const scene = pickSceneForSeed(rng);
  const spots = scene.spots;
  if (spots.length === 0) throw new Error("scene has no spots");

  const calls: TamperCall[] = [];
  const numLies = 1 + Math.floor(rng() * 3); // 1..3
  const lyingCallIndices = pickIndicesForLies(numLies, rng);
  // T-10: sample spots WITHOUT replacement so Bugbot doesn't point at the
  // same prop back-to-back. Used for the *pointing* axis only.
  let pointDeck: TamperSpot[] = shuffle(spots, rng);
  let pointIdx = 0;
  // Independent deck for the per-call tampered spot — fresh shuffle so the
  // tampered prop is decorrelated from Bugbot's pointing target.
  let tamperDeck: TamperSpot[] = shuffle(spots, rng);
  let tamperIdx = 0;

  for (let i = 0; i < TAMPER_CALLS_PER_ROUND; i++) {
    if (pointIdx >= pointDeck.length) {
      pointDeck = shuffle(spots, rng);
      pointIdx = 0;
    }
    if (tamperIdx >= tamperDeck.length) {
      tamperDeck = shuffle(spots, rng);
      tamperIdx = 0;
    }
    const pointSpot = pointDeck[pointIdx++] as TamperSpot;
    const tamperedSpot = tamperDeck[tamperIdx++] as TamperSpot;
    const truthIsTampered = pointSpot.id === tamperedSpot.id;
    const isLying = lyingCallIndices.has(i);
    const claim: "tampered" | "clean" = isLying
      ? truthIsTampered
        ? "clean"
        : "tampered"
      : truthIsTampered
        ? "tampered"
        : "clean";
    // Honest calls: uniform 60..99. Lying calls: floor rises with callIndex
    // so late-round lies tend to land in the 80s–90s (capped so we don't
    // exceed the 99 ceiling).
    const confFloor = isLying ? Math.min(90, 60 + i * 5) : 60;
    const confSpan = 100 - confFloor;
    const conf = confFloor + Math.floor(rng() * confSpan); // [floor..99]
    calls.push({
      callIndex: i,
      tamperedSpotId: tamperedSpot.id,
      bugbotPointsAtSpotId: pointSpot.id,
      bugbotClaim: claim,
      bugbotConfidencePct: conf,
      bugbotIsLying: isLying,
    });
  }

  // Distinct tampered spots (in encounter order) for the result-card teach
  // line. Falls back to the last call when the round somehow only saw one.
  const seen = new Set<string>();
  const tamperedSpotIdsThisRound: string[] = [];
  for (const c of calls) {
    if (!seen.has(c.tamperedSpotId)) {
      seen.add(c.tamperedSpotId);
      tamperedSpotIdsThisRound.push(c.tamperedSpotId);
    }
  }
  const lastTampered = calls[calls.length - 1]!.tamperedSpotId;

  return {
    scene,
    tamperedSpotId: lastTampered,
    tamperedSpotIdsThisRound,
    calls,
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

function pickIndicesForLies(n: number, rng: () => number): Set<number> {
  const out = new Set<number>();
  let safety = 0;
  const target = Math.min(n, TAMPER_CALLS_PER_ROUND);
  while (out.size < target && safety < 50) {
    const backHalf = rng() < 0.7;
    const idx = backHalf
      ? 3 + Math.floor(rng() * 3) // 3..5
      : Math.floor(rng() * 3); // 0..2
    out.add(idx);
    safety++;
  }
  return out;
}

export interface CallScore {
  readonly delta: number;
  readonly rightCall: boolean;
  readonly caughtLie: boolean;
  /** True when caughtLie AND Bugbot's confidence was at/above the threshold. */
  readonly confidentCatch: boolean;
}

/**
 * Decide if a player's verdict on a single call is correct. The "agree"/
 * "disagree" pair is symmetric:
 *   - Bugbot is honest → AGREE wins.
 *   - Bugbot is lying → DISAGREE wins.
 * "disagree-point" wins like a regular DISAGREE *and* awards CAUGHT_LIE if
 * the spot the player clicked matches the real tampered spot AND Bugbot was
 * lying. Pointing to the wrong spot is treated as a wrong call (penalty).
 *
 * Catching a lie at high confidence (>= TAMPER_CONFIDENT_THRESHOLD) earns an
 * additional CONFIDENT_CATCH_BONUS — the louder Bugbot is when wrong, the
 * more it's worth to call it out.
 */
export function scoreCall(call: TamperCall, verdict: CallVerdict): CallScore {
  const honest = !call.bugbotIsLying;
  switch (verdict.kind) {
    case "agree": {
      const right = honest;
      return {
        delta: right ? TAMPER_SCORE.RIGHT_CALL : TAMPER_SCORE.WRONG_CALL,
        rightCall: right,
        caughtLie: false,
        confidentCatch: false,
      };
    }
    case "disagree": {
      const right = !honest;
      return {
        delta: right ? TAMPER_SCORE.RIGHT_CALL : TAMPER_SCORE.WRONG_CALL,
        rightCall: right,
        caughtLie: false,
        confidentCatch: false,
      };
    }
    case "disagree-point": {
      // Player must (a) be right that Bugbot is lying AND (b) point at the
      // truly tampered spot for *this call*. Anything less is a wrong call.
      const right = !honest && verdict.spotId === call.tamperedSpotId;
      if (right) {
        const confident =
          call.bugbotConfidencePct >= TAMPER_CONFIDENT_THRESHOLD;
        const bonus = confident ? TAMPER_SCORE.CONFIDENT_CATCH_BONUS : 0;
        return {
          delta: TAMPER_SCORE.RIGHT_CALL + TAMPER_SCORE.CAUGHT_LIE + bonus,
          rightCall: true,
          caughtLie: true,
          confidentCatch: confident,
        };
      }
      return {
        delta: TAMPER_SCORE.WRONG_CALL,
        rightCall: false,
        caughtLie: false,
        confidentCatch: false,
      };
    }
    default: {
      const _: never = verdict;
      void _;
      return {
        delta: 0,
        rightCall: false,
        caughtLie: false,
        confidentCatch: false,
      };
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
    const r = scoreCall(call, v);
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
 * and `scoreCall`’s `rightCall` / `caughtLie` / `confidentCatch`.
 */
export function tamperVerdictFeedbackLine(
  verdict: CallVerdict,
  o: { rightCall: boolean; caughtLie: boolean; confidentCatch?: boolean },
): string {
  if (o.caughtLie) {
    return o.confidentCatch
      ? "Caught a confident lie!"
      : "Caught: you pointed to the real change.";
  }
  if (o.rightCall) {
    if (verdict.kind === "agree") {
      return "Correct: Bugbot was right.";
    }
    return "Correct: Bugbot was wrong.";
  }
  if (verdict.kind === "disagree-point") {
    return "That was not the changed prop.";
  }
  if (verdict.kind === "agree") {
    return "Miss — Bugbot was wrong about this prop.";
  }
  return "Miss — Bugbot was right about this prop.";
}

export function spotById(scene: TamperScene, id: string): TamperSpot | null {
  return scene.spots.find((s) => s.id === id) ?? null;
}
