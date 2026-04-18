import * as THREE from "three";

export interface LockCandidate {
  id: number;
  x: number;
  z: number;
  hp: number;
}

const _to = new THREE.Vector3();

/**
 * Pick best enemy in a forward cone. `forward` is normalized on XZ.
 */
export function pickLockTarget(
  px: number,
  pz: number,
  forwardX: number,
  forwardZ: number,
  candidates: LockCandidate[],
  maxDist: number,
  minDot = 0.35,
): LockCandidate | null {
  let best: LockCandidate | null = null;
  let bestScore = -Infinity;
  const fx = forwardX;
  const fz = forwardZ;
  for (const c of candidates) {
    if (c.hp <= 0) continue;
    const dx = c.x - px;
    const dz = c.z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist > maxDist || dist < 1e-4) continue;
    const nx = dx / dist;
    const nz = dz / dist;
    const dot = fx * nx + fz * nz;
    if (dot < minDot) continue;
    const score = dot / (dist + 0.5);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Nearest living enemy (full circle). */
export function pickNearestEnemy(
  px: number,
  pz: number,
  candidates: LockCandidate[],
  maxDist: number,
): LockCandidate | null {
  let best: LockCandidate | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    if (c.hp <= 0) continue;
    const d = Math.hypot(c.x - px, c.z - pz);
    if (d < bestD && d <= maxDist) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function directionTo(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  _to.set(toX - fromX, 0, toZ - fromZ);
  const len = _to.length();
  if (len < 1e-6) return out.set(0, 0, -1);
  return out.copy(_to).multiplyScalar(1 / len);
}
