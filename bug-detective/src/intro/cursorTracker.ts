import * as THREE from "three";

/**
 * Raycasts pointer into a `target` mesh and exposes the hit as a feet
 * world position. Does not move the mascot — use `MascotController` for that.
 */
export class CursorTracker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly feetWorld = new THREE.Vector3();
  private readonly intersects: THREE.Intersection[] = [];
  private hasMoved = false;
  private hasHit = false;
  private domTarget: HTMLElement | null = null;
  private yOffset = 0.05;
  private rectLeft = 0;
  private rectTop = 0;
  private rectWidth = 1;
  private rectHeight = 1;

  constructor(
    private readonly camera: THREE.Camera,
    private target: THREE.Object3D,
  ) {}

  attach(domTarget: HTMLElement): void {
    this.detach();
    this.domTarget = domTarget;
    this.refreshRect();
    domTarget.addEventListener("mousemove", this.onMouseMove);
    domTarget.addEventListener("pointermove", this.onPointerMove, {
      passive: true,
    });
    domTarget.addEventListener("pointerdown", this.onPointerDown, {
      passive: true,
    });
    domTarget.addEventListener("touchmove", this.onTouchMove, {
      passive: true,
    });
    window.addEventListener("resize", this.refreshRect);
  }

  detach(): void {
    if (!this.domTarget) return;
    this.domTarget.removeEventListener("mousemove", this.onMouseMove);
    this.domTarget.removeEventListener("pointermove", this.onPointerMove);
    this.domTarget.removeEventListener("pointerdown", this.onPointerDown);
    this.domTarget.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("resize", this.refreshRect);
    this.domTarget = null;
  }

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

  hasUserMoved(): boolean {
    return this.hasMoved;
  }

  setMouse(canvasX: number, canvasY: number): void {
    if (!this.domTarget) {
      this.ndc.x = canvasX;
      this.ndc.y = canvasY;
      this.hasMoved = true;
      return;
    }
    this.ndc.x = (canvasX / this.rectWidth) * 2 - 1;
    this.ndc.y = -(canvasY / this.rectHeight) * 2 + 1;
    this.hasMoved = true;
  }

  /**
   * Raycast and write feet world position. Returns whether the ray hit the target.
   */
  updateFeetTarget(): boolean {
    this.hasHit = false;
    if (!this.hasMoved) return false;
    this.raycaster.setFromCamera(
      this.ndc,
      this.camera as THREE.PerspectiveCamera,
    );
    this.intersects.length = 0;
    this.raycaster.intersectObject(this.target, false, this.intersects);
    if (this.intersects.length === 0) return false;
    const first = this.intersects[0];
    if (!first) return false;
    this.feetWorld.copy(first.point);
    this.feetWorld.y += this.yOffset;
    this.hasHit = true;
    return true;
  }

  copyFeetWorldTo(out: THREE.Vector3): void {
    out.copy(this.feetWorld);
  }

  get hasFeetHit(): boolean {
    return this.hasHit;
  }

  private readonly onMouseMove = (e: MouseEvent): void => {
    this.updateNdcFromClient(e.clientX, e.clientY);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    this.updateNdcFromClient(e.clientX, e.clientY);
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
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
