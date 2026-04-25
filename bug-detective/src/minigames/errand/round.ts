/** Errand Race round builder + scoring. Pure logic. */

import { makeSeededRng } from "../../api/seedClient";
import {
  ERRAND_NUM_DRAWERS,
  ERRAND_SCORE,
  type AgentTrait,
  type Drawer,
  type DrawerContent,
  type DrawerIndex,
  type ErrandRound,
  type HintIcon,
  type TaskSignalProfile,
} from "./types";

const HINT_ICONS: readonly HintIcon[] = [
  "cup",
  "feather",
  "key",
  "question",
  "warn",
];

export function namespacedSeed(base: number, label: string): number {
  let h = base >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lerp01(a: number, b: number, t: number): number {
  return Math.min(1, Math.max(0, a + (b - a) * t));
}

function taskSignalProfileFor(
  content: DrawerContent,
  drawerIdx: number,
  rng: () => number,
): TaskSignalProfile {
  const wobble = 0.18;
  let rRel: number;
  let rSafe: number;
  let rUrg: number;
  switch (content) {
    case "clue":
      rRel = 0.55 + rng() * 0.45;
      rSafe = 0.5 + rng() * 0.4;
      rUrg = 0.2 + rng() * 0.6;
      break;
    case "junk":
      rRel = 0.2 + rng() * 0.4;
      rSafe = 0.4 + rng() * 0.45;
      rUrg = 0.2 + rng() * 0.6;
      break;
    case "trap":
      rRel = 0.25 + rng() * 0.5;
      rSafe = 0.1 + rng() * 0.35;
      rUrg = 0.45 + rng() * 0.5;
      break;
    default: {
      const _e: never = content;
      throw new Error(String(_e));
    }
  }
  const f = (x: number) => lerp01(x, rng(), wobble * (0.5 + drawerIdx * 0.1));
  return {
    relevance01: f(rRel),
    safety01: f(rSafe),
    urgency01: f(rUrg),
  };
}

/** After Inspect, nudge the visible meters toward a blend with the true drawer content. */
export function nudgeSignalsAfterInspect(
  content: DrawerContent,
  p: TaskSignalProfile,
): TaskSignalProfile {
  let t: TaskSignalProfile;
  switch (content) {
    case "clue":
      t = { relevance01: 0.9, safety01: 0.75, urgency01: 0.5 };
      break;
    case "junk":
      t = { relevance01: 0.3, safety01: 0.65, urgency01: 0.4 };
      break;
    case "trap":
      t = { relevance01: 0.45, safety01: 0.15, urgency01: 0.85 };
      break;
    default: {
      const _e: never = content;
      throw new Error(String(_e));
    }
  }
  const blend = 0.55;
  return {
    relevance01: lerp01(p.relevance01, t.relevance01, blend),
    safety01: lerp01(p.safety01, t.safety01, blend),
    urgency01: lerp01(p.urgency01, t.urgency01, blend),
  };
}

function makeAgentTraits(
  rng: () => number,
): [AgentTrait, AgentTrait, AgentTrait] {
  const pool: AgentTrait[] = [
    { label: "fast", paceScale: 0.9 },
    { label: "steady", paceScale: 1.0 },
    { label: "careful", paceScale: 1.12 },
  ];
  shuffle(pool, rng);
  return [pool[0]!, pool[1]!, pool[2]!];
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = arr[i] as T;
    const b = arr[j] as T;
    arr[i] = b;
    arr[j] = a;
  }
  return arr;
}

export function buildErrandRound(seed: number): ErrandRound {
  const rng = makeSeededRng(seed);
  const agentTraits = makeAgentTraits(rng);
  const tendencies: Record<HintIcon, DrawerContent> = {
    cup: "clue",
    feather: "junk",
    key: "clue",
    question: "junk",
    warn: "trap",
  };
  const distribution: DrawerContent[] = [
    "clue",
    "clue",
    "junk",
    "junk",
    "trap",
  ];
  shuffle(distribution, rng);
  const noise = 0.2;
  const drawers: Drawer[] = [];
  for (let i = 0; i < ERRAND_NUM_DRAWERS; i++) {
    const content = distribution[i] as DrawerContent;
    const matchingIcons = HINT_ICONS.filter(
      (icon) => tendencies[icon] === content,
    );
    let hint: HintIcon;
    if (matchingIcons.length > 0 && rng() > noise) {
      hint = matchingIcons[
        Math.floor(rng() * matchingIcons.length)
      ] as HintIcon;
    } else {
      hint = HINT_ICONS[Math.floor(rng() * HINT_ICONS.length)] as HintIcon;
    }
    const fillRateMs = 1500 + Math.floor(rng() * 1500);
    const signalProfile = taskSignalProfileFor(content, i, rng);
    const trapAlertAt01 = 0.3 + rng() * 0.4;
    const trapPushIsClue = rng() < 0.5;
    drawers.push({
      index: i as DrawerIndex,
      hint,
      content,
      fillRateMs,
      signalProfile,
      trapAlertAt01,
      trapPushIsClue,
    });
  }
  return { drawers, hintTruthMap: tendencies, agentTraits };
}

export interface ErrandTotals {
  readonly clues: number;
  readonly helpersSafe: number;
  readonly helpersLost: number;
}

export function scoreErrandRun(t: ErrandTotals): number {
  let base = 0;
  if (t.clues >= 3) base = ERRAND_SCORE.THREE;
  else if (t.clues === 2) base = ERRAND_SCORE.TWO;
  else if (t.clues === 1) base = ERRAND_SCORE.ONE;
  else base = ERRAND_SCORE.ZERO;
  if (t.clues === 0) return 0;
  if (t.helpersLost === 0) base += ERRAND_SCORE.SAFE_BONUS;
  base += t.helpersLost * ERRAND_SCORE.LOST_PENALTY;
  return Math.max(0, Math.min(1000, base));
}

/** Desk clue: require at least two player-issued dispatches and one delivered clue. */
export function errandEarnsDeskClue(
  playerDispatched: number,
  clueCount: number,
): boolean {
  return playerDispatched >= 2 && clueCount >= 1;
}

export function canAssignHelper(
  helpers: readonly { drawerAssigned: number | null }[],
  helperIdx: number,
  drawerIdx: number,
): boolean {
  return helpers.every(
    (h, i) => i === helperIdx || h.drawerAssigned !== drawerIdx,
  );
}
