import "./style.css";
import * as THREE from "three";
import { createSceneBundle } from "./three/createScene";
import { CameraRig } from "./three/cameraRig";
import { createMascotMesh } from "./cursor/mascotMesh";
import { createDesktopDiorama } from "./scene/desktopDiorama";
import { CursorTracker } from "./intro/cursorTracker";

const container = document.getElementById("app");
if (!(container instanceof HTMLElement)) throw new Error("#app missing");
const root = container;

const { scene, renderer } = createSceneBundle(root);

const cameraRig = new CameraRig(
  root.clientWidth / Math.max(root.clientHeight, 1),
);
// Static 3/4 framing of the desk. Camera sits at human seated height and
// looks down at the desk surface — the back wall fills the upper third and
// the desk + mascot anchor the bottom two-thirds.
cameraRig.setStatic(
  new THREE.Vector3(3.2, 2.4, 5.2),
  new THREE.Vector3(-0.2, 0.3, -0.4),
);

const diorama = createDesktopDiorama();
scene.add(diorama.root);

const mascot = createMascotMesh();
// Mascot is about 1.4u tall in local space; scale down so it reads as a
// tabletop figurine relative to the keyboard/monitor.
mascot.group.scale.setScalar(0.55);
// Place initial position centered on the desk so it's visible even before
// the player moves the mouse.
mascot.group.position.set(0.4, diorama.deskTopY + 0.18, 0.4);
scene.add(mascot.group);

// Cursor follows mouse projected onto the desk surface.
const cursorTracker = new CursorTracker(
  cameraRig.camera,
  mascot.group,
  diorama.desk,
);
// Mascot's local-space feet sit at y ≈ -0.32 (legs centered at -0.22, radius
// 0.14). After scale 0.55, lift = 0.32 * 0.55 ≈ 0.18 to plant the feet on the
// desk surface.
cursorTracker.setYOffset(0.18);
cursorTracker.attach(renderer.domElement);

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
  const dtSec = dtMs / 1000;
  lastFrame = now;
  const elapsed = (now - startTime) / 1000;

  cameraRig.update(dtMs);
  diorama.step(elapsed, dtSec);

  cursorTracker.update(dtSec);
  mascot.faceCamera(cameraRig.camera);

  // Periodic blink for personality.
  const blinkPhase = (elapsed % 4.2) / 4.2;
  mascot.setBlink(blinkPhase > 0.95 ? 0 : 1);

  renderer.render(scene, cameraRig.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
