import { describe, expect, it } from "vitest";
import {
  buildWaveSpawnRoster,
  clueLockProgress01,
  createLaneDefenseRuntime,
  laneDefenseDeployToLane,
  laneDefenseDeskScore,
  laneDefensePromoteAgent,
  laneDefenseTryPlace,
  namespacedSeed,
  queueHead,
  scoreLaneDefense,
  spawnEnemyUnit,
  stepLaneDefenseRuntime,
  survivalNotebookLock,
} from "../../src/minigames/errand/round";
import {
  laneDefenseLaneRects,
  laneDefenseQueueRects,
  laneDefenseRowPlaySpan,
  laneDefenseTrayRects,
} from "../../src/minigames/errand/draw";
import { clueTokenForErrand } from "../../src/minigames/errand/clueTokens";

describe("lane defense errand", () => {
  it("namespacedSeed is stable", () => {
    expect(namespacedSeed(1, "errand")).toBe(namespacedSeed(1, "errand"));
    expect(namespacedSeed(1, "errand:A")).not.toBe(
      namespacedSeed(1, "errand:B"),
    );
  });

  it("wave roster is deterministic", () => {
    const a = buildWaveSpawnRoster(99, 1);
    const b = buildWaveSpawnRoster(99, 1);
    expect(a).toEqual(b);
    // Wave 1 is the only guaranteed non-boss wave under current cadence
    // (firstBossWave = 2). Body count is 3 + wave * 2.
    expect(a.length).toBe(3 + 1 * 2);
  });

  it("first boss arrives on the configured wave", () => {
    const wave1 = buildWaveSpawnRoster(7, 1);
    const wave2 = buildWaveSpawnRoster(7, 2);
    expect(wave1.some((p) => p.kind === "zeroDay")).toBe(false);
    expect(wave2.some((p) => p.kind === "zeroDay")).toBe(true);
  });

  it("survivalNotebookLock matches waves or time gate", () => {
    expect(survivalNotebookLock(1, 0)).toBe(false);
    expect(survivalNotebookLock(2, 30)).toBe(false);
    expect(survivalNotebookLock(3, 10)).toBe(true);
    expect(survivalNotebookLock(1, 60)).toBe(true);
  });

  it("clueLockProgress01 advances toward lock and caps at 1", () => {
    expect(clueLockProgress01(1, 0)).toBe(0);
    // Wave 2 with 0 time = 50% via wave path (1 of 2 segments).
    expect(clueLockProgress01(2, 0)).toBeCloseTo(0.5, 5);
    // Time gate at half-way is the better path while wave is still 1.
    expect(clueLockProgress01(1, 30)).toBeCloseTo(0.5, 5);
    expect(clueLockProgress01(3, 0)).toBe(1);
    expect(clueLockProgress01(1, 60)).toBe(1);
    expect(clueLockProgress01(99, 999)).toBe(1);
  });

  it("scoreLaneDefense is tiered when clue locked", () => {
    expect(
      scoreLaneDefense({
        clueLocked: false,
        bossesDefeated: 0,
        completedWaves: 9,
        secondsHeld: 200,
      }),
    ).toBe(0);
    expect(
      scoreLaneDefense({
        clueLocked: true,
        bossesDefeated: 0,
        completedWaves: 0,
        secondsHeld: 10,
      }),
    ).toBe(400);
    expect(
      scoreLaneDefense({
        clueLocked: true,
        bossesDefeated: 1,
        completedWaves: 3,
        secondsHeld: 30,
      }),
    ).toBe(700);
    expect(
      scoreLaneDefense({
        clueLocked: true,
        bossesDefeated: 0,
        completedWaves: 8,
        secondsHeld: 10,
      }),
    ).toBe(1000);
  });

  it("queue deployment spends focus, recharges the hero, and occupies lane", () => {
    let rt = createLaneDefenseRuntime(1);
    const startFocus = rt.focus;
    const head = queueHead(rt);
    expect(head?.kind).toBe("fixer");
    rt = laneDefenseDeployToLane(rt, 0);
    expect(rt.focus).toBeLessThan(startFocus);
    expect(rt.placed.some((p) => p.lane === 0 && p.kind === "fixer")).toBe(
      true,
    );
    const fixer = rt.queue.find((q) => q.kind === "fixer");
    expect(fixer?.readyAt).toBeGreaterThan(rt.elapsed);
    expect(rt.deployFx).toMatchObject([
      { kind: "fixer", lane: 0, startedAt: 0 },
    ]);
    expect(rt.nextDeployFxId).toBe(2);
  });

  it("deployment launch effects expire after their animation window", () => {
    let rt = createLaneDefenseRuntime(1);
    rt = laneDefenseDeployToLane(rt, 0);
    expect(rt.deployFx.length).toBe(1);
    rt = stepLaneDefenseRuntime(rt, 0.2);
    expect(rt.deployFx.length).toBe(1);
    rt = stepLaneDefenseRuntime(rt, 0.5);
    expect(rt.deployFx.length).toBe(0);
  });

  it("queue head returns first ready hero and respects promotion", () => {
    let rt = createLaneDefenseRuntime(1);
    expect(queueHead(rt)?.kind).toBe("fixer");
    rt = laneDefensePromoteAgent(rt, "firewall");
    expect(queueHead(rt)?.kind).toBe("firewall");
    rt = laneDefenseDeployToLane(rt, 1);
    expect(queueHead(rt)?.kind).toBe("fixer");
  });

  it("queue deployment no-ops when all heroes are recharging", () => {
    const rt = {
      ...createLaneDefenseRuntime(1),
      queue: createLaneDefenseRuntime(1).queue.map((q) => ({
        ...q,
        readyAt: 99,
      })),
    };
    const next = laneDefenseDeployToLane(rt, 0);
    expect(next).toBe(rt);
  });

  it("runtime step ticks elapsed and can defeat", () => {
    let rt = createLaneDefenseRuntime(42);
    for (let i = 0; i < 20; i++) {
      rt = stepLaneDefenseRuntime(rt, 5);
      if (rt.defeated) break;
    }
    expect(rt.elapsed).toBeGreaterThan(0);
  });

  it("laneDefenseDeskScore respects clue lock", () => {
    const rt = {
      ...createLaneDefenseRuntime(5),
      clueLocked: true,
      bossesDefeated: 0,
      wavesFinished: 0,
      elapsed: 5,
    };
    expect(laneDefenseDeskScore(rt)).toBe(400);
  });

  it("hit rects are usable", () => {
    expect(laneDefenseQueueRects().length).toBe(3);
    expect(laneDefenseTrayRects()).toEqual(laneDefenseQueueRects());
    expect(laneDefenseLaneRects().length).toBe(3);
    for (const r of laneDefenseLaneRects()) {
      expect(r.w).toBeGreaterThan(10);
      expect(r.h).toBeGreaterThan(10);
    }
    for (const r of laneDefenseQueueRects()) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
  });

  it("lane row play span leaves room for marching", () => {
    for (let lane = 0; lane < 3; lane++) {
      const { playLeft, playRight } = laneDefenseRowPlaySpan(lane as 0 | 1 | 2);
      expect(playRight - playLeft).toBeGreaterThan(24);
    }
  });

  it("spawnEnemyUnit starts at spawn line", () => {
    const u = spawnEnemyUnit(1, 1, "syntaxBug");
    expect(u.x).toBe(1);
    expect(u.lane).toBe(1);
  });
});

