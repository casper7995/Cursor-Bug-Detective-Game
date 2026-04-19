import * as THREE from "three";

/** Horizontal footprint of a desk prop (world XZ, Y ignored). */
export interface DeskFootCircle {
  readonly x: number;
  readonly z: number;
  /** Radius of the solid footprint (meters). */
  readonly r: number;
}

/**
 * Push a feet position out of circular obstacles so the mascot does not walk
 * through tall props (ray hits the desk *under* the mug, but the body should
 * stay outside the prop silhouette).
 */
export function resolveFeetAgainstDeskObstacles(
  feet: THREE.Vector3,
  obstacles: readonly DeskFootCircle[],
  opts?: {
    /** Extra clearance beyond each obstacle radius (mascot body half-width). */
    readonly agentRadius?: number;
    /** Multiple passes fix overlaps between adjacent circles. */
    readonly iterations?: number;
  },
): void {
  const agentR = opts?.agentRadius ?? 0.14;
  const iterations = opts?.iterations ?? 6;
  for (let pass = 0; pass < iterations; pass++) {
    for (const c of obstacles) {
      const dx = feet.x - c.x;
      const dz = feet.z - c.z;
      const dist = Math.hypot(dx, dz);
      const need = c.r + agentR;
      if (dist >= need) continue;
      if (dist < 1e-7) {
        feet.x = c.x + need;
        feet.z = c.z;
        continue;
      }
      const s = need / dist;
      feet.x = c.x + dx * s;
      feet.z = c.z + dz * s;
    }
  }
}

/** Keep feet on the walkable desk top (inset from edges). */
export function clampFeetToDeskBounds(
  feet: THREE.Vector3,
  halfWidth: number,
  halfDepth: number,
  margin: number,
): void {
  feet.x = Math.max(-halfWidth + margin, Math.min(halfWidth - margin, feet.x));
  feet.z = Math.max(-halfDepth + margin, Math.min(halfDepth - margin, feet.z));
}
