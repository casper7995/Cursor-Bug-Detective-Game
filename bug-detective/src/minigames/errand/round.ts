/** Errand Race round builder + scoring. Pure logic. */

import { makeSeededRng } from "../../api/seedClient";
import {
  ERRAND_NUM_DRAWERS,
  ERRAND_SCORE,
  type Drawer,
  type DrawerContent,
  type DrawerIndex,
  type ErrandRound,
  type HintIcon,
} from "./types";

const HINT_ICONS: readonly HintIcon[] = [
  "cup",
  "feather",
  "key",
  "question",
  "warn",
];

/** FNV-1a fold of a label into a base seed. */
export function namespacedSeed(base: number, label: string): number {
  let h = base >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
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

/**
 * Deterministic 5-drawer round.
 * - Distribution: 2 clues, 2 junks, 1 trap.
 * - Each drawer has a hint icon. The "hint truth map" defines which icon tends
 *   to lead to which content; per-drawer noise can flip an icon.
 * - Trap drawer's alert appears between 30% and 70% fill, and the push coin
 *   flip is decided up front.
 */
export function buildErrandRound(seed: number): ErrandRound {
  const rng = makeSeededRng(seed);

  // Choose the hint→content mapping (rotates per seed).
  const contents: DrawerContent[] = ["clue", "junk", "key" as DrawerContent /*placeholder*/];
  void contents;
  const tendencies: Record<HintIcon, DrawerContent> = {
    cup: "clue",
    feather: "junk",
    key: "clue",
    question: "junk",
    warn: "trap",
  };

  // Build the assignment of contents to drawers (2/2/1) then randomise order.
  const distribution: DrawerContent[] = [
    "clue",
    "clue",
    "junk",
    "junk",
    "trap",
  ];
  shuffle(distribution, rng);

  // Pick hint icons: each drawer gets the icon tending to its content, with
  // a small chance of getting a different icon (so players have to learn).
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
    const fillRateMs = 1500 + Math.floor(rng() * 1500); // 1500..3000
    const trapAlertAt01 = 0.3 + rng() * 0.4; // 0.3..0.7
    const trapPushIsClue = rng() < 0.5;
    drawers.push({
      index: i as DrawerIndex,
      hint,
      content,
      fillRateMs,
      trapAlertAt01,
      trapPushIsClue,
    });
  }
  return { drawers, hintTruthMap: tendencies };
}

export interface ErrandTotals {
  /** Clues delivered safely. */
  readonly clues: number;
  /** Helpers that returned safely (clue or junk). */
  readonly helpersSafe: number;
  /** Helpers lost (pushed-and-lost on a trap). */
  readonly helpersLost: number;
}

/** Pure scoring — base table + safe bonus + lost penalty, clamped [0,1000]. */
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

/**
 * Returns true if `helper` can be assigned to `drawerIdx` given `helpers`'s
 * existing assignments. False if another helper already owns that drawer.
 */
export function canAssignHelper(
  helpers: readonly { drawerAssigned: number | null }[],
  helperIdx: number,
  drawerIdx: number,
): boolean {
  return helpers.every(
    (h, i) => i === helperIdx || h.drawerAssigned !== drawerIdx,
  );
}
