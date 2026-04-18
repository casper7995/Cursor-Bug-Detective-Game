import type { CharacterKind } from "./types";

export interface Score {
  total: number;
  combo: number;
  peakCombo: number;
  kills: number;
}

export interface KillContext {
  value: number;
  bonusMultiplier?: number;
}

export function newScore(): Score {
  return { total: 0, combo: 1.0, peakCombo: 1.0, kills: 0 };
}

export function recordKill(s: Score, ctx: KillContext): void {
  const bonus = ctx.bonusMultiplier ?? 1.0;
  s.total += Math.round(ctx.value * s.combo * bonus);
  s.combo = +(s.combo + 0.1).toFixed(3);
  if (s.combo > s.peakCombo) s.peakCombo = s.combo;
  s.kills += 1;
}

export function takeDamage(s: Score): void {
  s.combo = 1.0;
}

export const KILL_VALUE = {
  "404": 10,
  cookie: 30,
  loader: 20,
  notif: 15,
  popup: 25,
  boss: 500,
} as const;

export const SPECIALTY_BONUS: Record<CharacterKind, number> = {
  arrow: 1.1,
  crosshair: 1.5,
  ibeam: 1.25,
  hand: 1.25,
  spinner: 1.25,
};
