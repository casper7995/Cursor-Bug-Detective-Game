import * as THREE from "three";

export const ARENA_HALF = 36;

export function createArena(scene: THREE.Scene): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.9,
    metalness: 0.05,
  });
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(ARENA_HALF * 2, 24, 0x334155, 0x1e293b);
  grid.position.y = 0.01;
  scene.add(grid);

  return ground;
}

export function clampToArenaXZ(
  x: number,
  z: number,
  margin = 1.5,
): { x: number; z: number } {
  const h = ARENA_HALF - margin;
  return {
    x: Math.max(-h, Math.min(h, x)),
    z: Math.max(-h, Math.min(h, z)),
  };
}
