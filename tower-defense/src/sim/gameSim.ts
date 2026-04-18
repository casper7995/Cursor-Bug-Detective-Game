import { ARENA_HALF, clampToArenaXZ } from "../world/arena";
import {
  directionTo,
  pickLockTarget,
  pickNearestEnemy,
} from "../combat/lockOn";
import type { CharacterClass } from "../classes/characterClass";
import * as THREE from "three";

const MOVE_SPEED = 14;
const SPRINT_MULT = 1.55;
const DASH_SPEED = 42;
const DASH_DURATION = 0.18;
const DASH_COOLDOWN = 1.1;

const ENEMY_HP = 42;
const ENEMY_SPEED = 7;
const ENEMY_RADIUS = 0.9;

const ARROW_DAMAGE = 12;
const ARROW_CD = 0.33;
const CROSSHAIR_DAMAGE = 30;
const CROSSHAIR_CD = 0.88;
const MELEE_DAMAGE = 18;
const MELEE_CD = 0.28;
const MELEE_RANGE = 3.3;
const MELEE_MIN_DOT = 0.48;

const PROJ_SPEED = 54;
const PROJ_RADIUS = 0.35;
const PROJ_TTL = 2.8;

const BIN_CORE_RADIUS = 4.2;
const BIN_DPS = 11;
const UPLOAD_PER_KILL = 9;
const WAVE_INTERVAL = 13;

const GRID = 2;

export type GameOutcome = "playing" | "win" | "lose";
export type StructureKind = "firewall" | "watchtower" | "teleporter";

export interface SimStructure {
  id: number;
  kind: StructureKind;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  towerCd: number;
  telePairId?: number;
}

export interface SimEnemy {
  id: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
}

export interface SimProjectile {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  damage: number;
  ttl: number;
}

export class GameSim {
  readonly playerClass: CharacterClass;
  playerX = 12;
  playerZ = 0;
  playerY = 0.675;
  playerHp = 100;
  readonly playerMaxHp = 100;
  facingX = 0;
  facingZ = -1;
  primaryCd = 0;
  dashTimer = 0;
  dashCd = 0;
  enemies: SimEnemy[] = [];
  projectiles: SimProjectile[] = [];
  private nextId = 1;
  /** Locked enemy id for keyboard targeting; null = auto. */
  lockEnemyId: number | null = null;

  binHp = 100;
  readonly binMaxHp = 100;
  uploadProgress = 0;
  outcome: GameOutcome = "playing";
  waveTimer = 0;
  waveIndex = 0;

  structures: SimStructure[] = [];
  buildMode = false;
  placeKind: StructureKind = "firewall";
  placeGx = 6;
  placeGz = 0;
  placeYaw = 0;
  spinCd = 0;
  teleportCd = 0;

  private readonly tmp = new THREE.Vector3();

  constructor(playerClass: CharacterClass) {
    this.playerClass = playerClass;
    this.spawnInitialEnemies();
  }

  private checkOutcome(): void {
    if (this.outcome !== "playing") return;
    if (this.uploadProgress >= 100) {
      this.outcome = "win";
      return;
    }
    if (this.binHp <= 0 || this.playerHp <= 0) {
      this.outcome = "lose";
    }
  }

  private applyEnemyDamage(e: SimEnemy, amount: number): void {
    if (e.hp <= 0) return;
    e.hp -= amount;
    if (e.hp <= 0) {
      e.hp = 0;
      this.uploadProgress = Math.min(
        100,
        this.uploadProgress + UPLOAD_PER_KILL,
      );
      this.checkOutcome();
    }
  }

  toggleBuildMode(): void {
    if (this.playerClass !== "spinner") return;
    this.buildMode = !this.buildMode;
    if (this.buildMode) {
      this.placeGx = Math.round(this.playerX / GRID);
      this.placeGz = Math.round(this.playerZ / GRID);
    }
  }

  nudgePlacement(mx: number, mz: number): void {
    if (!this.buildMode) return;
    if (mx !== 0) this.placeGx += mx > 0 ? 1 : -1;
    if (mz !== 0) this.placeGz += mz > 0 ? 1 : -1;
  }

  rotatePlacement(deltaSteps: number): void {
    if (!this.buildMode) return;
    this.placeYaw += (Math.PI / 2) * deltaSteps;
  }

  cancelBuildMode(): void {
    this.buildMode = false;
  }

