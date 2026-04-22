import * as THREE from "three";
import { makeCaseFileBlankDeskTexture } from "../intro/pagePeel";
import {
  type DioramaObjects,
  makeCalendarTexture,
  makeMugLabelTexture,
  makeEvidenceEnvelopeTexture,
  makePhotoTexture,
} from "./desktopDiorama";
import { makeSeededRng } from "../api/seedClient";

export type AnomalyId =
  | "calendar-tomorrow"
  | "mug-name"
  | "clock-ccw"
  | "monitor-reflection"
  | "photo-self"
  | "sticky-warning"
  | "pen-floating"
  | "lamp-shadow-wrong"
  | "steam-down"
  | "blank-book"
  | "keyboard-extra-key"
  | "plant-glitching";

export interface AnomalyDef {
  readonly id: AnomalyId;
  /** userData.tag of the prop the bug lives on. Used for hover-detect scoring. */
  readonly targetTag: string;
  /** Four single-word clues (mini-games) — combined they disambiguate the daily case. */
  readonly gameClueWords: {
    readonly runner: string;
    readonly sentence: string;
    readonly errand: string;
    readonly tamper: string;
  };
  /** Short tooltip shown when the player hovers the anomalous prop. */
  readonly tooltipHint: string;
  /** Long-form reveal text shown after the player answers. */
  readonly revealText: string;
  /** The string shown on the correct answer button. */
  readonly correctChoice: string;
  /** Pool of near-miss labels (≥4) — picker chooses 2 distractors. */
  readonly distractorPool: readonly string[];
  /** Mutate the diorama to introduce the anomaly. */
  readonly apply: (objects: DioramaObjects) => void;
}

export interface PickedAnomaly {
  readonly def: AnomalyDef;
  /** 3 strings ordered for display in the answer panel. */
  readonly choices: readonly string[];
  /** Index into `choices` of the correct answer. */
  readonly correctIndex: number;
}

// ---------------------------------------------------------------------
// Anomaly pool — 12 entries (ships 12, spec target = 10 minimum).
// ---------------------------------------------------------------------

