import "./style.css";
import * as THREE from "three";
import { createSceneBundle } from "./three/createScene";
import { CameraRig } from "./three/cameraRig";
import { createMascotMesh } from "./cursor/mascotMesh";

const container = document.getElementById("app");
if (!(container instanceof HTMLElement)) throw new Error("#app missing");
const root = container;

const { scene, renderer } = createSceneBundle(root);

const cameraRig = new CameraRig(
  root.clientWidth / Math.max(root.clientHeight, 1),
);
// Day 1: cinematic 3/4 framing of the mascot at origin.
cameraRig.setStatic(
  new THREE.Vector3(2.4, 1.6, 3.2),
  new THREE.Vector3(0, 0.2, 0),
);

// Floor placeholder so the mascot has a surface and can cast a shadow.
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(6, 48),
  new THREE.MeshStandardMaterial({
    color: 0x1f2230,
    roughness: 0.85,
    metalness: 0.0,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.92;
floor.receiveShadow = true;
scene.add(floor);

const mascot = createMascotMesh();
mascot.group.position.set(0, 0, 0);
scene.add(mascot.group);

function onResize(): void {
  const w = root.clientWidth;
  const h = Math.max(root.clientHeight, 1);
  cameraRig.setAspect(w / h);
  renderer.setSize(w, h);
}
window.addEventListener("resize", onResize);
onResize();

const startTime = performance.now();
let lastFrame = startTime;

function frame(now: number): void {
  const dtMs = Math.min(50, now - lastFrame);
  lastFrame = now;
  const elapsed = (now - startTime) / 1000;

  cameraRig.update(dtMs);

  // Day 1 demo motion: gentle bob + slow rotation showing off the glass.
  mascot.group.position.y = Math.sin(elapsed * 1.4) * 0.04;
  mascot.group.rotation.y = Math.sin(elapsed * 0.6) * 0.5;
  mascot.faceCamera(cameraRig.camera);

  // Periodic blink for personality.
  const blinkPhase = (elapsed % 4.2) / 4.2;
  mascot.setBlink(blinkPhase > 0.95 ? 0 : 1);

  // Lift the magnifier with a long sine to show the lift animation works.
  mascot.setMagnifierLifted((Math.sin(elapsed * 0.35) + 1) / 2);

  renderer.render(scene, cameraRig.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
