import { describe, expect, it } from "vitest";
import {
  buildWaveSpawnRoster,
  clueLockProgress01,
  createLaneDefenseRuntime,
  laneDefenseDeployBlockReason,
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
import { AGENT_TRAY } from "../../src/minigames/errand/types";

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
    // (firstBossWave = 4). Body count is 3 + wave * 2.
    expect(a.length).toBe(3 + 1 * 2);
  });

  it("first boss arrives on the configured wave", () => {
    const wave1 = buildWaveSpawnRoster(7, 1);
    const wave2 = buildWaveSpawnRoster(7, 2);
    const wave3 = buildWaveSpawnRoster(7, 3);
    const wave4 = buildWaveSpawnRoster(7, 4);
    expect(wave1.some((p) => p.kind === "zeroDay")).toBe(false);
    expect(wave2.some((p) => p.kind === "zeroDay")).toBe(false);
    expect(wave3.some((p) => p.kind === "zeroDay")).toBe(false);
    expect(wave4.some((p) => p.kind === "zeroDay")).toBe(true);
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

  it("deploy block reason reports focus shortfall", () => {
    let rt = createLaneDefenseRuntime(1);
    expect(laneDefenseDeployBlockReason(rt, 0)).toBe("none");
    rt = { ...rt, focus: 10 };
    expect(laneDefenseDeployBlockReason(rt, 0)).toBe("focus");
    expect(laneDefenseDeployToLane(rt, 0)).toBe(rt);
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
    expect(rt.deployToasts).toMatchObject([
      { lane: 0, text: "Fixer deployed", startedAt: 0 },
    ]);
    expect(rt.nextDeployToastId).toBe(2);
  });

  it("deploy toasts expire after their window", () => {
    let rt = createLaneDefenseRuntime(1);
    rt = laneDefenseDeployToLane(rt, 0);
    expect(rt.deployToasts.length).toBe(1);
    rt = stepLaneDefenseRuntime(rt, 0.4);
    expect(rt.deployToasts.length).toBe(1);
    rt = stepLaneDefenseRuntime(rt, 0.5);
    expect(rt.deployToasts.length).toBe(0);
  });

  it("promoted Reviewer deploy preserves kind on lane", () => {
    let rt = createLaneDefenseRuntime(8);
    rt = laneDefensePromoteAgent(rt, "reviewer");
    expect(queueHead(rt)?.kind).toBe("reviewer");
    rt = laneDefenseDeployToLane(rt, 1);
    expect(rt.placed.find((p) => p.lane === 1)?.kind).toBe("reviewer");
    expect(rt.deployToasts[0]?.text).toBe("Reviewer deployed");
  });

  it("promoted Firewall deploy preserves kind on lane", () => {
    let rt = createLaneDefenseRuntime(9);
    rt = laneDefensePromoteAgent(rt, "firewall");
    rt = laneDefenseDeployToLane(rt, 2);
    expect(rt.placed.find((p) => p.lane === 2)?.kind).toBe("firewall");
    expect(rt.deployToasts[0]?.text).toBe("Firewall deployed");
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

  it("Q/W/E pick stays sticky after deploy and blocks 1/2/3 on recharge", () => {
    let rt = createLaneDefenseRuntime(1);
    rt = laneDefensePromoteAgent(rt, "firewall");
    rt = laneDefenseDeployToLane(rt, 1);
    expect(rt.placed.find((p) => p.lane === 1)?.kind).toBe("firewall");
    // Selection survives the deploy.
    expect(rt.queue.find((q) => q.kind === "firewall")?.promoted).toBe(true);
    expect(rt.queue.find((q) => q.kind === "fixer")?.promoted).toBe(false);
    // Pressing 1/2/3 again while Firewall is still recharging must NOT
    // silently fall back to deploying Fixer in another lane.
    expect(laneDefenseDeployBlockReason(rt, 0)).toBe("recharging");
    const before = rt.placed.length;
    rt = laneDefenseDeployToLane(rt, 0);
    expect(rt.placed.length).toBe(before);
    // Switching the pick to Fixer (Q) lets the player deploy Fixer immediately.
    rt = laneDefensePromoteAgent(rt, "fixer");
    expect(laneDefenseDeployBlockReason(rt, 0)).toBe("none");
    rt = laneDefenseDeployToLane(rt, 0);
    expect(rt.placed.find((p) => p.lane === 0)?.kind).toBe("fixer");
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

  it("focus and capacity regenerate during inter-wave pause", () => {
    let rt = createLaneDefenseRuntime(1);
    rt = {
      ...rt,
      focus: 10,
      capacity: 10,
      wavePause: 1.0,
    };
    rt = stepLaneDefenseRuntime(rt, 0.5);
    expect(rt.focus).toBeGreaterThan(10);
    expect(rt.capacity).toBeGreaterThan(10);
    expect(rt.wavePause).toBeGreaterThan(0);
  });

  it("reviewer applies chip DPS to front enemy", () => {
    let rt = createLaneDefenseRuntime(12);
    rt = {
      ...rt,
      placed: [{ lane: 0, kind: "reviewer", chargeSec: 999 }],
      enemies: [spawnEnemyUnit(201, 0, "syntaxBug")],
    };
    const before = rt.enemies[0]!.hp;
    rt = stepLaneDefenseRuntime(rt, 1.0);
    const lost = before - rt.enemies[0]!.hp;
    expect(lost).toBeGreaterThan(8);
    expect(lost).toBeLessThan(10);
  });

  it("firewall burst DPS outdamages fixer on front enemy", () => {
    let rt = createLaneDefenseRuntime(13);
    const tank = {
      ...spawnEnemyUnit(301, 1, "syntaxBug"),
      x: 0.85,
      baseSpeed: 0,
      hp: 200,
      maxHp: 200,
    };
    rt = {
      ...rt,
      placed: [{ lane: 1, kind: "firewall", chargeSec: 999 }],
      enemies: [tank],
    };
    const before = rt.enemies[0]!.hp;
    rt = stepLaneDefenseRuntime(rt, 1.0);
    const lost = before - rt.enemies[0]!.hp;
    expect(lost).toBeGreaterThan(36);
    expect(lost).toBeLessThan(40);
  });

  it("fixer kills a zero-day from spawn line before it reaches the desk", () => {
    let rt = createLaneDefenseRuntime(14);
    rt = {
      ...rt,
      placed: [{ lane: 0, kind: "fixer", chargeSec: 999 }],
      enemies: [{ ...spawnEnemyUnit(401, 0, "zeroDay"), x: 1, baseSpeed: 0 }],
    };
    rt = stepLaneDefenseRuntime(rt, 18);
    expect(rt.enemies.some((e) => e.kind === "zeroDay")).toBe(false);
  });
});

describe("lane agent uptime (charge)", () => {
  it("deploy seeds charge from tray activeChargeSec", () => {
    let rt = createLaneDefenseRuntime(1);
    rt = laneDefenseDeployToLane(rt, 0);
    const p = rt.placed.find((x) => x.lane === 0)!;
    const def = AGENT_TRAY.find((a) => a.kind === p.kind)!;
    expect(p.chargeSec).toBe(def.activeChargeSec);
  });

  it("charge drains during a wave and removes the hero when depleted", () => {
    let rt = createLaneDefenseRuntime(1);
    rt = laneDefenseDeployToLane(rt, 0);
    const dur = AGENT_TRAY.find((a) => a.kind === "fixer")!.activeChargeSec;
    rt = stepLaneDefenseRuntime(rt, dur + 0.05);
    expect(rt.placed.some((p) => p.lane === 0)).toBe(false);
  });

  it("redeploying the same lane refreshes charge", () => {
    let rt = createLaneDefenseRuntime(1);
    rt = laneDefenseDeployToLane(rt, 0);
    const full = AGENT_TRAY.find((a) => a.kind === "fixer")!.activeChargeSec;
    expect(rt.placed[0]!.chargeSec).toBe(full);
    rt = stepLaneDefenseRuntime(rt, 5);
    expect(rt.placed[0]!.chargeSec).toBeCloseTo(full - 5, 5);
    rt = stepLaneDefenseRuntime(rt, 2);
    rt = laneDefenseDeployToLane(rt, 0);
    expect(rt.placed.find((p) => p.lane === 0)!.chargeSec).toBe(full);
  });

  it("charge does not drain during inter-wave pause", () => {
    let rt = createLaneDefenseRuntime(1);
    rt = laneDefenseDeployToLane(rt, 0);
    const before = rt.placed[0]!.chargeSec;
    rt = { ...rt, wavePause: 1.0, focus: 10, capacity: 10 };
    rt = stepLaneDefenseRuntime(rt, 0.5);
    expect(rt.placed[0]!.chargeSec).toBe(before);
  });

  it("clue wave gate still reachable on time path (no agents required)", () => {
    expect(survivalNotebookLock(1, 60)).toBe(true);
  });
});

describe("enemy resistance / vulnerability rules", () => {
  it("phishing packet takes half DPS from a Fixer (50% resist)", () => {
    let rt = createLaneDefenseRuntime(11);
    // Drop a Fixer in lane 0 by hand and place a phishing packet at the
    // front of the lane just inside DPS range.
    rt = {
      ...rt,
      placed: [{ lane: 0, kind: "fixer", chargeSec: 999 }],
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
    // 1s of fixer DPS at 14 dps with 0.5 mul = 7 hp lost.
    const lost = beforePhishHp - phish!.hp;
    expect(lost).toBeGreaterThan(6.5);
    expect(lost).toBeLessThan(7.5);
  });

  it("firewall lane uptime is shorter than fixer (burst vs sustain)", () => {
    const fw = AGENT_TRAY.find((a) => a.kind === "firewall")!;
    const fx = AGENT_TRAY.find((a) => a.kind === "fixer")!;
    expect(fw.activeChargeSec).toBeLessThan(fx.activeChargeSec);
    expect(fw.cost).toBeGreaterThan(fx.cost);
  });

  it("firewall out-damages fixer over a 3s window on the same target", () => {
    const mkTank = (id: number) => ({
      ...spawnEnemyUnit(id, 0, "syntaxBug"),
      x: 0.85,
      baseSpeed: 0,
      hp: 500,
      maxHp: 500,
    });
    const enemyFw = mkTank(501);
    const enemyFx = mkTank(502);
    const baseRt = createLaneDefenseRuntime(44);
    let rtFw = {
      ...baseRt,
      placed: [{ lane: 0, kind: "firewall" as const, chargeSec: 999 }],
      enemies: [enemyFw],
    };
    let rtFx = {
      ...baseRt,
      placed: [{ lane: 0, kind: "fixer" as const, chargeSec: 999 }],
      enemies: [enemyFx],
    };
    rtFw = stepLaneDefenseRuntime(rtFw, 3.0);
    rtFx = stepLaneDefenseRuntime(rtFx, 3.0);
    const eFw = rtFw.enemies.find((e) => e.id === 501);
    const eFx = rtFx.enemies.find((e) => e.id === 502);
    expect(eFw).toBeDefined();
    expect(eFx).toBeDefined();
    const lostFw = enemyFw.hp - eFw!.hp;
    const lostFx = enemyFx.hp - eFx!.hp;
    expect(lostFw).toBeGreaterThan(lostFx * 2);
  });
  it("syntax bug DPS path is unaffected by the new resistance rules", () => {
    let rt = createLaneDefenseRuntime(33);
    rt = {
      ...rt,
      placed: [{ lane: 0, kind: "fixer", chargeSec: 999 }],
      enemies: [spawnEnemyUnit(7, 0, "syntaxBug")],
    };
    const before = rt.enemies[0]!.hp;
    rt = stepLaneDefenseRuntime(rt, 1.0);
    const after = rt.enemies[0]?.hp ?? 0;
    const lost = before - after;
    // 1s × 14 fixerDps × 1.0 mul = 14.
    expect(lost).toBeGreaterThan(13.5);
    expect(lost).toBeLessThan(14.5);
  });
});

describe("errand clue token", () => {
  it("normalises and clamps", () => {
    expect(clueTokenForErrand("backwards")).toBe("BACKWARD");
    expect(clueTokenForErrand("")).toBe("DEF");
    expect(clueTokenForErrand("3 . 2 . 1")).toBe("DEF");
  });
});
