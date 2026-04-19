import type * as THREE from "three";

export interface MonitorSurfaceSwap {
  readonly restore: () => void;
}

/** Temporarily show runner output on the monitor screen mesh. */
export function swapMonitorScreenMap(
  monitorScreen: THREE.Mesh,
  runnerMap: THREE.Texture,
): MonitorSurfaceSwap {
  const raw = monitorScreen.material;
  const mat = Array.isArray(raw) ? raw[0] : raw;
  if (!mat || !("map" in mat)) {
    throw new Error("monitor screen material missing map");
  }
  const basic = mat as THREE.MeshBasicMaterial;
  if (!basic.map) throw new Error("monitor screen map missing");
  const prev = basic.map;
  basic.map = runnerMap;
  basic.needsUpdate = true;
  runnerMap.needsUpdate = true;

  return {
    restore: () => {
      basic.map = prev;
      basic.needsUpdate = true;
    },
  };
}
