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
  // Cached rect — recomputed on attach + window resize. mousemove fires
  // up to 1 kHz on high-poll-rate mice, and getBoundingClientRect()
  // forces a synchronous layout flush. Caching saves a flush per move.
  private rectLeft = 0;
  private rectTop = 0;
  private rectWidth = 1;
  private rectHeight = 1;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly mascot: THREE.Object3D,
    private target: THREE.Object3D,
  ) {}

  attach(domTarget: HTMLElement): void {
    this.detach();
    this.domTarget = domTarget;
    this.refreshRect();
    domTarget.addEventListener("mousemove", this.onMouseMove);
    domTarget.addEventListener("touchmove", this.onTouchMove, { passive: true });
    window.addEventListener("resize", this.refreshRect);
  }

  detach(): void {
    if (!this.domTarget) return;
    this.domTarget.removeEventListener("mousemove", this.onMouseMove);
    this.domTarget.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("resize", this.refreshRect);
    this.domTarget = null;
  }

  /** Re-measure the canvas rect. Wired to attach + window resize. */
  private readonly refreshRect = (): void => {
    if (!this.domTarget) return;
    const rect = this.domTarget.getBoundingClientRect();
    this.rectLeft = rect.left;
    this.rectTop = rect.top;
    this.rectWidth = Math.max(1, rect.width);
    this.rectHeight = Math.max(1, rect.height);
  };

  setTarget(target: THREE.Object3D): void {
    this.target = target;
  }

  setYOffset(y: number): void {
    this.yOffset = y;
  }

  setSmoothing(hz: number): void {
    this.smoothingHz = Math.max(0.1, hz);
  }

  hasUserMoved(): boolean {
    return this.hasMoved;
  }

  /**
   * Programmatically inject a "mouse" position in canvas-local pixels.
   * Used by the simplified touch flow (mobile) to translate a tap into
   * the same NDC update path mousemove takes.
   *
   * Pass coordinates outside the canvas (e.g. -9999, -9999) to put the
   * cursor "off-screen" so the next raycast misses everything.
   */
  setMouse(canvasX: number, canvasY: number): void {
    if (!this.domTarget) {
      // No DOM target attached → fake one off the renderer canvas size.
      this.ndc.x = canvasX;
      this.ndc.y = canvasY;
      this.hasMoved = true;
      return;
    }
    this.ndc.x = (canvasX / this.rectWidth) * 2 - 1;
    this.ndc.y = -(canvasY / this.rectHeight) * 2 + 1;
    this.hasMoved = true;
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
    if (!this.domTarget) return;
    this.ndc.x = ((clientX - this.rectLeft) / this.rectWidth) * 2 - 1;
    this.ndc.y = -((clientY - this.rectTop) / this.rectHeight) * 2 + 1;
    this.hasMoved = true;
  }
}
