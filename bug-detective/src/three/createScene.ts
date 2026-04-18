import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface SceneBundle {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
}

/**
 * Detective room scene: warm key + cool ambient + procedural env-map for the
 * mascot's transmissive glass shell. Background and fog match the dark
 * "after-hours" vibe of the diorama.
 */
export class WebGLUnsupportedError extends Error {
  constructor() {
    super("WebGL is not available in this browser.");
    this.name = "WebGLUnsupportedError";
  }
}

export function createSceneBundle(container: HTMLElement): SceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14141c);
  scene.fog = new THREE.Fog(0x14141c, 28, 90);

  // Wrap renderer construction so we can show a friendly fallback on
  // browsers without WebGL (very old Safari, locked-down enterprise).
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    throw new WebGLUnsupportedError();
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  // Procedural environment map → critical for transmission to read as glass.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // Cool ambient fill (city glow through a window).
  const ambient = new THREE.AmbientLight(0x394867, 0.45);
  scene.add(ambient);

  // Warm key from upper-left (off-camera lamp / hallway light).
  const key = new THREE.DirectionalLight(0xffe4b5, 0.55);
  key.position.set(-6, 9, 4);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  key.shadow.bias = -0.0005;
  scene.add(key);

  return { scene, renderer };
}
