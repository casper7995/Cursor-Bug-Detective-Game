/** Three desk scenes for Spot the Tampering. Pure data — render in draw.ts. */

import type { TamperScene } from "./types";

/**
 * Each scene gives 5 candidate spots in 512×320 game-canvas coords.
 * Spots are positioned over the right-hand TONIGHT panel rendered by draw.ts;
 * the scene background paints both halves (ORIGINAL on top, TONIGHT below).
 *
 * Spot coords are local to the TONIGHT panel (256 wide × 200 tall, top-left at
 * (256, 64)). Draw maps them into world pixels by adding the panel offset.
 *
 * Every spot defines `tonightIfThisTampered`: when a call rolls this spot as
 * its tampered prop, that row’s TONIGHT line shows the variant; all other
 * rows match between ORIGINAL and TONIGHT so the player can compare in-panel.
 */
export const TAMPER_SCENES: readonly TamperScene[] = [
  {
    id: "case-file-set",
    displayName: "Case File Set",
    spots: [
      {
        id: "stamp",
        x: 38,
        y: 30,
        r: 22,
        label: "stamp",
        tonightIfThisTampered: "stamp (offset)",
        sketchKey: "stamp",
        tonightSketchKey: "stamp_offset",
      },
      {
        id: "photo",
        x: 130,
        y: 50,
        r: 28,
        label: "photo",
        tonightIfThisTampered: "photo (glare streak)",
        sketchKey: "photo",
        tonightSketchKey: "photo_glare",
      },
      {
        id: "pen",
        x: 200,
        y: 30,
        r: 18,
        label: "pen",
        tonightIfThisTampered: "pen (smudge on cap)",
        sketchKey: "pen",
        tonightSketchKey: "pen_smudge",
      },
      {
        id: "paperclip",
        x: 192,
        y: 110,
        r: 18,
        label: "paperclip",
        tonightIfThisTampered: "paperclip + staple",
        sketchKey: "paperclip",
        tonightSketchKey: "staple",
      },
      {
        id: "signature",
        x: 60,
        y: 130,
        r: 24,
        label: "signature",
        tonightIfThisTampered: "signature (second loop)",
        sketchKey: "signature",
        tonightSketchKey: "signature_loopy",
      },
    ],
  },
  {
    id: "evidence-bench",
    displayName: "Evidence Bench",
    spots: [
      {
        id: "vial",
        x: 36,
        y: 40,
        r: 20,
        label: "vial",
        tonightIfThisTampered: "vial (empty)",
        sketchKey: "vial",
        tonightSketchKey: "vial_empty",
      },
      {
        id: "tag",
        x: 96,
        y: 32,
        r: 18,
        label: "tag",
        tonightIfThisTampered: "tag (torn corner)",
        sketchKey: "tag",
        tonightSketchKey: "tag_torn",
      },
      {
        id: "key",
        x: 158,
        y: 64,
        r: 22,
        label: "key",
        tonightIfThisTampered: "key (bent)",
        sketchKey: "key",
        tonightSketchKey: "key_bent",
      },
      {
        id: "boot",
        x: 60,
        y: 130,
        r: 26,
        label: "boot print",
        tonightIfThisTampered: "boot print (smear)",
        sketchKey: "boot print",
        tonightSketchKey: "boot_smear",
      },
      {
        id: "ledger",
        x: 200,
        y: 130,
        r: 24,
        label: "ledger",
        tonightIfThisTampered: "ledger (dog-eared page)",
        sketchKey: "ledger",
        tonightSketchKey: "ledger_fold",
      },
    ],
  },
  {
    id: "lamp-corner",
    displayName: "Lamp Corner",
    spots: [
      {
        id: "shade",
        x: 70,
        y: 30,
        r: 24,
        label: "lampshade",
        tonightIfThisTampered: "lampshade (tape on rim)",
        sketchKey: "lampshade",
        tonightSketchKey: "lampshade_tape",
      },
      {
        id: "switch",
        x: 130,
        y: 60,
        r: 18,
        label: "switch",
        tonightIfThisTampered: "switch (scuff marks)",
        sketchKey: "switch",
        tonightSketchKey: "switch_scuff",
      },
      {
        id: "wire",
        x: 196,
        y: 70,
        r: 20,
        label: "wire",
        tonightIfThisTampered: "wire (cut strand)",
        sketchKey: "wire",
        tonightSketchKey: "wire_cut",
      },
      {
        id: "puddle",
        x: 60,
        y: 130,
        r: 28,
        label: "puddle",
        tonightIfThisTampered: "puddle (oil sheen)",
        sketchKey: "puddle",
        tonightSketchKey: "puddle_oil",
      },
      {
        id: "book",
        x: 200,
        y: 132,
        r: 22,
        label: "book",
        tonightIfThisTampered: "book (spine shifted)",
        sketchKey: "book",
        tonightSketchKey: "book_shifted",
      },
    ],
  },
];

export function getSceneById(id: string): TamperScene {
  const found = TAMPER_SCENES.find((s) => s.id === id);
  return found ?? (TAMPER_SCENES[0] as TamperScene);
}
