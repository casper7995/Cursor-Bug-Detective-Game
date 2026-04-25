/** Three desk scenes for Spot the Tampering. Pure data — render in draw.ts. */

import type { TamperScene } from "./types";

/**
 * Each scene gives 5 candidate spots in 512×320 game-canvas coords.
 * Spots are positioned over the right-hand TONIGHT panel rendered by draw.ts;
 * the scene background paints both halves (ORIGINAL on left, TONIGHT on right).
 *
 * Spot coords are local to the TONIGHT panel (256 wide × 200 tall, top-left at
 * (256, 64)). Draw maps them into world pixels by adding the panel offset.
 */
export const TAMPER_SCENES: readonly TamperScene[] = [
  {
    id: "case-file-set",
    displayName: "Case File Set",
    spots: [
      { id: "stamp", x: 38, y: 30, r: 22, tampered: false, label: "stamp" },
      { id: "photo", x: 130, y: 50, r: 28, tampered: false, label: "photo" },
      { id: "pen", x: 200, y: 30, r: 18, tampered: false, label: "pen" },
      {
        id: "paperclip",
        x: 192,
        y: 110,
        r: 18,
        tampered: false,
        label: "paperclip",
      },
      {
        id: "signature",
        x: 60,
        y: 130,
        r: 24,
        tampered: false,
        label: "signature",
      },
    ],
  },
  {
    id: "evidence-bench",
    displayName: "Evidence Bench",
    spots: [
      { id: "vial", x: 36, y: 40, r: 20, tampered: false, label: "vial" },
      { id: "tag", x: 96, y: 32, r: 18, tampered: false, label: "tag" },
      { id: "key", x: 158, y: 64, r: 22, tampered: false, label: "key" },
      {
        id: "boot",
        x: 60,
        y: 130,
        r: 26,
        tampered: false,
        label: "boot print",
      },
      {
        id: "ledger",
        x: 200,
        y: 130,
        r: 24,
        tampered: false,
        label: "ledger",
      },
    ],
  },
  {
    id: "lamp-corner",
    displayName: "Lamp Corner",
    spots: [
      { id: "shade", x: 70, y: 30, r: 24, tampered: false, label: "lampshade" },
      { id: "switch", x: 130, y: 60, r: 18, tampered: false, label: "switch" },
      { id: "wire", x: 196, y: 70, r: 20, tampered: false, label: "wire" },
      {
        id: "puddle",
        x: 60,
        y: 130,
        r: 28,
        tampered: false,
        label: "puddle",
      },
      { id: "book", x: 200, y: 132, r: 22, tampered: false, label: "book" },
    ],
  },
];

export function getSceneById(id: string): TamperScene {
  const found = TAMPER_SCENES.find((s) => s.id === id);
  return found ?? (TAMPER_SCENES[0] as TamperScene);
}
