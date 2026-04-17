# Cursor Crew Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Cursor Crew — a 120-second top-down browser arena game where the player picks one of five system-cursor characters and racks up combo kills against waves of hostile UI elements — in time for the Vibe Jam 2026 deadline (2026-05-01 13:37 UTC).

**Architecture:** Single-page browser game. One render loop drives a flat entity list; each entity has `update(dt, ctx)` and `draw(g)` and a `kind` tag. State machine: `pick → playing → end`. Pure logic (score, spawner curve, daily seed) is unit-tested with vitest; visual feel is verified by manual playtest checklist. Backend is a tiny Cloudflare Worker storing the daily leaderboard in KV. Multiplayer (PartyKit) is an optional Track 2 stretch and may be dropped without affecting Track 1.

**Tech Stack:** Vite 6 + TypeScript 5, vanilla HTML5 Canvas, vitest for unit tests, Cloudflare Pages (hosting) + Worker + KV (leaderboard), PartyKit (optional MP).

**Source spec:** [`docs/specs/2026-04-17-cursor-crew-design.md`](../specs/2026-04-17-cursor-crew-design.md)

---

## File Structure

This is the target layout. Each file has one clear responsibility; nothing is more than ~150 lines.

```
.
├── index.html                   # canvas + jam widget snippet
├── package.json                 # vite, typescript, vitest
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── game.ts                  # main entry: state machine, top-level loop
│   ├── types.ts                 # shared types: Vec2, Entity, CharacterKind, EnemyKind, GameState
│   ├── input.ts                 # keyboard + pointer state singleton
│   ├── loop.ts                  # the inner playing-state loop (entity list, ticks)
│   ├── render.ts                # canvas helpers (clear, transforms, primitives)
│   ├── characters.ts            # 5 cursor characters: factory + behavior
│   ├── enemies.ts               # 5 enemy types: factory + behavior
│   ├── boss.ts                  # Captcha Wheel mini-boss
│   ├── spawner.ts               # wave/difficulty curve + boss trigger
│   ├── score.ts                 # combo multiplier + scoring (PURE, fully tested)
│   ├── bots.ts                  # 3 simple AI bots (Track 1.5 stretch)
│   ├── audio.ts                 # SFX (Track 2 polish)
│   ├── leaderboard.ts           # client for the Worker (Track 2)
│   ├── vibejam.ts               # required jam widget mount
│   ├── style.css
│   └── screens/
│       ├── pick.ts              # character pick screen
│       └── end.ts               # post-match end screen
├── tests/
│   ├── score.test.ts            # combo math, kill values, specialty bonuses
│   ├── spawner.test.ts          # spawn rate curve, mini-boss timing
│   └── seed.test.ts             # daily-seed determinism
├── worker/
│   ├── index.ts                 # Cloudflare Worker: seed + leaderboard endpoints
│   └── wrangler.toml
└── docs/
    ├── specs/2026-04-17-cursor-crew-design.md
    └── plans/2026-04-17-cursor-crew-implementation.md   # this file
```

**Entity contract (used by all characters, enemies, boss, projectiles):**

```ts
// src/types.ts
export type Vec2 = { x: number; y: number };

export type EntityKind =
  | "player"
  | "bot"
  | "enemy"
  | "projectile"
  | "boss"
  | "particle";

export interface Entity {
  id: number;
  kind: EntityKind;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  hp: number;
  team: "good" | "bad";
  data: Record<string, unknown>; // per-kind state bag
  update: (dt: number, world: World) => void;
  draw: (ctx: CanvasRenderingContext2D) => void;
  dead?: boolean;
}

export interface World {
  entities: Entity[];
  add: (e: Entity) => void;
  width: number;
  height: number;
  elapsed: number;       // seconds since match start
  matchLength: number;   // 120
  rng: () => number;     // seeded for the day
  events: GameEvent[];   // queue consumed once per frame
}

export type GameEvent =
  | { type: "kill"; killer: Entity; victim: Entity; distance: number }
  | { type: "damage"; victim: Entity; amount: number }
  | { type: "boss-spawn" }
  | { type: "boss-killed"; killer: Entity };

export type GameState = "pick" | "playing" | "end";

export type CharacterKind = "arrow" | "ibeam" | "hand" | "spinner" | "crosshair";
export type EnemyKind = "404" | "cookie" | "loader" | "notif" | "popup";
```

This contract is **load-bearing** — every later task references it. If you change a name here, change it everywhere.

---

## Phase 1 — Foundation (~3 hrs)

### Task 1: Add vitest and the score test harness

**Files:**
- Modify: `package.json`
- Create: `tests/score.test.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest**

```bash
npm i -D vitest
```

- [ ] **Step 2: Add test script to `package.json`**

In the `scripts` block, add `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write the first failing test**

Create `tests/score.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { newScore, recordKill, takeDamage } from "../src/score";

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
```

- [ ] **Step 5: Run test, expect fail with "module not found"**

```bash
npm test
```
Expected: FAIL — `Cannot find module '../src/score'` (or similar).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/score.test.ts
git commit -m "test: add vitest + failing score harness"
```

---

### Task 2: Implement `src/score.ts` to pass the test

**Files:**
- Create: `src/score.ts`
- Test: `tests/score.test.ts`

- [ ] **Step 1: Write minimal implementation**

Create `src/score.ts`:

```ts
import type { CharacterKind } from "./types";

export interface Score {
  total: number;
  combo: number;     // current multiplier, starts at 1.0
  peakCombo: number; // highest combo reached this match
  kills: number;
}

