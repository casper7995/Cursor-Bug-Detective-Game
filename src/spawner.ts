import { makeEnemy } from "./enemies";
import type { EnemyKind, World } from "./types";

export function spawnInterval(elapsed: number, matchLength: number): number {
  const t = Math.min(1, elapsed / matchLength);
  return 2.0 + (0.4 - 2.0) * t;
}

function pickEnemy(rng: () => number, elapsed: number): EnemyKind {
  const pool: EnemyKind[] = ["404"];
  if (elapsed > 20) pool.push("cookie", "popup");
  if (elapsed > 40) pool.push("loader", "notif");
  return pool[Math.floor(rng() * pool.length)]!;
}

interface SpawnerState {
  accumulator: number;
}
const state: SpawnerState = { accumulator: 0 };

export function resetSpawner(): void {
  state.accumulator = 0;
}

export function stepSpawner(world: World, dt: number): void {
  state.accumulator += dt;
  const interval = spawnInterval(world.elapsed, world.matchLength);
  while (state.accumulator >= interval) {
    state.accumulator -= interval;
    const edge = Math.floor(world.rng() * 4);
    let x = 0;
    let y = 0;
    if (edge === 0) {
      x = world.rng() * world.width;
      y = -20;
    } else if (edge === 1) {
      x = world.width + 20;
      y = world.rng() * world.height;
    } else if (edge === 2) {
      x = world.rng() * world.width;
      y = world.height + 20;
    } else {
      x = -20;
      y = world.rng() * world.height;
    }
    const kind = pickEnemy(world.rng, world.elapsed);
    if (kind === "cookie") {
      y = world.rng() < 0.5 ? world.height * 0.3 : world.height * 0.7;
      x = world.rng() < 0.5 ? -30 : world.width + 30;
    }
    if (kind === "popup") {
      x = 40 + world.rng() * (world.width - 80);
      y = 40 + world.rng() * (world.height - 80);
    }
    world.add(makeEnemy(kind, x, y));
  }
}
