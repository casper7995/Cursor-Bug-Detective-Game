import * as THREE from "three";

/**
 * Lerps a `mascot` Object3D to follow the mouse pointer projected onto a
 * `target` mesh via raycasting. Used both during the intro (target = page
 * plane) and during gameplay (target = desk surface).
 */
export class CursorTracker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly desired = new THREE.Vector3();
  private readonly intersects: THREE.Intersection[] = [];
  private hasMoved = false;
  private domTarget: HTMLElement | null = null;
  private yOffset = 0.05;
  private smoothingHz = 12;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly mascot: THREE.Object3D,
    private target: THREE.Object3D,
  ) {}

  attach(domTarget: HTMLElement): void {
    this.detach();
    this.domTarget = domTarget;
    domTarget.addEventListener("mousemove", this.onMouseMove);
    domTarget.addEventListener("touchmove", this.onTouchMove, { passive: true });
  }

  detach(): void {
    if (!this.domTarget) return;
    this.domTarget.removeEventListener("mousemove", this.onMouseMove);
    this.domTarget.removeEventListener("touchmove", this.onTouchMove);
    this.domTarget = null;
  }

  setTarget(target: THREE.Object3D): void {
    this.target = target;
  }

  setYOffset(y: number): void {
    this.yOffset = y;
  }

  setSmoothing(hz: number): void {
    this.smoothingHz = Math.max(0.1, hz);
  }

  /** Where the mascot is currently aiming. Useful for choreographed handoff. */
  getDesired(out?: THREE.Vector3): THREE.Vector3 {
    return (out ?? new THREE.Vector3()).copy(this.desired);
  }

  hasUserMoved(): boolean {
    return this.hasMoved;
  }

  /** Advance mascot toward latest raycast hit. */
  update(dt: number): void {
    if (!this.hasMoved) return;
    this.raycaster.setFromCamera(this.ndc, this.camera as THREE.PerspectiveCamera);
    this.intersects.length = 0;
    this.raycaster.intersectObject(this.target, false, this.intersects);
    if (this.intersects.length === 0) return;
    const first = this.intersects[0];
    if (!first) return;
    this.desired.copy(first.point);
    this.desired.y += this.yOffset;
    const alpha = 1 - Math.exp(-this.smoothingHz * dt);
    this.mascot.position.lerp(this.desired, alpha);
  }

  private readonly onMouseMove = (e: MouseEvent): void => {
    this.updateNdcFromClient(e.clientX, e.clientY);
  };

  private readonly onTouchMove = (e: TouchEvent): void => {
    const t = e.touches[0];
    if (!t) return;
    this.updateNdcFromClient(t.clientX, t.clientY);
  };

  private updateNdcFromClient(clientX: number, clientY: number): void {
    const target = this.domTarget;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.hasMoved = true;
  }
}