export interface KillContext {
  value: number;            // base kill value
  bonusMultiplier?: number; // character-specialty bonus, default 1.0
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

// Per-spec kill values:
export const KILL_VALUE = {
  "404": 10,
  cookie: 30,
  loader: 20,
  notif: 15,
  popup: 25,
  boss: 500,
} as const;

// Per-spec specialty bonus matchers. The boolean predicate lives in the kill
// context produced by each character's attack handler — this just maps the
// character to the bonus multiplier when the predicate is true.
export const SPECIALTY_BONUS: Record<CharacterKind, number> = {
  arrow: 1.1,      // always-on
  crosshair: 1.5,  // when snipe distance > 60% screen
  ibeam: 1.25,     // when combo >= 1.5 at melee kill
  hand: 1.25,      // when thrown enemy lands a kill
  spinner: 1.25,   // when 3+ enemies hit in one spin
};
```

- [ ] **Step 2: Run tests, expect PASS**

```bash
npm test
```
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add src/score.ts
git commit -m "feat(score): combo multiplier + kill values per spec"
```

---

### Task 3: Add specialty-bonus tests and verify the table

**Files:**
- Modify: `tests/score.test.ts`

- [ ] **Step 1: Add cases for the per-character bonus**

Append to `tests/score.test.ts`:

```ts
import { SPECIALTY_BONUS, KILL_VALUE } from "../src/score";

describe("specialty bonus", () => {
  it("crosshair snipe applies 1.5x on top of combo", () => {
    const s = newScore();
    recordKill(s, { value: KILL_VALUE["404"], bonusMultiplier: SPECIALTY_BONUS.crosshair });
    // 10 * 1.0 * 1.5 = 15
    expect(s.total).toBe(15);
  });
  it("arrow always-on bonus is 1.1", () => {
    expect(SPECIALTY_BONUS.arrow).toBe(1.1);
  });
});
```

- [ ] **Step 2: Run, expect PASS**
```bash
npm test
```

- [ ] **Step 3: Commit**

```bash
git add tests/score.test.ts
git commit -m "test(score): cover specialty bonus table"
```

---

### Task 4: Type module + game-state machine skeleton

**Files:**
- Create: `src/types.ts` (use the Entity contract from the File Structure section above)
- Modify: `src/game.ts` to host a `GameState` machine and switch screens

- [ ] **Step 1: Create `src/types.ts` exactly as defined in the File Structure section above.**

(Copy the entire `// src/types.ts` block from this plan.)

- [ ] **Step 2: Replace `src/game.ts` with the state machine skeleton**

```ts
import "./style.css";
import type { GameState } from "./types";
import { showPickScreen } from "./screens/pick";
import { runMatch } from "./loop";
import { showEndScreen } from "./screens/end";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener("resize", resize);

let state: GameState = "pick";

async function main(): Promise<void> {
  while (true) {
    if (state === "pick") {
      const pick = await showPickScreen(ctx);
      state = "playing";
      const result = await runMatch(ctx, pick);
      state = "end";
      await showEndScreen(ctx, result);
      state = "pick";
    }
  }
}

void main();
```

- [ ] **Step 3: Stub `screens/pick.ts`, `screens/end.ts`, `loop.ts` so the build passes**

`src/screens/pick.ts`:
```ts
import type { CharacterKind } from "../types";

export interface PickResult { character: CharacterKind }

export async function showPickScreen(_ctx: CanvasRenderingContext2D): Promise<PickResult> {
  return { character: "arrow" };
}
```

`src/screens/end.ts`:
```ts
import type { Score } from "../score";

export async function showEndScreen(_ctx: CanvasRenderingContext2D, _result: { score: Score }): Promise<void> {
  return;
}
```

`src/loop.ts`:
```ts
import type { Score } from "./score";
import { newScore } from "./score";
import type { PickResult } from "./screens/pick";

export async function runMatch(_ctx: CanvasRenderingContext2D, _pick: PickResult): Promise<{ score: Score }> {
  return { score: newScore() };
}
```

- [ ] **Step 4: Build passes**
```bash
npm run build
```
Expected: success, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/game.ts src/screens src/loop.ts
git commit -m "feat: state machine + module stubs (pick → playing → end)"
```

---

### Task 5: Input module + render helpers

**Files:**
- Create: `src/input.ts`
- Create: `src/render.ts`

- [ ] **Step 1: Create `src/input.ts`**

```ts
const keys = new Set<string>();
const pointer = { x: 0, y: 0, down: false, justPressed: false };

window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("pointermove", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
});
window.addEventListener("pointerdown", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.down = true;
  pointer.justPressed = true;
});
window.addEventListener("pointerup", () => { pointer.down = false; });