export const ANOMALIES: readonly AnomalyDef[] = [
  {
    id: "calendar-tomorrow",
    targetTag: "calendar",
    gameClueWords: {
      runner: "AHEAD",
      sentence: "DAWN",
      errand: "PLUS",
      tamper: "LOOP",
    },
    tooltipHint: "calendar — date looks off",
    revealText: "The calendar shows tomorrow's date — one day too far ahead.",
    correctChoice: "Calendar shows tomorrow",
    distractorPool: [
      "Calendar shows wrong month",
      "Calendar is upside down",
      "Calendar shows yesterday",
      "Calendar shows the year 2099",
      "Calendar is repeating the same day",
      "Calendar skipped a month",
    ],
    apply: (o) => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const months = [
        "JAN",
        "FEB",
        "MAR",
        "APR",
        "MAY",
        "JUN",
        "JUL",
        "AUG",
        "SEP",
        "OCT",
        "NOV",
        "DEC",
      ];
      const tex = makeCalendarTexture({
        day: tomorrow.getDate(),
        month: months[tomorrow.getMonth()] ?? "—",
      });
      replaceMap(o.calendar, tex);
    },
  },
  {
    id: "mug-name",
    targetTag: "mug",
    gameClueWords: {
      runner: "INK",
      sentence: "OWNED",
      errand: "MIRROR",
      tamper: "MARKED",
    },
    tooltipHint: "mug — label feels familiar",
    revealText: "The mug has YOUR name printed on it. Someone left it for you.",
    correctChoice: "Mug has your name on it",
    distractorPool: [
      "Mug is half empty",
      "Mug is the wrong color",
      "Mug is upside down",
      "Mug has no handle",
      "Mug has the boss's name",
      "Mug is from a parallel desk",
    ],
    apply: (o) => {
      const tex = makeMugLabelTexture("YOU");
      replaceMap(o.mugLabel, tex);
    },
  },
  {
    id: "clock-ccw",
    targetTag: "reagent-tray",
    gameClueWords: {
      runner: "SPIRAL",
      sentence: "UNDO",
      errand: "EBB",
      tamper: "RECOIL",
    },
    tooltipHint: "reagent tray — swirl runs wrong",
    revealText:
      "The liquid in the reagent tray swirls the wrong way — time sense is inverted.",
    correctChoice: "Reagent tray — swirl runs backwards",
    distractorPool: [
      "Tray has the wrong number of wells",
      "Tray is empty",
      "Tray is made of glass",
      "Tray is mirrored on the desk",
      "Tray drains in the wrong direction",
      "Tray shows yesterday's samples",
    ],
    apply: (o) => {
      o.flags.clockReverse = true;
    },
  },
  {
    id: "monitor-reflection",
    targetTag: "monitor-screen",
    gameClueWords: {
      runner: "ECHO",
      sentence: "ELSE",
      errand: "WINDOW",
      tamper: "DOUBLE",
    },
    tooltipHint: "monitor — reflection looks off",
    revealText:
      "The monitor reflects a different room — not the one you're in.",
    correctChoice: "Monitor reflection is wrong",
    distractorPool: [
      "Monitor is showing static",
      "Monitor is unplugged",
      "Monitor is upside down",
      "Monitor screen is cracked",
      "Monitor mirror is off by a frame",
      "Monitor is running yesterday's feed",
    ],
    apply: (o) => {
      o.monitorReflection.visible = true;
    },
  },
  {
    id: "photo-self",
    targetTag: "case-file",
    gameClueWords: {
      runner: "MIRROR",
      sentence: "TWIN",
      errand: "GAZE",
      tamper: "INSIDE",
    },
    tooltipHint: "case file — that face is familiar",
    revealText: "The case file shows your own face — looking back at you.",
    correctChoice: "Case file shows your own face",
    distractorPool: [
      "Case file is blank",
      "Case file is the wrong case",
      "Case file is sealed shut",
      "Case file is written in another language",
      "Case file has the detective's prints on it",
      "Case file is identical to last week's",
    ],
    apply: (o) => {
      const tex = makePhotoTexture("self");
      replaceMap(o.caseFileSheet, tex);
    },
  },
  {
    id: "sticky-warning",
    targetTag: "evidence-envelope",
    gameClueWords: {
      runner: "PAPER",
      sentence: "HUSH",
      errand: "SHOULDER",
      tamper: "BREATH",
    },
    tooltipHint: "evidence envelope — new message",
    revealText:
      "The envelope contains a note: \u201Cthey're behind you\u201D. It wasn't in the case file yesterday.",
    correctChoice: "Evidence envelope — warning note inside",
    distractorPool: [
      "Envelope is empty",
      "Envelope is the wrong color",
      "Envelope is sealed shut",
      "Envelope is in a different language",
      "Envelope has footsteps fading in red pen",
      "Envelope quietly ticks like a watch",
    ],
    apply: (o) => {
      const tex = makeEvidenceEnvelopeTexture("they're behind you");
      replaceMap(o.evidenceEnvelope, tex);
    },
  },
  {
    id: "pen-floating",
    targetTag: "case-file",
    gameClueWords: {
      runner: "HOVER",
      sentence: "LIFT",
      errand: "AIRGAP",
      tamper: "VOID",
    },
    tooltipHint: "case file — what's holding it up?",
    revealText:
      "The case file sheet is floating just above the desk. No support.",
    correctChoice: "Case file floats above the desk",
    distractorPool: [
      "Case file is missing a staple",
      "Case file is torn in half",
      "Case file is the wrong color",
      "Case file is soaked through",
      "Case file sits a finger above the desk",
      "Case file is propped on something invisible",
    ],
    apply: (o) => {
      o.caseFileSheet.userData.floatActive = true;
    },
  },
  {
    id: "lamp-shadow-wrong",
    targetTag: "lamp-shadow",
    gameClueWords: {
      runner: "TOWARD",
      sentence: "BEACON",
      errand: "INVERT",
      tamper: "REACH",
    },
    tooltipHint: "shadow — wrong direction",
    revealText: "The shadow points TOWARD the light, not away from it.",
    correctChoice: "Shadow points the wrong way",
    distractorPool: [
      "Shadow is too long",
      "Shadow is missing entirely",
      "Shadow is the wrong color",
      "Shadow has a different shape",
      "Shadow leans into the light",
      "Shadow belongs to another object",
    ],
    apply: (o) => {
      const lx = o.lamp.position.x;
      const dxS = o.lampShadowStandee.position.x - lx;
      o.lampShadowStandee.position.x = lx - dxS + 1.45;
      o.lampShadowProp.scale.x = -Math.abs(
        o.lampShadowProp.scale.x === 0 ? 1 : o.lampShadowProp.scale.x,
      );
      const dxP = o.lampShadowProp.position.x - lx;
      o.lampShadowProp.position.x = lx - dxP + 1.15;
    },
  },
  {
    id: "steam-down",
    targetTag: "coffee-steam",
    gameClueWords: {
      runner: "SINK",
      sentence: "CHILL",
      errand: "POUR",
      tamper: "GRAVITY",
    },
    tooltipHint: "steam — drifting the wrong way",
    revealText: "The coffee steam is drifting downward instead of rising.",
    correctChoice: "Steam falls instead of rising",
    distractorPool: [
      "Coffee is the wrong color",
      "Coffee is overflowing",
      "Coffee has ice in it",
      "Coffee has no steam at all",
      "Coffee is cold instead of hot",
      "Coffee refuses to rise",
    ],
    apply: (o) => {
      o.flags.steamDownward = true;
    },
  },
  {
    id: "blank-book",
    targetTag: "case-file",
    gameClueWords: {
      runner: "SILENT",
      sentence: "HOLLOW",
      errand: "UNSAID",
      tamper: "ERASED",
    },
    tooltipHint: "case file — strangely silent",
    revealText:
      "The case file printout has no body copy — every line is empty.",
    correctChoice: "Case file is blank",
    distractorPool: [
      "Case file is the wrong color",
      "Case file is folded shut",
      "Case file is upside down",
      "Case file has torn corners",
      "Case file has every line whited-out",
      "Case file is missing its text block",
    ],
    apply: (o) => {
      const tex = makeCaseFileBlankDeskTexture(1024, 662);
      replaceMap(o.caseFileSheet, tex);
    },
  },
  {
    id: "keyboard-extra-key",
    targetTag: "keyboard",
    gameClueWords: {
      runner: "ODD",
      sentence: "CRIMSON",
      errand: "COUNT",
      tamper: "INTRUDER",
    },
    tooltipHint: "keyboard — one key too many",
    revealText: "There's a giant red key on the keyboard that doesn't belong.",
    correctChoice: "Keyboard has an extra red key",
    distractorPool: [
      "Keyboard is missing keys",
      "Keyboard has no spacebar",
      "Keyboard layout is mirrored",
      "Keyboard is wireless but plugged in",
      "Keyboard has a macro pad attached",
      "Keyboard has a painted key",
    ],
    apply: (o) => {
      const extraKey = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.06, 0.32),
        new THREE.MeshStandardMaterial({ color: 0xc1342f, roughness: 0.5 }),
      );
      extraKey.position.set(0.85, 0.07, -0.25);
      extraKey.castShadow = true;
      extraKey.userData.tag = "keyboard";
      o.keyboard.add(extraKey);
    },
  },
  {
    id: "plant-glitching",
    targetTag: "plant",
    gameClueWords: {
      runner: "STUTTER",
      sentence: "GREEN",
      errand: "FRAME",
      tamper: "JITTER",
    },
    tooltipHint: "plant — leaves twitching",
    revealText: "The plant's leaves twitch and snap as if rendered wrong.",
    correctChoice: "Plant is glitching",
    distractorPool: [
      "Plant is wilting",
      "Plant has no leaves",
      "Plant is the wrong color",
      "Plant keeps skipping when you look",
      "Plant looks pixelated up close",
      "Plant is in the corner by itself",
    ],
    apply: (o) => {
      // Set the flag; the diorama's step() applies jitter on the main
      // render loop. (Previously this kicked off a parallel
      // requestAnimationFrame loop that leaked across restartRound's
      // diorama swaps.)
      o.plant.userData.glitching = true;
    },
  },
];