  confirmPlacement(): void {
    if (!this.buildMode || this.playerClass !== "spinner") return;
    const wx = this.placeGx * GRID;
    const wz = this.placeGz * GRID;
    const dPlayer = Math.hypot(wx - this.playerX, wz - this.playerZ);
    if (dPlayer > 14) return;

    if (this.placeKind === "firewall") {
      const id = this.nextId++;
      this.structures.push({
        id,
        kind: "firewall",
        x: wx,
        z: wz,
        yaw: this.placeYaw,
        hp: 38,
        maxHp: 38,
        towerCd: 0,
      });
    } else if (this.placeKind === "watchtower") {
      this.structures.push({
        id: this.nextId++,
        kind: "watchtower",
        x: wx,
        z: wz,
        yaw: 0,
        hp: 34,
        maxHp: 34,
        towerCd: 0.4,
      });
    } else {
      const a = this.nextId++;
      const b = this.nextId++;
      this.structures.push({
        id: a,
        kind: "teleporter",
        x: wx,
        z: wz,
        yaw: 0,
        hp: 22,
        maxHp: 22,
        towerCd: 0,
        telePairId: b,
      });
      this.structures.push({
        id: b,
        kind: "teleporter",
        x: wx + GRID * 2,
        z: wz,
        yaw: 0,
        hp: 22,
        maxHp: 22,
        towerCd: 0,
        telePairId: a,
      });
    }
    this.buildMode = false;
  }