export const Input = {
  isDown: (k: string): boolean => keys.has(k.toLowerCase()),
  pointer: pointer,
  consumePress: (): boolean => {
    const v = pointer.justPressed;
    pointer.justPressed = false;
    return v;
  },
};
```

- [ ] **Step 2: Create `src/render.ts`**

```ts
export function clear(ctx: CanvasRenderingContext2D, w: number, h: number, color = "#0a0a12"): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, opts?: { color?: string; size?: number; align?: CanvasTextAlign }): void {
  ctx.fillStyle = opts?.color ?? "#ddd";
  ctx.font = `${opts?.size ?? 14}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = opts?.align ?? "left";
  ctx.fillText(s, x, y);
}
```

- [ ] **Step 3: Build passes**
```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/input.ts src/render.ts
git commit -m "feat: input + render helpers"
```

---

## Phase 2 — First playable vertical slice (~5 hrs)

The goal of Phase 2 is **one** character, **one** enemy, real combat, real score, no other characters or enemies, no menus. After Phase 2 you can hit space, fight 404 Walkers with the Arrow cursor, watch the score and combo work, and die.

### Task 6: World + entity loop

**Files:**
- Modify: `src/loop.ts` to a real implementation
- Create: `tests/spawner.test.ts` (kept empty for now; test added in Task 11)

- [ ] **Step 1: Implement the entity-driven match loop**

Replace `src/loop.ts`:

```ts
import { clear, text } from "./render";
import { newScore, type Score } from "./score";
import type { Entity, GameEvent, World } from "./types";
import type { PickResult } from "./screens/pick";
import { makePlayer } from "./characters";
import { stepSpawner } from "./spawner";

export interface MatchResult { score: Score }

const MATCH_LENGTH = 120; // seconds per spec §3.1

let nextId = 0;

export async function runMatch(ctx: CanvasRenderingContext2D, pick: PickResult): Promise<MatchResult> {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const score = newScore();

  const world: World = {
    entities: [],
    add: (e) => { e.id = ++nextId; world.entities.push(e); },
    width: w,
    height: h,
    elapsed: 0,
    matchLength: MATCH_LENGTH,
    rng: Math.random, // replaced by seeded RNG in Task 18
    events: [],
  };

  world.add(makePlayer(pick.character, w / 2, h / 2));

  return new Promise<MatchResult>((resolve) => {
    let last = performance.now();
    function frame(now: number): void {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      world.elapsed += dt;

      stepSpawner(world, dt);

      for (const e of world.entities) e.update(dt, world);
      world.entities = world.entities.filter((e) => !e.dead);

      // process events into the score
      handleEvents(world, score);

      clear(ctx, w, h);
      for (const e of world.entities) e.draw(ctx);

      const remaining = Math.max(0, MATCH_LENGTH - world.elapsed);
      text(ctx, `score ${score.total}   combo ×${score.combo.toFixed(1)}   ${remaining.toFixed(1)}s`, 16, 24);

      if (world.elapsed >= MATCH_LENGTH) {
        resolve({ score });
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

function handleEvents(world: World, score: Score): void {
  // Defined in Task 8 once we have kill events.
  void world; void score;
}
```

- [ ] **Step 2: Build passes (will fail until Tasks 7 + 11 land — that's expected; commit anyway because we're staging)**

```bash
npm run build
```
Expected: error — `makePlayer` and `stepSpawner` not yet defined.

- [ ] **Step 3: Do not commit yet. Move to Task 7.**

---

### Task 7: Arrow character (movement + projectile attack)

**Files:**
- Create: `src/characters.ts`

- [ ] **Step 1: Implement `makePlayer` and projectile**

```ts
import type { CharacterKind, Entity, World } from "./types";
import { Input } from "./input";

const SPEED: Record<CharacterKind, number> = {
  arrow: 240,
  ibeam: 336,
  hand: 240,
  spinner: 168,
  crosshair: 144,
};

export function makePlayer(kind: CharacterKind, x: number, y: number): Entity {
  const e: Entity = {
    id: 0,
    kind: "player",
    pos: { x, y },
    vel: { x: 0, y: 0 },
    radius: 10,
    hp: 3,
    team: "good",
    data: { character: kind, fireCooldown: 0, iframes: 0 },
    update(dt, world) {
      const vx =
        (Input.isDown("d") || Input.isDown("arrowright") ? 1 : 0) -
        (Input.isDown("a") || Input.isDown("arrowleft") ? 1 : 0);
      const vy =
        (Input.isDown("s") || Input.isDown("arrowdown") ? 1 : 0) -
        (Input.isDown("w") || Input.isDown("arrowup") ? 1 : 0);
      const len = Math.hypot(vx, vy) || 1;
      this.pos.x += (vx / len) * SPEED[kind] * dt;
      this.pos.y += (vy / len) * SPEED[kind] * dt;
      this.pos.x = Math.max(this.radius, Math.min(world.width - this.radius, this.pos.x));
      this.pos.y = Math.max(this.radius, Math.min(world.height - this.radius, this.pos.y));

      const cd = this.data.fireCooldown as number;
      this.data.fireCooldown = Math.max(0, cd - dt);
      this.data.iframes = Math.max(0, (this.data.iframes as number) - dt);

      if (Input.pointer.down && (this.data.fireCooldown as number) === 0) {
        if (kind === "arrow") {
          fireProjectile(this, world, Input.pointer.x, Input.pointer.y, 480, 1);
          this.data.fireCooldown = 0.25;
        }
        // other character attacks: implemented in Task 9
      }
    },
    draw(ctx) {
      drawArrow(ctx, this.pos.x, this.pos.y);
    },
  };
  return e;
}

function fireProjectile(owner: Entity, world: World, tx: number, ty: number, speed: number, damage: number): void {
  const dx = tx - owner.pos.x;
  const dy = ty - owner.pos.y;
  const len = Math.hypot(dx, dy) || 1;
  const startX = owner.pos.x;
  const startY = owner.pos.y;
  world.add({
    id: 0,
    kind: "projectile",
    pos: { x: owner.pos.x, y: owner.pos.y },
    vel: { x: (dx / len) * speed, y: (dy / len) * speed },
    radius: 4,
    hp: 1,
    team: owner.team,
    data: { ownerId: owner.id, damage, startX, startY },
    update(dt, w) {
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.x < 0 || this.pos.y < 0 || this.pos.x > w.width || this.pos.y > w.height) this.dead = true;
      // collision: in Task 8
    },
    draw(ctx) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(this.pos.x - 2, this.pos.y - 2, 4, 4);
    },
  });
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 22);
  ctx.lineTo(6, 17);
  ctx.lineTo(10, 25);
  ctx.lineTo(13, 23);
  ctx.lineTo(9, 15);
  ctx.lineTo(16, 15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 2: Hold off on build — needs Task 8.**

---

### Task 8: 404 Walker enemy + collision + kill events + score wiring

**Files:**
- Create: `src/enemies.ts`
- Modify: `src/loop.ts` to handle collisions and the score

- [ ] **Step 1: Implement `src/enemies.ts` with the 404 Walker**

```ts
import type { Entity, World, EnemyKind } from "./types";

const ENEMY_VALUE: Record<EnemyKind, number> = {
  "404": 10, cookie: 30, loader: 20, notif: 15, popup: 25,
};

export function makeEnemy(kind: EnemyKind, x: number, y: number): Entity {
  if (kind === "404") return make404Walker(x, y);
  // other enemies in Task 10
  return make404Walker(x, y);
}

function make404Walker(x: number, y: number): Entity {
  return {
    id: 0,
    kind: "enemy",
    pos: { x, y },
    vel: { x: 0, y: 0 },
    radius: 12,
    hp: 1,
    team: "bad",
    data: { enemyKind: "404" as EnemyKind, value: ENEMY_VALUE["404"], speed: 60 },
    update(dt, world) {
      const player = world.entities.find((e) => e.kind === "player");
      if (!player) return;
      const dx = player.pos.x - this.pos.x;
      const dy = player.pos.y - this.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      const speed = this.data.speed as number;
      this.pos.x += (dx / len) * speed * dt;
      this.pos.y += (dy / len) * speed * dt;
    },
    draw(ctx) {
      ctx.fillStyle = "#ff5555";
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "center";
      ctx.fillText("404", this.pos.x, this.pos.y + 6);
    },
  };
}

export { ENEMY_VALUE };
```

- [ ] **Step 2: Replace the Task 7 projectile `update` with collision + kill event emission**

In `src/characters.ts`, change the projectile `update`:

```ts
update(dt, w) {
  this.pos.x += this.vel.x * dt;
  this.pos.y += this.vel.y * dt;
  if (this.pos.x < 0 || this.pos.y < 0 || this.pos.x > w.width || this.pos.y > w.height) {
    this.dead = true;
    return;
  }
  for (const e of w.entities) {
    if (e.team === "good" || e.kind === "projectile" || e.dead) continue;
    const dx = e.pos.x - this.pos.x;
    const dy = e.pos.y - this.pos.y;
    if (dx * dx + dy * dy <= (e.radius + this.radius) ** 2) {
      e.hp -= this.data.damage as number;
      if (e.hp <= 0) {
        e.dead = true;
        const startX = this.data.startX as number;
        const startY = this.data.startY as number;
        const dist = Math.hypot(this.pos.x - startX, this.pos.y - startY);
        const owner = w.entities.find((x) => x.id === this.data.ownerId);
        if (owner) w.events.push({ type: "kill", killer: owner, victim: e, distance: dist });
      }
      this.dead = true;
      break;
    }
  }
},
```

- [ ] **Step 3: Add player damage on enemy contact**

Append to the player `update` in `src/characters.ts`:

```ts
if ((this.data.iframes as number) === 0) {
  for (const e of world.entities) {
    if (e.team === "bad" && !e.dead) {
      const dx = e.pos.x - this.pos.x;
      const dy = e.pos.y - this.pos.y;
      if (dx * dx + dy * dy <= (e.radius + this.radius) ** 2) {
        this.hp -= 1;
        this.data.iframes = 1.0;
        world.events.push({ type: "damage", victim: this, amount: 1 });
        break;
      }
    }
  }
}
```

- [ ] **Step 4: Wire events to score in `src/loop.ts`**

Replace the `handleEvents` stub:

```ts
import { recordKill, takeDamage, KILL_VALUE } from "./score";
import type { EnemyKind } from "./types";

function handleEvents(world: World, score: Score): void {
  for (const ev of world.events) {
    if (ev.type === "kill") {
      const ek = (ev.victim.data.enemyKind as EnemyKind | undefined) ?? "404";
      recordKill(score, { value: KILL_VALUE[ek] });
    } else if (ev.type === "damage") {
      takeDamage(score);
    }
  }
  world.events.length = 0;
}
```

- [ ] **Step 5: Build passes**

```bash
npm run build
```
Expected: success.

- [ ] **Step 6: Manual playtest**

```bash
npm run dev
```
Open http://localhost:5173. The match starts immediately (no pick screen yet — `showPickScreen` returns "arrow"). You should: see one or more 404 walkers spawning (Task 11 will gate this; for now there are none — that's fine, we add the spawner next).

- [ ] **Step 7: Commit Phase 2 (Tasks 6–8)**

```bash
git add src/loop.ts src/characters.ts src/enemies.ts
git commit -m "feat: arrow + 404 walker + collisions + score wiring"
```

---

### Task 9: Spawner module — first version (404 walkers only)

**Files:**
- Create: `src/spawner.ts`
- Modify: `tests/spawner.test.ts`

- [ ] **Step 1: Implement spawner with linear ramp**

```ts
// src/spawner.ts
import { makeEnemy } from "./enemies";
import type { World } from "./types";

// Linear ramp per spec §3.1.
// Start: one spawn every 2.0s. End (t=120s): one spawn every 0.4s.
export function spawnInterval(elapsed: number, matchLength: number): number {
  const t = Math.min(1, elapsed / matchLength);
  return 2.0 + (0.4 - 2.0) * t;
}

interface SpawnerState { accumulator: number }
const state: SpawnerState = { accumulator: 0 };

export function resetSpawner(): void { state.accumulator = 0; }

export function stepSpawner(world: World, dt: number): void {
  state.accumulator += dt;
  const interval = spawnInterval(world.elapsed, world.matchLength);
  while (state.accumulator >= interval) {
    state.accumulator -= interval;
    const edge = Math.floor(world.rng() * 4);
    let x = 0, y = 0;
    if (edge === 0) { x = world.rng() * world.width; y = -20; }
    else if (edge === 1) { x = world.width + 20; y = world.rng() * world.height; }
    else if (edge === 2) { x = world.rng() * world.width; y = world.height + 20; }
    else { x = -20; y = world.rng() * world.height; }
    world.add(makeEnemy("404", x, y));
  }
}
```

- [ ] **Step 2: Write tests for the spawn curve**

`tests/spawner.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { spawnInterval } from "../src/spawner";

describe("spawnInterval", () => {
  it("starts at 2.0s at t=0", () => {
    expect(spawnInterval(0, 120)).toBeCloseTo(2.0);
  });
  it("ends at 0.4s at t=120", () => {
    expect(spawnInterval(120, 120)).toBeCloseTo(0.4);
  });
  it("is monotonic decreasing", () => {
    let last = Infinity;
    for (let t = 0; t <= 120; t += 10) {
      const v = spawnInterval(t, 120);
      expect(v).toBeLessThanOrEqual(last);
      last = v;
    }
  });
});
```

- [ ] **Step 3: Add `resetSpawner()` call to `runMatch` in `src/loop.ts`**

At the top of `runMatch`, after creating `world`, add:
```ts
import { resetSpawner } from "./spawner";
// ...
resetSpawner();
```

- [ ] **Step 4: Run tests + build**
```bash
npm test && npm run build
```
Expected: tests pass, build succeeds.

- [ ] **Step 5: Manual playtest**

```bash
npm run dev
```
Expected: 404 walkers spawn from screen edges, chase you. Click to fire arrows. Score and combo update. Damage resets combo to 1.0.

- [ ] **Step 6: Commit**

```bash
git add src/spawner.ts src/loop.ts tests/spawner.test.ts
git commit -m "feat(spawner): linear ramp 2.0s → 0.4s + 404 walker spawns"
```

**End of Phase 2.** You now have a complete vertical slice: Arrow vs. 404 Walkers, real score, real combo, real death loop. Everything that follows is breadth and polish.

---

## Phase 3 — Roster expansion (~4 hrs)

### Task 10: Add the 4 remaining characters

**Files:**
- Modify: `src/characters.ts`

- [ ] **Step 1: Expand `makePlayer` to handle all 5 character kinds**

In `src/characters.ts`, replace the single-kind `if (kind === "arrow")` block in the player `update` with a switch over all five. Each character's attack:

| Kind | Attack | Cooldown | Implementation |
|---|---|---|---|
| arrow | projectile toward pointer, dmg 1, speed 480 | 0.25s | (already done) |
| ibeam | melee swipe in front of player (90° arc, range 40), dmg 1 | 0.30s | spawn a brief invisible hit-entity that lives 0.10s and does damage on overlap |
| hand | grab nearest enemy within 80px, set as `data.heldId`. On next click, throw it toward pointer at 360 px/s, doing dmg 1 to its target on collision (collateral = 1 to anything else hit) | 0.20s | enemy with `data.heldId` set ignores its normal `update` |
| spinner | spin AoE radius 60 around player, dmg 1/tick at 4 ticks/sec while held | 0 (continuous while button held) | per-frame: damage all enemies within radius once per 0.25s |
| crosshair | hitscan line from player to pointer, dmg 3, fires immediately, leaves a 0.15s line trail | 0.80s | mark all enemies on the line as taking 3 damage; spawn a `particle` line entity that fades |

Each kind should emit `{ type: "kill", killer: this, victim: e, distance }` correctly when its attack lands the killing blow. `distance` for melee = 0; for hand-throw = throw distance; for crosshair = distance from player to enemy at hit.

- [ ] **Step 2: Drawing for the 4 new characters**

Add a `drawX(ctx, x, y)` helper for each cursor type. Acceptable shapes:
- **I-beam**: three rectangles forming `I` (top bar, vertical, bottom bar), white fill, black outline.
- **Hand**: a 32×32 white-filled hand silhouette built from rectangles (palm + 4 fingers + thumb).
- **Spinner**: rotating 3-segment arc, rotation increases with `world.elapsed`.
- **Crosshair**: two crossed lines + center dot + a thin circle.

- [ ] **Step 3: Build + manual playtest each character**

```bash
npm run build && npm run dev
```
Manually edit `showPickScreen` to return each character in turn for testing (revert after).

- [ ] **Step 4: Commit**

```bash
git add src/characters.ts
git commit -m "feat(characters): add ibeam, hand, spinner, crosshair attacks + draws"
```

---

### Task 11: Add the 4 remaining enemies

**Files:**
- Modify: `src/enemies.ts`

- [ ] **Step 1: Implement each enemy in `makeEnemy`**

Per spec §3.4:

| Kind | HP | Behavior |
|---|---|---|
| 404 | 1 | (done) chase player; on death split into two 0.5×-speed walkers (limit recursion to 1 split) |
| cookie | 3 | spawn at `y = h * 0.3` or `0.7`, `vx = ±50 px/s`, blocks player physically (resolve overlap by pushing player) |
| loader | 2 | orbit player at 140 px radius at 60°/s, low-damage on contact |
| notif | 1 | small red dot, 180 px/s suicide rush at the player; on contact deals 1 dmg and self-destructs |
| popup | 2 | spawns at random interior point; if alive at +5s, spawns 2 more popups (cap world popup count at 8) |

The 404 split-on-death is implemented in the spawner's event handler in Task 12.

- [ ] **Step 2: Update `ENEMY_VALUE` table to match spec (already correct from Task 8)**

- [ ] **Step 3: Wire spawner to randomly pick an enemy kind**

In `src/spawner.ts`, replace `makeEnemy("404", x, y)` with a weighted picker:

```ts
function pickEnemy(rng: () => number, elapsed: number): import("./types").EnemyKind {
  // Cookie/popup unlock after 20s, loader/notif unlock after 40s.
  const pool: import("./types").EnemyKind[] = ["404"];
  if (elapsed > 20) pool.push("cookie", "popup");
  if (elapsed > 40) pool.push("loader", "notif");
  return pool[Math.floor(rng() * pool.length)];
}
```

- [ ] **Step 4: Build + playtest**
```bash
npm run build && npm run dev
```

- [ ] **Step 5: Commit**

```bash
git add src/enemies.ts src/spawner.ts
git commit -m "feat(enemies): add cookie, loader, notif, popup + weighted spawn pool"
```

---

### Task 12: 404 split-on-death + popup self-replication

**Files:**
- Modify: `src/loop.ts` (event handler)

- [ ] **Step 1: Extend `handleEvents` to react to kills of `404` and to popup timers**

```ts
function handleEvents(world: World, score: Score): void {
  for (const ev of world.events) {
    if (ev.type === "kill") {
      const ek = (ev.victim.data.enemyKind as EnemyKind | undefined) ?? "404";
      recordKill(score, { value: KILL_VALUE[ek] });
      if (ek === "404" && !(ev.victim.data.split as boolean)) {
        spawn404Split(world, ev.victim.pos.x, ev.victim.pos.y);
      }
    } else if (ev.type === "damage") {
      takeDamage(score);
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
```

- [ ] **Step 2: Popup self-replication uses a per-popup timer in its own `update`** (already implemented in Task 11; verify cap of 8 is enforced by counting `world.entities.filter(e => e.data.enemyKind === "popup").length` before spawning).

- [ ] **Step 3: Build + playtest**

- [ ] **Step 4: Commit**

```bash
git add src/loop.ts
git commit -m "feat: 404 split-on-death + popup replication cap"
```

---

## Phase 4 — Match flow (~3 hrs)

### Task 13: Captcha mini-boss

**Files:**
- Create: `src/boss.ts`
- Modify: `src/loop.ts` (or `src/spawner.ts`) to trigger at 60s

- [ ] **Step 1: Implement Captcha Wheel boss per spec §3.4**

```ts
// src/boss.ts
import type { Entity, World } from "./types";

export function makeCaptchaBoss(world: World): Entity {
  return {
    id: 0,
    kind: "boss",
    pos: { x: world.width / 2, y: world.height / 2 },
    vel: { x: 0, y: 0 },
    radius: 36,
    hp: 9,
    team: "bad",
    data: { fireTimer: 2, age: 0, expireAt: 20 },
    update(dt, w) {
      this.data.age = (this.data.age as number) + dt;
      if ((this.data.age as number) >= (this.data.expireAt as number)) {
        this.dead = true;
        return;
      }
      this.data.fireTimer = (this.data.fireTimer as number) - dt;
      if ((this.data.fireTimer as number) <= 0) {
        this.data.fireTimer = 2;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          spawnBossBullet(this, w, Math.cos(a) * 160, Math.sin(a) * 160);
        }
      }
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      const age = this.data.age as number;
      ctx.rotate(age * 0.6);
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(-30, -30, 60, 60);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("CAPTCHA", 0, 0);
      ctx.fillText(`HP ${this.hp}`, 0, 14);
      ctx.restore();
    },
  };
}

function spawnBossBullet(owner: Entity, world: World, vx: number, vy: number): void {
  world.add({
    id: 0,
    kind: "projectile",
    pos: { x: owner.pos.x, y: owner.pos.y },
    vel: { x: vx, y: vy },
    radius: 5,
    hp: 1,
    team: "bad",
    data: { damage: 1 },
    update(dt, w) {
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.x < -50 || this.pos.x > w.width + 50 || this.pos.y < -50 || this.pos.y > w.height + 50) {
        this.dead = true;
      }
    },
    draw(ctx) {
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    },
  });
}
```

- [ ] **Step 2: Trigger boss at 60s in `src/loop.ts`**

Add a `bossSpawned` flag in the `world` setup, then in the frame body before `handleEvents`:
```ts
if (!(world as unknown as { bossSpawned?: boolean }).bossSpawned && world.elapsed >= 60) {
  (world as unknown as { bossSpawned: boolean }).bossSpawned = true;
  world.add(makeCaptchaBoss(world));
  world.events.push({ type: "boss-spawn" });
}
```

- [ ] **Step 3: Boss kill awards 500 + clears arena**

Extend `handleEvents` to handle `boss-killed`:
```ts
} else if (ev.type === "boss-killed") {
  score.total += 500;
  // clear non-boss enemies for the calm window
  for (const e of world.entities) if (e.kind === "enemy") e.dead = true;
}
```

And in the boss update, when `this.dead = true` from HP reaching 0 (track with `if (this.hp <= 0 && !this.dead)`), push `{ type: "boss-killed", killer: ??? }`. Since we don't track who landed the killing blow trivially, push the player as `killer`:
```ts
if (this.hp <= 0 && !this.dead) {
  this.dead = true;
  const player = w.entities.find((x) => x.kind === "player");
  if (player) w.events.push({ type: "boss-killed", killer: player });
}
```

- [ ] **Step 4: Build + playtest** — confirm boss appears at 60s, dies in 9 hits, gives +500.

- [ ] **Step 5: Commit**

```bash
git add src/boss.ts src/loop.ts
git commit -m "feat(boss): captcha wheel mini-boss at t=60s, +500 + arena clear"
```

---

### Task 14: Character pick screen

**Files:**
- Modify: `src/screens/pick.ts`

- [ ] **Step 1: Replace the stub with a real pick screen**

```ts
import type { CharacterKind } from "../types";
import { Input } from "../input";
import { clear, text } from "../render";

export interface PickResult { character: CharacterKind }

const ROSTER: { kind: CharacterKind; label: string; tagline: string }[] = [
  { kind: "arrow",     label: "ARROW",     tagline: "balanced — ranged shots" },
  { kind: "ibeam",     label: "I-BEAM",    tagline: "fast — melee combo" },
  { kind: "hand",      label: "HAND",      tagline: "grabs + throws enemies" },
  { kind: "spinner",   label: "SPINNER",   tagline: "slow — spin AoE" },
  { kind: "crosshair", label: "CROSSHAIR", tagline: "very slow — high dmg snipe" },
];

export function showPickScreen(ctx: CanvasRenderingContext2D): Promise<PickResult> {
  return new Promise((resolve) => {
    function frame(): void {
      const w = window.innerWidth;
      const h = window.innerHeight;
      clear(ctx, w, h);
      text(ctx, "CURSOR CREW", w / 2, 80, { size: 36, align: "center" });
      text(ctx, "pick your cursor → click a card to start", w / 2, 110, { color: "#888", align: "center" });
      const cardW = 180, cardH = 200, gap = 16;
      const totalW = ROSTER.length * cardW + (ROSTER.length - 1) * gap;
      const x0 = (w - totalW) / 2;
      const y0 = h / 2 - cardH / 2;
      const px = Input.pointer.x, py = Input.pointer.y;
      let hovered: CharacterKind | null = null;
      for (let i = 0; i < ROSTER.length; i++) {
        const cx = x0 + i * (cardW + gap);
        const isHover = px >= cx && px <= cx + cardW && py >= y0 && py <= y0 + cardH;
        ctx.fillStyle = isHover ? "#1e1e2e" : "#0f0f18";
        ctx.fillRect(cx, y0, cardW, cardH);
        ctx.strokeStyle = isHover ? "#fff" : "#444";
        ctx.strokeRect(cx, y0, cardW, cardH);
        text(ctx, ROSTER[i].label,   cx + cardW / 2, y0 + 40, { align: "center", size: 16 });
        text(ctx, ROSTER[i].tagline, cx + cardW / 2, y0 + cardH - 24, { align: "center", color: "#aaa", size: 11 });
        if (isHover) hovered = ROSTER[i].kind;
      }
      if (hovered && Input.consumePress()) {
        resolve({ character: hovered });
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
```

- [ ] **Step 2: Build + playtest** — pick a character and confirm match starts with the right one.

- [ ] **Step 3: Commit**

```bash
git add src/screens/pick.ts
git commit -m "feat(pick): character pick screen with hover cards"
```

---

### Task 15: End screen + restart

**Files:**
- Modify: `src/screens/end.ts`

- [ ] **Step 1: Implement the end screen**

```ts
import { Input } from "../input";
import { clear, text } from "../render";
import type { Score } from "../score";

export function showEndScreen(ctx: CanvasRenderingContext2D, result: { score: Score; character: string }): Promise<void> {
  return new Promise((resolve) => {
    function frame(): void {
      const w = window.innerWidth, h = window.innerHeight;
      clear(ctx, w, h);
      text(ctx, "TIME!", w / 2, h / 2 - 80, { size: 36, align: "center" });
      text(ctx, `${result.character.toUpperCase()}`, w / 2, h / 2 - 40, { size: 14, align: "center", color: "#aaa" });
      text(ctx, `score  ${result.score.total}`, w / 2, h / 2,      { size: 24, align: "center" });
      text(ctx, `peak combo  ×${result.score.peakCombo.toFixed(1)}`, w / 2, h / 2 + 30, { size: 14, align: "center", color: "#aaa" });
      text(ctx, `kills  ${result.score.kills}`, w / 2, h / 2 + 50, { size: 14, align: "center", color: "#aaa" });
      text(ctx, "click or press SPACE to play again", w / 2, h - 80, { size: 12, align: "center", color: "#888" });
      if (Input.isDown(" ") || Input.consumePress()) { resolve(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
```

- [ ] **Step 2: Pass `character` through from `runMatch`**

In `src/loop.ts`, change `MatchResult` to `{ score: Score; character: CharacterKind }` and return `pick.character` alongside `score`. Update `src/game.ts` to forward it.

- [ ] **Step 3: Build + playtest** — full pick → 120s match → end → restart loop should work.

- [ ] **Step 4: Commit**

```bash
git add src/screens/end.ts src/loop.ts src/game.ts
git commit -m "feat(end): post-match screen with score + restart"
```

---

## Phase 5 — Ship Track 1 (~3 hrs)

### Task 16: Add the Vibe Jam widget snippet

**Files:**
- Modify: `index.html`
- Create: `src/vibejam.ts` (only if the snippet has a JS form; otherwise inline in HTML)

- [ ] **Step 1: Fetch the exact snippet from the jam page**

Open <https://vibej.am/2026/#widget> in a browser, inspect the widget section, copy the snippet verbatim. Per the rules, missing this snippet = disqualification.

- [ ] **Step 2: Paste into `index.html` between the closing `</script>` and `</body>` tags, replacing the stubbed comment.**

- [ ] **Step 3: Build, deploy a preview, verify the badge renders.**

```bash
npm run build && npm run preview
```
Open the preview URL and visually confirm the badge appears.

- [ ] **Step 4: Commit**

```bash
git add index.html src/vibejam.ts
git commit -m "feat: add required Vibe Jam 2026 entrant widget snippet"
```

---

### Task 17: Deploy to Cloudflare Pages

**Files:**
- Create: `wrangler.toml` (Pages config, optional — Pages also supports git-only)

- [ ] **Step 1: Push to GitHub if not already**
```bash
git push
```

- [ ] **Step 2: In the Cloudflare dashboard, Pages → Create project → Connect to GitHub → select `casper7995/cursor-crew`. Build command: `npm run build`. Build output: `dist`. Production branch: `main`.**

- [ ] **Step 3: Wait for first deploy. Note the assigned URL (e.g., `cursor-crew.pages.dev`).**

- [ ] **Step 4: Verify the deployed URL: instant load, game runs, widget badge visible, no console errors.**

- [ ] **Step 5: Submit to vibej.am/2026 form** with the deployed URL.

- [ ] **Step 6: Commit any deploy-config tweaks (no code changes needed for vanilla Pages)** and tag:

```bash
git tag -a v0.1.0 -m "Track 1 shipped: pick → fight → die loop, deployed, submitted"
git push --tags
```

**End of Track 1.** From here on, every commit to `main` redeploys automatically. You have a complete game submitted to the jam.

---

## Phase 6 — Polish (~6 hrs, Weekend 2 Saturday)

### Task 18: Bots (3 simple AI bots)

**Files:**
- Create: `src/bots.ts`
- Modify: `src/loop.ts` to spawn bots in the match

- [ ] **Step 1: Implement `makeBot`**

```ts
// src/bots.ts
import type { CharacterKind, Entity, World } from "./types";
import { makePlayer } from "./characters";

export function makeBot(kind: CharacterKind, x: number, y: number): Entity {
  const e = makePlayer(kind, x, y);
  e.kind = "bot";
  e.data.botTarget = null;
  // override update with bot AI: chase nearest enemy, attack when in range
  const baseDraw = e.draw;
  e.update = function (dt, world) {
    const enemies = world.entities.filter((x) => x.team === "bad" && !x.dead);
    if (enemies.length === 0) return;
    let nearest = enemies[0];
    let bestD = Infinity;
    for (const ee of enemies) {
      const dx = ee.pos.x - this.pos.x, dy = ee.pos.y - this.pos.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; nearest = ee; }
    }
    const dx = nearest.pos.x - this.pos.x, dy = nearest.pos.y - this.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 200; // bots move at fixed speed regardless of character to keep AI simple
    if (Math.sqrt(bestD) > 200) {
      this.pos.x += (dx / len) * speed * dt;
      this.pos.y += (dy / len) * speed * dt;
    }
    // synthetic "attack" — every 0.4s spawn a projectile toward nearest
    const cd = (this.data.fireCooldown as number) - dt;
    this.data.fireCooldown = Math.max(0, cd);
    if (cd <= 0) {
      // call the same fireProjectile by simulating a click target
      // (simpler: just spawn the projectile inline)
      world.add({
        id: 0, kind: "projectile",
        pos: { x: this.pos.x, y: this.pos.y },
        vel: { x: (dx / len) * 480, y: (dy / len) * 480 },
        radius: 4, hp: 1, team: "good",
        data: { ownerId: this.id, damage: 1, startX: this.pos.x, startY: this.pos.y },
        update: function (dt2, w) {
          this.pos.x += this.vel.x * dt2;
          this.pos.y += this.vel.y * dt2;
          if (this.pos.x < 0 || this.pos.y < 0 || this.pos.x > w.width || this.pos.y > w.height) { this.dead = true; return; }
          for (const en of w.entities) {
            if (en.team !== "bad" || en.dead) continue;
            const dxe = en.pos.x - this.pos.x, dye = en.pos.y - this.pos.y;
            if (dxe * dxe + dye * dye <= (en.radius + this.radius) ** 2) {
              en.hp -= 1;
              if (en.hp <= 0) {
                en.dead = true;
                // bot kills do NOT add to player score (per design — only player's kills count)
              }
              this.dead = true;
              return;
            }
          }
        },
        draw: function (ctx) { ctx.fillStyle = "#88f"; ctx.fillRect(this.pos.x - 2, this.pos.y - 2, 4, 4); },
      });
      this.data.fireCooldown = 0.4;
    }
  };
  e.draw = baseDraw;
  return e;
}
```

- [ ] **Step 2: Spawn 3 bots in `runMatch`**

```ts
import { makeBot } from "./bots";
const otherKinds: CharacterKind[] = (["arrow","ibeam","hand","spinner","crosshair"] as CharacterKind[])
  .filter((k) => k !== pick.character);
for (let i = 0; i < 3; i++) {
  world.add(makeBot(otherKinds[i], 100 + i * 200, 100));
}
```

- [ ] **Step 3: Build + playtest** — bots should run around shooting at enemies. Their kills should NOT inflate the player's score (verify combo doesn't change from a bot kill).

- [ ] **Step 4: Commit**

```bash
git add src/bots.ts src/loop.ts
git commit -m "feat(bots): 3 bots fill the arena, do not affect player score"
```

---

### Task 19: Juice pass — screen shake, hit-stop, particles, SFX

**Files:**
- Create: `src/audio.ts`
- Modify: `src/loop.ts`, `src/render.ts`

- [ ] **Step 1: Implement screen shake in `src/loop.ts`**

Add a `shake` field to a local state object:
```ts
let shake = 0;
// in handleEvents on "kill": shake = Math.min(8, shake + 2);
// in handleEvents on "damage": shake = Math.min(12, shake + 8);
// each frame: shake = Math.max(0, shake - dt * 30);
// before drawing entities:
const sx = (Math.random() - 0.5) * shake;
const sy = (Math.random() - 0.5) * shake;
ctx.translate(sx, sy);
// after drawing:
ctx.translate(-sx, -sy);
```

- [ ] **Step 2: Implement hit-stop (50ms freeze) on kill**

Add `let hitstop = 0;` in `runMatch`. In the frame loop, if `hitstop > 0`, skip the entity update step but still draw. On `kill` event, set `hitstop = 0.05`. Decrement by `dt` each frame.

- [ ] **Step 3: Implement particles**

Add a particle entity in `src/render.ts` (or inline in `loop.ts`):
```ts
export function spawnHitParticles(world: World, x: number, y: number, color: string, count = 8): void {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 80 + Math.random() * 120;
    world.add({
      id: 0, kind: "particle",
      pos: { x, y }, vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
      radius: 2, hp: 1, team: "good",
      data: { life: 0.4 },
      update(dt) {
        (this.data.life as number) <= 0 ? (this.dead = true) : null;
        this.data.life = (this.data.life as number) - dt;
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.vel.x *= 0.92;
        this.vel.y *= 0.92;
      },
      draw(ctx) {
        ctx.globalAlpha = Math.max(0, (this.data.life as number) / 0.4);
        ctx.fillStyle = color;
        ctx.fillRect(this.pos.x - 1, this.pos.y - 1, 2, 2);
        ctx.globalAlpha = 1;
      },
    });
  }
}
```
Trigger on every kill event in `handleEvents` using the victim's pos.

- [ ] **Step 4: Implement SFX in `src/audio.ts` using WebAudio (no external files)**

```ts
const ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

function blip(freq: number, duration: number, type: OscillatorType = "square", gain = 0.05): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(g).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

export const SFX = {
  shoot: () => blip(800, 0.06, "square", 0.03),
  kill: () => blip(220, 0.10, "sawtooth", 0.05),
  hurt: () => blip(120, 0.20, "square", 0.08),
  boss: () => blip(80, 0.30, "sawtooth", 0.10),
};
```

- [ ] **Step 5: Wire SFX in `handleEvents` and on attack triggers in `characters.ts`**

- [ ] **Step 6: Build + playtest the feel.** Iterate on shake amount, hit-stop length, particle count until each kill feels satisfying. **Time-box this to 60 minutes.**

- [ ] **Step 7: Commit**

```bash
git add src/loop.ts src/render.ts src/audio.ts src/characters.ts
git commit -m "feat(juice): screen shake + hit-stop + particles + SFX"
```

---

### Task 20: Character specialty bonuses

**Files:**
- Modify: `src/loop.ts` (event handler), `src/characters.ts`

- [ ] **Step 1: Carry character info on the `kill` event**

Extend `GameEvent`'s `kill` variant in `src/types.ts`:
```ts
| { type: "kill"; killer: Entity; victim: Entity; distance: number; meta?: { thrown?: boolean; comboAtKill?: number; spinHits?: number } }
```

- [ ] **Step 2: At kill time, populate `meta` per character**

In each character's attack handler in `characters.ts`, before pushing the kill event, fill the relevant flag:
- arrow: nothing extra
- crosshair: nothing extra (distance is already on the event)
- ibeam: `meta.comboAtKill = currentCombo` — but we don't have access here; instead, populate it in `handleEvents` from `score.combo` BEFORE calling `recordKill`.
- hand: when a thrown enemy lands a kill on another enemy, set `meta.thrown = true`.
- spinner: count enemies hit per spin tick and set `meta.spinHits`.

- [ ] **Step 3: In `handleEvents`, compute the bonus**

```ts
import { SPECIALTY_BONUS } from "./score";

// inside the kill case, BEFORE recordKill:
const characterKind = (ev.killer.data.character as CharacterKind | undefined);
let bonus = 1.0;
if (characterKind === "arrow") bonus = SPECIALTY_BONUS.arrow;
else if (characterKind === "crosshair" && ev.distance > Math.min(world.width, world.height) * 0.6) bonus = SPECIALTY_BONUS.crosshair;
else if (characterKind === "ibeam" && score.combo >= 1.5) bonus = SPECIALTY_BONUS.ibeam;
else if (characterKind === "hand" && ev.meta?.thrown) bonus = SPECIALTY_BONUS.hand;
else if (characterKind === "spinner" && (ev.meta?.spinHits ?? 0) >= 3) bonus = SPECIALTY_BONUS.spinner;
recordKill(score, { value: KILL_VALUE[ek], bonusMultiplier: bonus });
```

- [ ] **Step 4: Build + playtest each character; verify the bonus actually fires (log to console temporarily).**

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/characters.ts src/loop.ts
git commit -m "feat(score): character specialty bonuses live in match"
```

---

## Phase 7 — Daily leaderboard (~4 hrs, Weekend 2 Sunday morning)

### Task 21: Cloudflare Worker scaffold

**Files:**
- Create: `worker/index.ts`
- Create: `worker/wrangler.toml`
- Create: `tests/seed.test.ts`

- [ ] **Step 1: Install wrangler**

```bash
npm i -D wrangler
```

- [ ] **Step 2: Create `worker/wrangler.toml`**

```toml
name = "cursor-crew-api"
main = "index.ts"
compatibility_date = "2026-04-17"

[[kv_namespaces]]
binding = "LB"
id = "REPLACE_WITH_KV_NAMESPACE_ID"
```

You will create the KV namespace via `npx wrangler kv namespace create LB --remote` and paste the returned id.

- [ ] **Step 3: Implement the Worker**

```ts
// worker/index.ts
export interface Env { LB: KVNamespace }

const MAX_SCORE = 1_000_000; // anti-cheat hard cap
const TOP_N = 100;

function dailyKey(date: string, character: string): string { return `lb:${date}:${character}`; }

function todayUtc(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// Mulberry32 PRNG seeded by date hash so every player gets the same enemy sequence.
function dailySeed(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/seed" && req.method === "GET") {
      const date = url.searchParams.get("date") ?? todayUtc();
      return Response.json({ date, seed: dailySeed(date) }, { headers: cors });
    }

    if (url.pathname === "/leaderboard" && req.method === "GET") {
      const date = url.searchParams.get("date") ?? todayUtc();
      const character = url.searchParams.get("character") ?? "arrow";
      const raw = await env.LB.get(dailyKey(date, character));
      const list = raw ? JSON.parse(raw) : [];
      return Response.json({ date, character, scores: list.slice(0, TOP_N) }, { headers: cors });
    }

    if (url.pathname === "/score" && req.method === "POST") {
      const body = await req.json() as { date: string; character: string; score: number; combo: number; name: string };
      if (typeof body.score !== "number" || body.score < 0 || body.score > MAX_SCORE) {
        return new Response("invalid score", { status: 400, headers: cors });
      }
      const k = dailyKey(body.date, body.character);
      const raw = await env.LB.get(k);
      const list: Array<{ score: number; combo: number; name: string; ts: number }> = raw ? JSON.parse(raw) : [];
      list.push({ score: body.score, combo: body.combo, name: (body.name || "anon").slice(0, 16), ts: Date.now() });
      list.sort((a, b) => b.score - a.score);
      await env.LB.put(k, JSON.stringify(list.slice(0, 500)));
      const rank = list.findIndex((s) => s.score === body.score) + 1;
      return Response.json({ rank }, { headers: cors });
    }

    return new Response("not found", { status: 404, headers: cors });
  },
};
```

- [ ] **Step 4: Add a unit test for `dailySeed` determinism**

`tests/seed.test.ts`:
```ts
import { describe, it, expect } from "vitest";

// Re-implement here to avoid importing Worker code into vitest (different runtime).
function dailySeed(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

describe("dailySeed", () => {
  it("is deterministic per date string", () => {
    expect(dailySeed("2026-04-17")).toBe(dailySeed("2026-04-17"));
  });
  it("differs across days", () => {
    expect(dailySeed("2026-04-17")).not.toBe(dailySeed("2026-04-18"));
  });
});
```

- [ ] **Step 5: Run tests**
```bash
npm test
```

- [ ] **Step 6: Deploy the worker**

```bash
cd worker
npx wrangler kv namespace create LB --remote
# paste returned id into wrangler.toml
npx wrangler deploy
```
Note the deployed URL (e.g. `https://cursor-crew-api.<account>.workers.dev`).

- [ ] **Step 7: Commit**

```bash
git add worker/ tests/seed.test.ts package.json package-lock.json
git commit -m "feat(worker): leaderboard + daily-seed endpoints on Cloudflare"
```

---

### Task 22: Wire leaderboard into the game

**Files:**
- Create: `src/leaderboard.ts`
- Modify: `src/loop.ts` (use seeded RNG), `src/screens/end.ts` (post + show top 10)

- [ ] **Step 1: Create the client**

```ts
// src/leaderboard.ts
const API = "https://cursor-crew-api.REPLACE.workers.dev"; // paste your worker URL

export async function fetchSeed(date: string): Promise<number> {
  const r = await fetch(`${API}/seed?date=${date}`);
  return (await r.json() as { seed: number }).seed;
}

export async function fetchLeaderboard(date: string, character: string): Promise<Array<{ score: number; combo: number; name: string }>> {
  const r = await fetch(`${API}/leaderboard?date=${date}&character=${character}`);
  return (await r.json() as { scores: Array<{ score: number; combo: number; name: string }> }).scores;
}

export async function postScore(date: string, character: string, score: number, combo: number, name: string): Promise<{ rank: number }> {
  const r = await fetch(`${API}/score`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, character, score, combo, name }),
  });
  return r.json() as Promise<{ rank: number }>;
}
```

- [ ] **Step 2: Use the seeded RNG in `runMatch`**

```ts
import { fetchSeed } from "./leaderboard";

// inside runMatch, before frame loop:
const date = new Date().toISOString().slice(0, 10);
const seed = await fetchSeed(date);
let s = seed;
const rng = (): number => {
  s |= 0; s = (s + 0x6D2B79F5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
world.rng = rng;
```

- [ ] **Step 3: On end, post the score and show top 10**

In `showEndScreen`, after rendering the result, call `postScore(...)` once and then `fetchLeaderboard(...)`. Render a top-10 list on the right side of the screen.

Persist the player's name in `localStorage` (`cursor-crew:name`). If empty, prompt once with a small inline text input (or default to a generated id like `cursor-####`).

- [ ] **Step 4: Build, playtest, verify Worker logs show traffic and the leaderboard renders.**

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard.ts src/loop.ts src/screens/end.ts
git commit -m "feat(leaderboard): seeded RNG + daily top-10 in end screen"
```

---

## Phase 8 — Stretch (only if time, in this order)

### Task 23: Vibe Jam portal integration

**Files:**
- Modify: `src/loop.ts`, `index.html`

- [ ] Per spec at <https://vibej.am/2026/#portals>:
  - Detect incoming `?portal=true` in URL → spawn the player at a "start portal" position; if `?ref=` is present, render a portal back to that URL.
  - Add an "exit portal" entity at a fixed corner of the arena. On player overlap, redirect to `https://vibej.am/portal/2026?username=<name>&ref=<this-url>`.
- [ ] Commit: `feat: vibe jam portal in/out wiring`.

---

### Task 24: PartyKit multiplayer (Track 2 — only if Saturday went clean)

**Files:**
- Create: `party/server.ts`
- Modify: `src/loop.ts`

- [ ] Install: `npm i -D partykit && npm i partysocket`.
- [ ] Implement an authoritative PartyKit room: 30 Hz tick, broadcast positions, treat human player input as commands. Keep bots filling empty slots.
- [ ] Add a "join" toggle to the pick screen: "play solo" vs "find a room".
- [ ] If lobby empty for >30s, return to single-player + bots.
- [ ] **Cut this task entirely if unfinished by Sunday afternoon.** Track 1 is the deliverable.
- [ ] Commit: `feat(mp): partykit rooms + bot fillers`.

---

## Self-Review

I checked the plan against the spec and made these corrections:

1. **Spec coverage** — every spec section now has at least one task:
   - §3.1 match flow → Tasks 6, 13 (boss at 60s), 14, 15
   - §3.2 scoring → Tasks 1–3, 12, 20
   - §3.3 characters → Tasks 7, 10
   - §3.4 enemies → Tasks 8, 11, 12
   - §3.4 mini-boss → Task 13
   - §3.5 bots → Task 18
   - §4 architecture/stack → File Structure section + Tasks 4–6
   - §4.3 leaderboard → Tasks 21, 22
   - §4.4 multiplayer → Task 24 (correctly tagged as droppable)
   - §5 scope plan → phase headers map directly to Saturday/Sunday split
   - §6 risks → mitigations are baked in (jam widget = Task 16; multiplayer last; juice time-boxed)

2. **Placeholder scan** — I removed three "TODO/etc" patterns from the first draft:
   - Task 10 (multi-character attacks) had a "similar to arrow" hand-wave; now each kind has an explicit attack spec.
   - Task 19 (juice) had "iterate on feel"; now bounded to a 60-minute time-box with concrete starting values.
   - Task 21 worker had `MAX_SCORE = TBD`; now `1_000_000` with a comment about anti-cheat scope.

3. **Type consistency** — verified the `Entity` / `World` / `GameEvent` shapes in §File Structure are referenced consistently in every task. Specifically:
   - `world.events.push(...)` consumers use `{ type: "kill", killer, victim, distance }` everywhere.
   - `data.character` (CharacterKind) is the field bots and players both use; bots are tagged `kind: "bot"` and the score handler ignores their kills.
   - `KILL_VALUE` and `SPECIALTY_BONUS` from `src/score.ts` are referenced by exact name in Tasks 8, 12, 20.
   - `recordKill(s, { value, bonusMultiplier })` signature is consistent across Tasks 2, 8, 12, 20.

4. **Known soft spots** (acknowledged, not bugs):
   - Bot AI (Task 18) is intentionally simple; it does not respect `data.character` for attack style, only visual draw. That is a stated trade-off.
   - The score posted to the Worker (Task 22) has no signature/HMAC — anti-cheat is "score < 1M cap" only. Acceptable for jam scope; the spec already calls this out.
