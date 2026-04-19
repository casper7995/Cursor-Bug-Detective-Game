import * as THREE from "three";

interface DollyTween {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromLookAt: THREE.Vector3;
  toLookAt: THREE.Vector3;
  durationMs: number;
  elapsedMs: number;
  resolve: () => void;
}

/**
 * Camera rig with two modes:
 *  - static: position + lookAt are pinned (used during investigation).
 *  - scripted dolly: tween between two (position, lookAt) keyframes (used in
 *    the wow opener camera reveal).
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly currentLookAt = new THREE.Vector3(0, 1, 0);
  private dolly: DollyTween | null = null;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
    this.camera.position.set(4, 5, 6);
    this.camera.lookAt(this.currentLookAt);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Snap to a static (position, lookAt) pose. Cancels any in-flight dolly. */
  setStatic(position: THREE.Vector3Like, lookAt: THREE.Vector3Like): void {
    this.dolly = null;
    this.camera.position.set(position.x, position.y, position.z);
    this.currentLookAt.set(lookAt.x, lookAt.y, lookAt.z);
    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * Tween to a new (position, lookAt) pose over `durationMs`. Returns a promise
   * that resolves when the tween finishes (or is interrupted).
   */
  scriptedTo(
    targetPos: THREE.Vector3Like,
    targetLookAt: THREE.Vector3Like,
    durationMs: number,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      // Resolve any previous tween immediately so callers don't deadlock.
      if (this.dolly) this.dolly.resolve();
      this.dolly = {
        fromPos: this.camera.position.clone(),
        toPos: new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z),
        fromLookAt: this.currentLookAt.clone(),
        toLookAt: new THREE.Vector3(
          targetLookAt.x,
          targetLookAt.y,
          targetLookAt.z,
        ),
        durationMs: Math.max(1, durationMs),
        elapsedMs: 0,
        resolve,
      };
    });
  }

  /** Advance any in-flight dolly tween. Call once per frame from the loop. */
  update(dtMs: number): void {
    if (!this.dolly) return;
    this.dolly.elapsedMs += dtMs;
    const t01 = Math.min(1, this.dolly.elapsedMs / this.dolly.durationMs);
    const eased = easeInOutCubic(t01);
    this.camera.position.lerpVectors(
      this.dolly.fromPos,
      this.dolly.toPos,
      eased,
    );
    this.currentLookAt.lerpVectors(
      this.dolly.fromLookAt,
      this.dolly.toLookAt,
      eased,
    );
    this.camera.lookAt(this.currentLookAt);
    if (t01 >= 1) {
      const finished = this.dolly;
      this.dolly = null;
      finished.resolve();
    }
  }

  isDollying(): boolean {
    return this.dolly !== null;
  }

  /** Copy the camera's current look-at target (static or mid-dolly). */
  copyLookAtInto(out: THREE.Vector3): void {
    out.copy(this.currentLookAt);
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