// ---------------------------------------------------------------------
// Picker: deterministic per seed.
// ---------------------------------------------------------------------

export function pickAnomaly(seed: number): PickedAnomaly {
  const rng = makeSeededRng(seed);
  const defIndex = Math.floor(rng() * ANOMALIES.length);
  const def = ANOMALIES[defIndex] ?? ANOMALIES[0];
  if (!def) throw new Error("ANOMALIES is empty");

  const clueTokens = [
    def.gameClueWords.runner,
    def.gameClueWords.sentence,
    def.gameClueWords.errand,
    def.gameClueWords.tamper,
  ].map((t) => t.toLowerCase());

  function overlapsClues(choice: string): boolean {
    const low = choice.toLowerCase();
    return clueTokens.some((tok) => tok.length >= 3 && low.includes(tok));
  }

  const pool = [...def.distractorPool];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = pool[i];
    const b = pool[j];
    if (a !== undefined && b !== undefined) {
      pool[i] = b;
      pool[j] = a;
    }
  }
  const ranked = [...pool].sort((a, b) => {
    const ao = overlapsClues(a) ? 1 : 0;
    const bo = overlapsClues(b) ? 1 : 0;
    return bo - ao;
  });
  const overlapPick = ranked.filter((d) => overlapsClues(d));
  const restPick = ranked.filter((d) => !overlapPick.includes(d));
  const distractors: string[] = [];
  if (overlapPick.length >= 2) {
    distractors.push(overlapPick[0]!, overlapPick[1]!);
  } else {
    distractors.push(...overlapPick);
    for (const r of restPick) {
      if (distractors.length >= 2) break;
      if (!distractors.includes(r)) distractors.push(r);
    }
  }

  // Build [correct, d1, d2] then shuffle deterministically; track correctIndex.
  const labeled: Array<{ text: string; isCorrect: boolean }> = [
    { text: def.correctChoice, isCorrect: true },
    ...distractors.map((d) => ({ text: d, isCorrect: false })),
  ];
  for (let i = labeled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = labeled[i];
    const b = labeled[j];
    if (a !== undefined && b !== undefined) {
      labeled[i] = b;
      labeled[j] = a;
    }
  }
  const choices = labeled.map((l) => l.text);
  const correctIndex = labeled.findIndex((l) => l.isCorrect);

  return { def, choices, correctIndex };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function replaceMap(mesh: THREE.Mesh, tex: THREE.Texture): void {
  const mat = mesh.material;
  if (Array.isArray(mat)) {
    for (const m of mat) replaceMatMap(m, tex);
  } else {
    replaceMatMap(mat, tex);
  }
}

function replaceMatMap(mat: THREE.Material, tex: THREE.Texture): void {
  // MeshBasicMaterial / MeshStandardMaterial both have `map` at runtime; treat
  // as a structural assign without leaning on a union of both types.
  const m = mat as unknown as {
    map?: THREE.Texture | null;
    needsUpdate?: boolean;
  };
  if ("map" in m) {
    m.map = tex;
    m.needsUpdate = true;
  }
}
