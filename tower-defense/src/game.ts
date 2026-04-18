import "./style.css";
import * as THREE from "three";
import { createSceneBundle } from "./three/createScene";
import { CameraRig } from "./three/cameraRig";
import { createArena } from "./world/arena";
import { InputManager } from "./input/inputManager";
import { Action } from "./input/actions";
import { parseCharacterClass } from "./classes/characterClass";
import { GameSim } from "./sim/gameSim";

const container = document.getElementById("app");
if (!(container instanceof HTMLElement)) throw new Error("#app missing");
const root = container;

const { scene, renderer } = createSceneBundle(root);
const cameraRig = new CameraRig(
  root.clientWidth / Math.max(root.clientHeight, 1),
);
createArena(scene);

const binGeo = new THREE.CylinderGeometry(2.6, 2.8, 1.2, 24);
const binMat = new THREE.MeshStandardMaterial({
  color: 0x22c55e,
  roughness: 0.45,
  metalness: 0.15,
});
const binMesh = new THREE.Mesh(binGeo, binMat);
binMesh.position.set(0, 0.6, 0);
binMesh.castShadow = true;
binMesh.receiveShadow = true;
scene.add(binMesh);

const playerClass = parseCharacterClass(window.location.search);
const sim = new GameSim(playerClass);
const input = new InputManager();
input.attach(window);

const playerGeo = new THREE.BoxGeometry(0.85, 1.35, 0.85);
const playerMat = new THREE.MeshStandardMaterial({
  color:
    playerClass === "crosshair"
      ? 0xf472b6
      : playerClass === "ibeam"
        ? 0xe2e8f0
        : 0x38bdf8,
  roughness: 0.35,
  metalness: 0.2,
});
const playerMesh = new THREE.Mesh(playerGeo, playerMat);
playerMesh.castShadow = true;
scene.add(playerMesh);

const enemyMeshes: THREE.Mesh[] = [];
const enemyGeo = new THREE.BoxGeometry(1.1, 1.4, 1.1);
const enemyMat = new THREE.MeshStandardMaterial({
  color: 0xef4444,
  roughness: 0.5,
  metalness: 0.1,
});

function ensureEnemyMeshes(n: number): void {
  while (enemyMeshes.length < n) {
    const m = new THREE.Mesh(enemyGeo, enemyMat);
    m.castShadow = true;
    scene.add(m);
    enemyMeshes.push(m);
  }
}
ensureEnemyMeshes(sim.enemies.length);

const projMeshes: THREE.Mesh[] = [];
const projGeo = new THREE.SphereGeometry(0.22, 10, 10);
const projMat = new THREE.MeshStandardMaterial({
  color: 0xfef08a,
  emissive: 0x713f12,
  emissiveIntensity: 0.35,
});

function syncProjectiles(): void {
  while (projMeshes.length < sim.projectiles.length) {
    const m = new THREE.Mesh(projGeo, projMat);
    m.castShadow = true;
    scene.add(m);
    projMeshes.push(m);
  }
  for (let i = 0; i < projMeshes.length; i++) {
    const vis = i < sim.projectiles.length;
    projMeshes[i]!.visible = vis;
    if (vis) {
      const p = sim.projectiles[i]!;
      projMeshes[i]!.position.set(p.x, 0.75, p.z);
    }
  }
}

const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText =
  "position:fixed;left:12px;top:12px;color:#e2e8f0;font:14px monospace;pointer-events:none;text-shadow:0 1px 2px #000;";
document.body.appendChild(hud);

const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.style.cssText =
  "position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);color:#f8fafc;font:28px monospace;pointer-events:none;text-align:center;padding:24px;";
document.body.appendChild(overlay);

function onResize(): void {
  const w = root.clientWidth;
  const h = Math.max(root.clientHeight, 1);
  cameraRig.setAspect(w / h);
  renderer.setSize(w, h);
}
window.addEventListener("resize", onResize);
onResize();

let last = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (input.isDown(Action.CameraOrbitLeft)) {
    cameraRig.orbit(LocalPlayerOrbitSpeed * dt);
  }
  if (input.isDown(Action.CameraOrbitRight)) {
    cameraRig.orbit(-LocalPlayerOrbitSpeed * dt);
  }

  if (input.consumePress(Action.CycleTargetLeft)) sim.cycleLock(-1);
  if (input.consumePress(Action.CycleTargetRight)) sim.cycleLock(1);

  let mx = 0;
  let mz = 0;
  if (input.isDown(Action.MoveForward)) mz -= 1;
  if (input.isDown(Action.MoveBack)) mz += 1;
  if (input.isDown(Action.MoveLeft)) mx -= 1;
  if (input.isDown(Action.MoveRight)) mx += 1;

  const forward = cameraRig.getForwardOnXZ();
  const right = cameraRig.getRightOnXZ();

  sim.step(
    dt,
    {
      mx,
      mz,
      sprint: input.isDown(Action.Sprint),
      dashEdge: input.consumePress(Action.Dash),
      primaryEdge: input.consumePress(Action.PrimaryAttack),
    },
    forward.x,
    forward.z,
    right.x,
    right.z,
  );

  playerMesh.position.set(sim.playerX, sim.playerY, sim.playerZ);
  cameraRig.update(playerMesh.position, dt);

  ensureEnemyMeshes(sim.enemies.length);
  for (let i = 0; i < sim.enemies.length; i++) {
    const e = sim.enemies[i]!;
    const m = enemyMeshes[i]!;
    if (e.hp <= 0) {
      m.visible = false;
      continue;
    }
    m.visible = true;
    m.position.set(e.x, 0.7, e.z);
  }

  syncProjectiles();

  const alive = sim.enemies.filter((e) => e.hp > 0).length;
  hud.textContent = `Cursor Crew — Defrag Run\nclass ${sim.playerClass} | HP ${Math.max(0, Math.ceil(sim.playerHp))}/${sim.playerMaxHp}\nRecycle Bin ${Math.max(0, Math.ceil(sim.binHp))}/${sim.binMaxHp} | Upload ${Math.min(100, Math.floor(sim.uploadProgress))}%\nenemies ${alive} | wave ${sim.waveIndex} | lock ${sim.lockEnemyId ?? "auto"}\nWASD | [ ] orbit | Q/E lock | J attack | Space dash`;

  if (sim.outcome === "win") {
    overlay.style.display = "flex";
    overlay.textContent = "UPLOAD COMPLETE — YOU WIN\n(refresh to restart)";
  } else if (sim.outcome === "lose") {
    overlay.style.display = "flex";
    overlay.textContent = "SYSTEM CORRUPTED — YOU LOSE\n(refresh to restart)";
  } else {
    overlay.style.display = "none";
  }

  renderer.render(scene, cameraRig.camera);
  input.endFrame();
  requestAnimationFrame(frame);
}

const LocalPlayerOrbitSpeed = 1.8;
requestAnimationFrame(frame);
