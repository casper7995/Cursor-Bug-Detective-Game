import * as THREE from "three";
import {
  type DioramaObjects,
  makeBookPagesTexture,
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
    readonly sticky: string;
    readonly clock: string;
    readonly photo: string;
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
      runner: "calendar",
      sticky: "TOMORROW",
      clock: "AHEAD",
      photo: "DATE",
    },
    tooltipHint: "calendar — date looks off",
    revealText: "The calendar shows tomorrow's date — one day too far ahead.",
    correctChoice: "Calendar shows tomorrow",
    distractorPool: [
      "Calendar shows wrong month",
      "Calendar is upside down",
      "Calendar shows yesterday",
      "Calendar shows the year 2099",
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
      runner: "mug",
      sticky: "NAME",
      clock: "YOURS",
      photo: "LABEL",
    },
    tooltipHint: "mug — label feels familiar",
    revealText: "The mug has YOUR name printed on it. Someone left it for you.",
    correctChoice: "Mug has your name on it",
    distractorPool: [
      "Mug is half empty",
      "Mug is the wrong color",
      "Mug is upside down",
      "Mug has no handle",
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
      runner: "clock",
      sticky: "BACKWARDS",
      clock: "REVERSE",
      photo: "TIME",
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
    ],
    apply: (o) => {
      o.flags.clockReverse = true;
    },
  },
  {
    id: "monitor-reflection",
    targetTag: "monitor-screen",
    gameClueWords: {
      runner: "screen",
      sticky: "GLASS",
      clock: "ROOM",
      photo: "GHOST",
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
    ],
    apply: (o) => {
      o.monitorReflection.visible = true;
    },
  },
  {
    id: "photo-self",
    targetTag: "photo",
    gameClueWords: {
      runner: "photo",
      sticky: "FAMILIAR",
      clock: "BEFORE",
      photo: "SELF",
    },
    tooltipHint: "photo — that face is familiar",
    revealText:
      "The photo on the desk shows your own face — looking back at you.",
    correctChoice: "Photo shows your own face",
    distractorPool: [
      "Photo is faded",
      "Photo frame is cracked",
      "Photo is black and white",
      "Photo is hung crooked",
    ],
    apply: (o) => {
      const tex = makePhotoTexture("self");
      replaceMap(o.photoImage, tex);
    },
  },
  {
    id: "sticky-warning",
    targetTag: "evidence-envelope",
    gameClueWords: {
      runner: "note",
      sticky: "WARNING",
      clock: "BEHIND",
      photo: "TEXT",
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
    ],
    apply: (o) => {
      const tex = makeEvidenceEnvelopeTexture("they're behind you");
      replaceMap(o.evidenceEnvelope, tex);
    },
  },
  {
    id: "pen-floating",
    targetTag: "pen",
    gameClueWords: {
      runner: "pen",
      sticky: "FLOAT",
      clock: "HOLD",
      photo: "INK",
    },
    tooltipHint: "pen — what's holding it up?",
    revealText: "The pen is floating just above the desk. No support.",
    correctChoice: "Pen floats above the desk",
    distractorPool: [
      "Pen is missing its cap",
      "Pen is broken in half",
      "Pen is the wrong color",
      "Pen is leaking ink",
    ],
    apply: (o) => {
      o.pen.userData.floatActive = true;
    },
  },
  {
    id: "lamp-shadow-wrong",
    targetTag: "lamp-shadow",
    gameClueWords: {
      runner: "shadow",
      sticky: "LAMP",
      clock: "WRONG",
      photo: "LIGHT",
    },
    tooltipHint: "shadow — wrong direction",
    revealText: "The shadow points TOWARD the light, not away from it.",
    correctChoice: "Shadow points the wrong way",
    distractorPool: [
      "Shadow is too long",
      "Shadow is missing entirely",
      "Shadow is the wrong color",
      "Shadow has a different shape",
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
      runner: "steam",
      sticky: "DOWN",
      clock: "CUP",
      photo: "HEAT",
    },
    tooltipHint: "steam — drifting the wrong way",
    revealText: "The coffee steam is drifting downward instead of rising.",
    correctChoice: "Steam falls instead of rising",
    distractorPool: [
      "Coffee is the wrong color",
      "Coffee is overflowing",
      "Coffee has ice in it",
      "Coffee has no steam at all",
    ],
    apply: (o) => {
      o.flags.steamDownward = true;
    },
  },
  {
    id: "blank-book",
    targetTag: "book",
    gameClueWords: {
      runner: "book",
      sticky: "BLANK",
      clock: "PAGE",
      photo: "SPINE",
    },
    tooltipHint: "book — strangely silent",
    revealText: "Every page in the open book is completely blank.",
    correctChoice: "Open book has blank pages",
    distractorPool: [
      "Book is the wrong color",
      "Book is closed shut",
      "Book is upside down",
      "Book has torn pages",
    ],
    apply: (o) => {
      const tex = makeBookPagesTexture(false);
      replaceMap(o.bookPages, tex);
    },
  },
  {
    id: "keyboard-extra-key",
    targetTag: "keyboard",
    gameClueWords: {
      runner: "keyboard",
      sticky: "EXTRA",
      clock: "KEY",
      photo: "RED",
    },
    tooltipHint: "keyboard — one key too many",
    revealText: "There's a giant red key on the keyboard that doesn't belong.",
    correctChoice: "Keyboard has an extra red key",
    distractorPool: [
      "Keyboard is missing keys",
      "Keyboard has no spacebar",
      "Keyboard layout is mirrored",
      "Keyboard is wireless but plugged in",
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
      runner: "plant",
      sticky: "GLITCH",
      clock: "LEAF",
      photo: "POT",
    },
    tooltipHint: "plant — leaves twitching",
    revealText: "The plant's leaves twitch and snap as if rendered wrong.",
    correctChoice: "Plant is glitching",
    distractorPool: [
      "Plant is wilting",
      "Plant is in the wrong pot",
      "Plant has no leaves",
      "Plant is the wrong color",
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
    def.gameClueWords.sticky,
    def.gameClueWords.clock,
    def.gameClueWords.photo,
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
