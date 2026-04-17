import { describe, it, expect } from "vitest";
import {
  newScore,
  recordKill,
  takeDamage,
  SPECIALTY_BONUS,
  KILL_VALUE,
} from "../src/score";

describe("score", () => {
  it("starts at 0 with combo multiplier 1.0", () => {
    const s = newScore();
    expect(s.total).toBe(0);
    expect(s.combo).toBe(1.0);
    expect(s.peakCombo).toBe(1.0);
  });

  it("adds kill_value × combo and bumps combo by 0.1", () => {
    const s = newScore();
    recordKill(s, { value: 10 });
    expect(s.total).toBe(10);
    expect(s.combo).toBeCloseTo(1.1);
  });

  it("resets combo to 1.0 on damage but keeps peak", () => {
    const s = newScore();
    recordKill(s, { value: 10 });
    recordKill(s, { value: 20 });
    const peakBefore = s.combo;
    takeDamage(s);
    expect(s.combo).toBe(1.0);
    expect(s.peakCombo).toBeCloseTo(peakBefore);
  });
});

describe("specialty bonus", () => {
  it("crosshair snipe applies 1.5x on top of combo", () => {
    const s = newScore();
    recordKill(s, {
      value: KILL_VALUE["404"],
      bonusMultiplier: SPECIALTY_BONUS.crosshair,
    });
    expect(s.total).toBe(15);
  });
  it("arrow always-on bonus is 1.1", () => {
    expect(SPECIALTY_BONUS.arrow).toBe(1.1);
  });
});

describe("boss kill scoring", () => {
  it("applies combo and arrow bonus to the 500-point boss reward", () => {
    const s = newScore();
    for (let i = 0; i < 5; i++) recordKill(s, { value: KILL_VALUE["404"] });
    const comboBefore = s.combo;
    const totalBefore = s.total;
    recordKill(s, {
      value: KILL_VALUE.boss,
      bonusMultiplier: SPECIALTY_BONUS.arrow,
    });
    const gained = s.total - totalBefore;
    expect(gained).toBe(
      Math.round(KILL_VALUE.boss * comboBefore * SPECIALTY_BONUS.arrow),
    );
    expect(s.kills).toBe(6);
  });
});
