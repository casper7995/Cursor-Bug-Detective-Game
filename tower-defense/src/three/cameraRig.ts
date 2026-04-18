import * as THREE from "three";

/** Third-person orbit camera: Q/E yaw around target, smooth follow. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  orbitYaw = 0;
  readonly distance = 10;
  readonly height = 5;
  lookHeight = 1.2;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 500);
    this.camera.position.set(0, this.height, this.distance);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(target: THREE.Vector3, dt: number): void {
    const cos = Math.cos(this.orbitYaw);
    const sin = Math.sin(this.orbitYaw);
    const ox = sin * this.distance;
    const oz = cos * this.distance;
    const desired = new THREE.Vector3(
      target.x + ox,
      target.y + this.height,
      target.z + oz,
    );
    this.camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
    this.camera.lookAt(target.x, target.y + this.lookHeight, target.z);
  }

  orbit(deltaRadians: number): void {
    this.orbitYaw += deltaRadians;
  }

  getForwardOnXZ(): THREE.Vector3 {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    else dir.normalize();
    return dir;
  }

  getRightOnXZ(): THREE.Vector3 {
    const f = this.getForwardOnXZ();
    return new THREE.Vector3(-f.z, 0, f.x);
  }
}