  private spawnWaveCluster(): void {
    const n = 2 + Math.min(5, Math.floor(this.waveIndex / 2));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = ARENA_HALF - 4;
      this.enemies.push({
        id: this.nextId++,
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        hp: ENEMY_HP,
        maxHp: ENEMY_HP,
      });
    }
  }

  private spawnInitialEnemies(): void {
    const d = ARENA_HALF * 0.65;
    const spots: [number, number][] = [
      [d, d],
      [-d, d],
      [d, -d],
      [-d, -d],
    ];
    for (const [x, z] of spots) {
      this.enemies.push({
        id: this.nextId++,
        x,
        z,
        hp: ENEMY_HP,
        maxHp: ENEMY_HP,
      });
    }
  }

  private aliveEnemies(): SimEnemy[] {
    return this.enemies.filter((e) => e.hp > 0);
  }

  cycleLock(delta: number): void {
    const alive = this.aliveEnemies().sort((a, b) => a.id - b.id);
    if (alive.length === 0) {
      this.lockEnemyId = null;
      return;
    }
    let idx = alive.findIndex((e) => e.id === this.lockEnemyId);
    if (idx < 0) idx = 0;
    else {
      idx = (idx + delta + alive.length) % alive.length;
    }
    this.lockEnemyId = alive[idx]!.id;
  }

  resolvePrimaryTarget(
    camForwardX: number,
    camForwardZ: number,
  ): SimEnemy | null {
    const alive = this.aliveEnemies();
    if (alive.length === 0) return null;
    const locked =
      this.lockEnemyId !== null
        ? (alive.find((e) => e.id === this.lockEnemyId) ?? null)
        : null;
    if (locked) return locked;

    const fx = this.facingX || camForwardX;
    const fz = this.facingZ || camForwardZ;
    const len = Math.hypot(fx, fz) || 1;
    const cone = pickLockTarget(
      this.playerX,
      this.playerZ,
      fx / len,
      fz / len,
      alive,
      48,
      0.32,
    );
    if (cone) return this.enemies.find((e) => e.id === cone.id) ?? null;
    const near = pickNearestEnemy(this.playerX, this.playerZ, alive, 48);
    if (near) return this.enemies.find((e) => e.id === near.id) ?? null;
    return alive[0] ?? null;
  }

  step(
    dt: number,
    input: {
      mx: number;
      mz: number;
      sprint: boolean;
      dashEdge: boolean;
      primaryEdge: boolean;
    },
    camForwardX: number,
    camForwardZ: number,
    camRightX: number,
    camRightZ: number,
  ): void {
    if (this.outcome !== "playing") return;

    if (this.primaryCd > 0) this.primaryCd -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.dashTimer > 0) this.dashTimer -= dt;

    let mx = input.mx;
    let mz = input.mz;
    const move = this.tmp.set(mx, 0, mz);
    if (move.lengthSq() > 1) move.normalize();

    let speed = MOVE_SPEED;
    if (input.sprint) speed *= SPRINT_MULT;

    if (input.dashEdge && this.dashCd <= 0 && move.lengthSq() > 0.01) {
      this.dashTimer = DASH_DURATION;
      this.dashCd = DASH_COOLDOWN;
    }

    const fx = camForwardX;
    const fz = camForwardZ;
    const rx = camRightX;
    const rz = camRightZ;
    const dir = this.tmp.set(
      -fx * move.z + rx * move.x,
      0,
      -fz * move.z + rz * move.x,
    );
    if (dir.lengthSq() > 1e-6) {
      dir.normalize();
      this.facingX = dir.x;
      this.facingZ = dir.z;
    }

    if (this.dashTimer > 0) {
      this.playerX += dir.x * DASH_SPEED * dt;
      this.playerZ += dir.z * DASH_SPEED * dt;
    } else {
      this.playerX += dir.x * speed * dt;
      this.playerZ += dir.z * speed * dt;
    }

    const c = clampToArenaXZ(this.playerX, this.playerZ, 2);
    this.playerX = c.x;
    this.playerZ = c.z;

    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const dBin = Math.hypot(e.x, e.z);
      if (dBin < BIN_CORE_RADIUS) {
        const scale = 1 + this.waveIndex * 0.08;
        this.binHp -= BIN_DPS * scale * dt;
        this.checkOutcome();
        continue;
      }
      const dx = this.playerX - e.x;
      const dz = this.playerZ - e.z;
      const d = Math.hypot(dx, dz) || 1;
      e.x += (dx / d) * ENEMY_SPEED * dt;
      e.z += (dz / d) * ENEMY_SPEED * dt;
      if (d < ENEMY_RADIUS + 0.5) {
        this.playerHp -= 22 * dt;
        if (this.playerHp <= 0) {
          this.playerHp = 0;
          this.checkOutcome();
        }
      }
    }

    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.ttl -= dt;
    }
    this.projectiles = this.projectiles.filter((p) => p.ttl > 0);

    for (const p of this.projectiles) {
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        if (d < ENEMY_RADIUS + PROJ_RADIUS) {
          this.applyEnemyDamage(e, p.damage);
          p.ttl = 0;
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.ttl > 0);

    if (input.primaryEdge) {
      this.firePrimary(camForwardX, camForwardZ);
    }

    this.waveTimer += dt;
    if (
      this.waveTimer >= WAVE_INTERVAL &&
      this.aliveEnemies().length <= 2 + this.waveIndex
    ) {
      this.waveTimer = 0;
      this.waveIndex += 1;
      this.spawnWaveCluster();
    }
  }

  private firePrimary(camForwardX: number, camForwardZ: number): void {
    const t = this.resolvePrimaryTarget(camForwardX, camForwardZ);
    const fx = this.facingX || camForwardX;
    const fz = this.facingZ || camForwardZ;
    const fLen = Math.hypot(fx, fz) || 1;

    if (this.playerClass === "arrow") {
      if (this.primaryCd > 0) return;
      this.primaryCd = ARROW_CD;
      let vx: number;
      let vz: number;
      if (t) {
        const d = directionTo(this.playerX, this.playerZ, t.x, t.z, this.tmp);
        vx = d.x * PROJ_SPEED;
        vz = d.z * PROJ_SPEED;
      } else {
        vx = (fx / fLen) * PROJ_SPEED;
        vz = (fz / fLen) * PROJ_SPEED;
      }
      this.projectiles.push({
        id: this.nextId++,
        x: this.playerX + vx * 0.02,
        z: this.playerZ + vz * 0.02,
        vx,
        vz,
        damage: ARROW_DAMAGE,
        ttl: PROJ_TTL,
      });
      return;
    }

    if (this.playerClass === "crosshair") {
      if (this.primaryCd > 0) return;
      this.primaryCd = CROSSHAIR_CD;
      if (t) {
        this.applyEnemyDamage(t, CROSSHAIR_DAMAGE);
      } else {
        const near = pickNearestEnemy(
          this.playerX,
          this.playerZ,
          this.aliveEnemies(),
          55,
        );
        const ent = near
          ? (this.enemies.find((x) => x.id === near.id) ?? null)
          : null;
        if (ent) this.applyEnemyDamage(ent, CROSSHAIR_DAMAGE);
      }
      return;
    }

    if (this.playerClass === "ibeam") {
      if (this.primaryCd > 0) return;
      this.primaryCd = MELEE_CD;
      const fxi = fx / fLen;
      const fzi = fz / fLen;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        const dx = e.x - this.playerX;
        const dz = e.z - this.playerZ;
        const dist = Math.hypot(dx, dz);
        if (dist > MELEE_RANGE) continue;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        const dot = fxi * nx + fzi * nz;
        if (dot >= MELEE_MIN_DOT) {
          this.applyEnemyDamage(e, MELEE_DAMAGE);
        }
      }
    }
  }
}
