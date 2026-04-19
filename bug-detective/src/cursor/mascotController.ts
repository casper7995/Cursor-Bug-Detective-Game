import * as THREE from "three";

const MAX_SPEED = 1.65;
const ACCEL = 8.5;
const STOP_SPEED = 0.035;
const STRIDE_HZ = 2.8;
const WALK_BOB_AMP = 0.022;
const WALK_BOB_FREQ = STRIDE_HZ * Math.PI * 2;
const LANDING_MS = 220;
const IDLE_BOB_AMP = 0.014;
const IDLE_BOB_FREQ = 0.0024;

export interface MascotControllerOptions {
  readonly onLand?: () => void;
}

/**
 * Drives mascot root position from a world-space feet target (from raycast).
 */
export class MascotController {
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly feetTarget = new THREE.Vector3();
  private hasFeetTarget = false;
  private yaw = 0;
  private strideDistance = 0;
  private wasMoving = false;
  private landingT = 0;
  private landingActive = false;
  private lastIdleAt = performance.now();
  private frozen = false;
  private readonly freezePos = new THREE.Vector3();

  constructor(
    private readonly group: THREE.Group,
    private readonly opts: MascotControllerOptions,
  ) {}

  resetAt(worldPos: THREE.Vector3, worldYaw: number): void {
    this.pos.copy(worldPos);
    this.vel.set(0, 0, 0);
    this.yaw = worldYaw;
    this.strideDistance = 0;
    this.wasMoving = false;
    this.landingActive = false;
    this.landingT = 0;
    this.hasFeetTarget = false;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }

  setFrozen(f: boolean): void {
    if (this.frozen === f) return;
    if (f) {
      this.freezePos.copy(this.pos);
      this.vel.set(0, 0, 0);
    }
    this.frozen = f;
  }

  step(
    targetWorld: THREE.Vector3 | null,
    dtSec: number,
    nowMs: number,
  ): {
    readonly speed: number;
    readonly stridePhase01: number;
    readonly strideIntensity: number;
  } {
    if (targetWorld && !this.frozen) {
      this.feetTarget.copy(targetWorld);
      this.hasFeetTarget = true;
    }

    if (this.frozen) {
      this.pos.copy(this.freezePos);
      this.vel.set(0, 0, 0);
      this.group.position.copy(this.pos);
      this.group.rotation.y = this.yaw;
      return {
        speed: 0,
        stridePhase01: (this.strideDistance * STRIDE_HZ) % 1,
        strideIntensity: 0,
      };
    }

    if (!this.hasFeetTarget) {
      return {
        speed: 0,
        stridePhase01: 0,
        strideIntensity: 0,
      };
    }

    const tgt = this.feetTarget;

    if (targetWorld === null) {
      this.vel.multiplyScalar(Math.exp(-10 * dtSec));
      const speed = Math.hypot(this.vel.x, this.vel.z);
      this.pos.x += this.vel.x * dtSec;
      this.pos.z += this.vel.z * dtSec;
      const moving = speed > STOP_SPEED;
      if (moving) this.strideDistance += speed * dtSec;
      if (this.wasMoving && !moving) {
        this.landingActive = true;
        this.landingT = 0;
        this.opts.onLand?.();
      }
      this.wasMoving = moving;
      let extraY = moving
        ? Math.sin(this.strideDistance * WALK_BOB_FREQ) * WALK_BOB_AMP
        : 0;
      if (this.landingActive) {
        this.landingT += dtSec * 1000;
        const u = Math.min(1, this.landingT / LANDING_MS);
        extraY += Math.sin(u * Math.PI) * 0.038 * (1 - u);
        if (u >= 1) this.landingActive = false;
      }
      const idleMs = nowMs - this.lastIdleAt;
      if (!moving && idleMs > 600) {
        extraY +=
          Math.sin((nowMs - this.lastIdleAt) * IDLE_BOB_FREQ) * IDLE_BOB_AMP;
      }
      if (moving) this.lastIdleAt = nowMs;
      this.pos.y = tgt.y + extraY;
      this.group.position.copy(this.pos);
      if (moving) {
        const targetYaw = Math.atan2(this.vel.x, this.vel.z);
        let dy = targetYaw - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * (1 - Math.exp(-12 * dtSec));
      }
      this.group.rotation.y = this.yaw;
      return {
        speed,
        stridePhase01: (this.strideDistance * STRIDE_HZ) % 1,
        strideIntensity: moving ? Math.min(1, speed / MAX_SPEED) : 0,
      };
    }

    const dx = tgt.x - this.pos.x;
    const dz = tgt.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const dirX = dist > 1e-6 ? dx / dist : 0;
    const dirZ = dist > 1e-6 ? dz / dist : 0;

    const desiredVx = dirX * Math.min(MAX_SPEED, dist * 4);
    const desiredVz = dirZ * Math.min(MAX_SPEED, dist * 4);

    const ax = (desiredVx - this.vel.x) * ACCEL * dtSec;
    const az = (desiredVz - this.vel.z) * ACCEL * dtSec;
    this.vel.x += ax;
    this.vel.z += az;
    this.vel.multiplyScalar(Math.exp(-2.5 * dtSec));

    const speed = Math.hypot(this.vel.x, this.vel.z);
    const moving = speed > STOP_SPEED;

    if (moving) {
      this.strideDistance += speed * dtSec;
      this.lastIdleAt = nowMs;
    }

    if (moving) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      let dy = targetYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * (1 - Math.exp(-12 * dtSec));
    }

    if (this.wasMoving && !moving) {
      this.landingActive = true;
      this.landingT = 0;
      this.opts.onLand?.();
    }
    this.wasMoving = moving;

    this.pos.x += this.vel.x * dtSec;
    this.pos.z += this.vel.z * dtSec;

    let extraY = 0;
    if (moving) {
      extraY += Math.sin(this.strideDistance * WALK_BOB_FREQ) * WALK_BOB_AMP;
    }

    if (this.landingActive) {
      this.landingT += dtSec * 1000;
      const u = Math.min(1, this.landingT / LANDING_MS);
      extraY += Math.sin(u * Math.PI) * 0.038 * (1 - u);
      if (u >= 1) this.landingActive = false;
    }

    const idleMs = nowMs - this.lastIdleAt;
    if (!moving && idleMs > 600) {
      extraY +=
        Math.sin((nowMs - this.lastIdleAt) * IDLE_BOB_FREQ) * IDLE_BOB_AMP;
    }

    this.pos.y = tgt.y + extraY;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;

    return {
      speed,
      stridePhase01: (this.strideDistance * STRIDE_HZ) % 1,
      strideIntensity: moving ? Math.min(1, speed / MAX_SPEED) : 0,
    };
  }
}