describe("enemy resistance / vulnerability rules", () => {
  it("phishing packet takes half DPS from a Fixer (50% resist)", () => {
    let rt = createLaneDefenseRuntime(11);
    // Drop a Fixer in lane 0 by hand and place a phishing packet at the
    // front of the lane just inside DPS range.
    rt = {
      ...rt,
      placed: [{ lane: 0, kind: "fixer" }],
      enemies: [
        spawnEnemyUnit(101, 0, "phishingPacket"),
        spawnEnemyUnit(102, 0, "syntaxBug"),
      ],
    };
    // Step 1s; phishing front should take half the syntax-bug damage.
    const beforePhishHp = rt.enemies[0]!.hp;
    rt = stepLaneDefenseRuntime(rt, 1.0);
    const phish = rt.enemies.find((e) => e.id === 101);
    expect(phish).toBeDefined();
    // 1s of fixer DPS at 13 dps with 0.5 mul = 6.5 hp lost; allow ±1.
    const lost = beforePhishHp - phish!.hp;
    expect(lost).toBeGreaterThan(5.5);
    expect(lost).toBeLessThan(7.5);
  });

  it("regression bug leaks twice as hard with no firewall", () => {
    // Build a minimal runtime where one regression bug is at x=0 with a
    // firewall present, and another with no firewall.
    const noFw = createLaneDefenseRuntime(22);
    const withFw = {
      ...createLaneDefenseRuntime(22),
      placed: [{ lane: 0, kind: "firewall" as const }],
    };
    const placeBug = (rt: typeof noFw): typeof noFw => ({
      ...rt,
      enemies: [{ ...spawnEnemyUnit(1, 0, "regressionBug"), x: 0 }],
    });
    const a = stepLaneDefenseRuntime(placeBug(noFw), 1 / 60);
    const b = stepLaneDefenseRuntime(placeBug(withFw), 1 / 60);
    // No-firewall took 2x leak; with-firewall took 0.5x. Total HP delta
    // (capacity + base) for noFw should be ~4x with-fw.
    const hpDelta = (rt: typeof noFw): number =>
      noFw.capacity - rt.capacity + (noFw.baseHealth - rt.baseHealth);
    expect(hpDelta(a)).toBeGreaterThan(hpDelta(b) * 2);
  });

  it("syntax bug DPS path is unaffected by the new resistance rules", () => {
    let rt = createLaneDefenseRuntime(33);
    rt = {
      ...rt,
      placed: [{ lane: 0, kind: "fixer" }],
      enemies: [spawnEnemyUnit(7, 0, "syntaxBug")],
    };
    const before = rt.enemies[0]!.hp;
    rt = stepLaneDefenseRuntime(rt, 1.0);
    const after = rt.enemies[0]?.hp ?? 0;
    const lost = before - after;
    // 1s × 13 fixerDps × 1.0 mul = 13.
    expect(lost).toBeGreaterThan(12);
    expect(lost).toBeLessThan(14);
  });
});

describe("errand clue token", () => {
  it("normalises and clamps", () => {
    expect(clueTokenForErrand("backwards")).toBe("BACKWARD");
    expect(clueTokenForErrand("")).toBe("DEF");
    expect(clueTokenForErrand("3 . 2 . 1")).toBe("DEF");
  });
});
