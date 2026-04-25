import type { DeskFootCircle } from "../cursor/deskFootResolve";

export const DESK_BOUNDS = {
  halfWidth: 4,
  halfDepth: 2,
} as const;

export const DESK_INTRO_LANDING = {
  x: 0.4,
  z: 0.4,
} as const;

export const DESK_INTRO_SPAWN = {
  x: 1.25,
  z: -1.1,
} as const;

export const DESK_PROP_POSITIONS = {
  monitor: { x: -1.8, z: -1.0 },
  keyboard: { x: -1.8, z: 0.2 },
  mug: { x: 2.4, z: 0.6 },
  calendar: { x: 3.35, z: -1.45 },
  reagentTray: { x: 2.15, z: -1.32 },
  evidenceEnvelope: { x: -0.28, z: 1.38 },
  lamp: { x: -3.4, z: -0.6 },
  caseFileSheet: { x: 0.38, z: -1.48 },
} as const;

export const DESK_PROP_FOOTPRINTS: readonly DeskFootCircle[] = [
  { ...DESK_PROP_POSITIONS.mug, r: 0.38 },
  { ...DESK_PROP_POSITIONS.caseFileSheet, r: 0.55 },
  { ...DESK_PROP_POSITIONS.keyboard, r: 1.16 },
  { ...DESK_PROP_POSITIONS.monitor, r: 1.12 },
  { ...DESK_PROP_POSITIONS.reagentTray, r: 0.7 },
  { ...DESK_PROP_POSITIONS.evidenceEnvelope, r: 0.42 },
  { ...DESK_PROP_POSITIONS.lamp, r: 0.34 },
  { ...DESK_PROP_POSITIONS.calendar, r: 0.36 },
];
