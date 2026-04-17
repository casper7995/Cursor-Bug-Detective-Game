import { clear, text, spawnHitParticles } from "./render";
import {
  newScore,
  recordKill,
  takeDamage,
  KILL_VALUE,
  SPECIALTY_BONUS,
  type Score,
} from "./score";
import type { CharacterKind, EnemyKind, GameEvent, World } from "./types";
import type { PickResult } from "./screens/pick";
import { makePlayer } from "./characters";
import { makeEnemy } from "./enemies";
import { stepSpawner, resetSpawner } from "./spawner";
import { makeCaptchaBoss } from "./boss";
import { makeBot } from "./bots";
import { fetchSeed, makeSeededRng } from "./leaderboard";
import { SFX } from "./audio";

export interface MatchResult {
  score: Score;
  character: CharacterKind;
}

const MATCH_LENGTH = 120;

let nextId = 0;

function playerName(): string {
  try {
    const k = "cursor-crew:name";
    let n = localStorage.getItem(k);
    if (!n) {
      n = `cursor-${Math.floor(Math.random() * 9000 + 1000)}`;
      localStorage.setItem(k, n);
    }
    return n;
  } catch {
    return "anon";
  }
}

export async function runMatch(
  ctx: CanvasRenderingContext2D,
  pick: PickResult,
): Promise<MatchResult> {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const score = newScore();

  const params = new URLSearchParams(window.location.search);
  const fromPortal = params.get("portal") === "true";
  const refParam = params.get("ref");

  const world: World = {
    entities: [],
    add: (e) => {
      e.id = ++nextId;
      world.entities.push(e);
    },
    width: w,
    height: h,
    elapsed: 0,
    matchLength: MATCH_LENGTH,
    rng: Math.random,
    events: [],
  };

  const date = new Date().toISOString().slice(0, 10);
  const seed = await fetchSeed(date);
  world.rng = makeSeededRng(seed);

  resetSpawner();

  const px = fromPortal ? w * 0.2 : w / 2;
  const py = fromPortal ? h * 0.5 : h / 2;
  world.add(makePlayer(pick.character, px, py));

  const otherKinds: CharacterKind[] = (
    ["arrow", "ibeam", "hand", "spinner", "crosshair"] as CharacterKind[]
  ).filter((k) => k !== pick.character);
  for (let i = 0; i < 3; i++) {
    const k = otherKinds[i % otherKinds.length]!;
    world.add(makeBot(k, 100 + i * 200, 100));
  }

  let bossSpawned = false;
  let shake = 0;
  let hitstop = 0;

  const exitPortal = { x: w - 72, y: h - 72, r: 36 };

  return new Promise<MatchResult>((resolve) => {
    let last = performance.now();
    function frame(now: number): void {
      const dtRaw = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dt = hitstop > 0 ? 0 : dtRaw;
      if (hitstop > 0) hitstop = Math.max(0, hitstop - dtRaw);

      world.elapsed += dtRaw;

      if (!bossSpawned && world.elapsed >= 60) {
        bossSpawned = true;
        world.add(makeCaptchaBoss(world));
        world.events.push({ type: "boss-spawn" });
        SFX.boss();
      }

      stepSpawner(world, dt);

      for (const e of world.entities) e.update(dt, world);
      world.entities = world.entities.filter((e) => !e.dead);

      handleEvents(world, score, {
        onJuice: (ev) => {
          if (ev.type === "kill") {
            shake = Math.min(8, shake + 2);
            hitstop = 0.05;
            SFX.kill();
            if (ev.victim.kind !== "boss") {
              spawnHitParticles(
                world,
                ev.victim.pos.x,
                ev.victim.pos.y,
                "#fbbf24",
                8,
              );
            }
          } else if (ev.type === "damage") {
            shake = Math.min(12, shake + 8);
            SFX.hurt();
          } else if (ev.type === "boss-killed") {
            shake = Math.min(16, shake + 6);
            SFX.kill();
          }
        },
      });

      shake = Math.max(0, shake - dtRaw * 30);

      const player = world.entities.find((e) => e.kind === "player");
      if (player && player.hp <= 0) {
        resolve({ score, character: pick.character });
        return;
      }

      if (world.elapsed >= MATCH_LENGTH) {
        resolve({ score, character: pick.character });
        return;
      }

      if (player && refParam) {
        const dx = player.pos.x - exitPortal.x;
        const dy = player.pos.y - exitPortal.y;
        if (dx * dx + dy * dy <= (exitPortal.r + player.radius) ** 2) {
          const name = encodeURIComponent(playerName());
          const ref = encodeURIComponent(
            window.location.href.split("?")[0] ?? "",
          );
          window.location.href = `https://vibej.am/portal/2026?username=${name}&ref=${ref}`;
          return;
        }
      }

      clear(ctx, w, h);
      const sx = (Math.random() - 0.5) * shake;
      const sy = (Math.random() - 0.5) * shake;
      ctx.save();
      ctx.translate(sx, sy);

      for (const e of world.entities) e.draw(ctx);

      if (refParam) {
        ctx.strokeStyle = "#a78bfa";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(exitPortal.x, exitPortal.y, exitPortal.r, 0, Math.PI * 2);
        ctx.stroke();
        text(ctx, "PORTAL", exitPortal.x, exitPortal.y - 4, {
          align: "center",
          color: "#c4b5fd",
          size: 11,
        });
      }

      ctx.restore();

      const remaining = Math.max(0, MATCH_LENGTH - world.elapsed);
      const hp = player?.hp ?? 0;
      text(
        ctx,
        `score ${score.total}   combo ×${score.combo.toFixed(1)}   ${remaining.toFixed(1)}s   hp ${hp}`,
        16,
        24,
      );

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

interface JuiceCb {
  onJuice: (ev: GameEvent) => void;
}

function handleEvents(world: World, score: Score, juice: JuiceCb): void {
  for (const ev of world.events) {
    juice.onJuice(ev);
    if (ev.type === "kill") {
      const killer = ev.killer;
      if (killer.kind !== "player") continue;

      const ek: EnemyKind | "boss" =
        ev.victim.kind === "boss"
          ? "boss"
          : ((ev.victim.data.enemyKind as EnemyKind | undefined) ?? "404");
      const characterKind = killer.data.character as CharacterKind | undefined;
      let bonus = 1.0;
      if (characterKind === "arrow") bonus = SPECIALTY_BONUS.arrow;
      else if (
        characterKind === "crosshair" &&
        ev.distance > Math.min(world.width, world.height) * 0.6
      )
        bonus = SPECIALTY_BONUS.crosshair;
      else if (characterKind === "ibeam" && score.combo >= 1.5)
        bonus = SPECIALTY_BONUS.ibeam;
      else if (characterKind === "hand" && ev.meta?.thrown)
        bonus = SPECIALTY_BONUS.hand;
      else if (characterKind === "spinner" && (ev.meta?.spinHits ?? 0) >= 3)
        bonus = SPECIALTY_BONUS.spinner;

      if (ek !== "boss") {
        recordKill(score, { value: KILL_VALUE[ek], bonusMultiplier: bonus });
      }

      if (ek === "404" && !(ev.victim.data.split as boolean)) {
        spawn404Split(world, ev.victim.pos.x, ev.victim.pos.y);
      }
    } else if (ev.type === "damage") {
      takeDamage(score);
    } else if (ev.type === "boss-killed") {
      score.total += 500;
      for (const e of world.entities) if (e.kind === "enemy") e.dead = true;
    }
  }
  world.events.length = 0;
}

function spawn404Split(world: World, x: number, y: number): void {
  for (let i = 0; i < 2; i++) {
    const e = makeEnemy("404", x + (i === 0 ? -8 : 8), y);
    e.data.split = true;
    (e.data as { speed: number }).speed = 30;
    world.add(e);
  }
}
