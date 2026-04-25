import * as THREE from "three";
import type { DeskFootCircle } from "../cursor/deskFootResolve";
import { makeFakePageTexture } from "../intro/pagePeel";

/**
 * One hand-crafted desktop diorama. All interactive props carry a string
 * `userData.tag` so the anomaly system can find them by name. Each prop is
 * also exposed via the returned `DioramaObjects` for direct anomaly mutation.
 */
export interface DioramaObjects {
  readonly root: THREE.Group;
  readonly desk: THREE.Mesh;
  readonly hoverables: readonly THREE.Object3D[]; // raycaster targets
  readonly deskTopY: number; // Y of the desk surface
  readonly monitor: THREE.Group;
  readonly monitorScreen: THREE.Mesh;
  readonly monitorReflection: THREE.Mesh;
  readonly mug: THREE.Group;
  readonly mugLabel: THREE.Mesh;
  readonly calendar: THREE.Mesh;
  /** Case envelope face mesh (anomaly `replaceMap` target). Parented under envelopeRoot. */
  readonly evidenceEnvelope: THREE.Mesh;
  /** Envelope assembly (flap + body) for desk zoom / animation. */
  readonly evidenceEnvelopeRoot: THREE.Group;
  /** Desk reagent tray (mix mini-game anchor). */
  readonly reagentTray: THREE.Group;
  /** Spinner in center well; `flags.clockReverse` reverses swirl. */
  readonly reagentSpinner: THREE.Mesh;
  readonly lamp: THREE.Group;
  /** Card in lamp cone — visible when `flags.lampActive`. */
  readonly lampCard: THREE.Mesh;
  /** Upright “case file” card near the lamp (visual anchor for shadows). */
  readonly lampShadowStandee: THREE.Mesh;
  /** Large faux shadow on the desk — primary hover target for `lamp-shadow`. */
  readonly lampShadowProp: THREE.Mesh;
  /** Lying case jacket — same art as intro peel; re-readable via click. */
  readonly caseFileSheet: THREE.Mesh;
  readonly coffeeSteam: THREE.Mesh;
  readonly keyboard: THREE.Group;
  readonly plant: THREE.Group;
  readonly backWall: THREE.Mesh;
  /** Step every prop's per-frame animation (clock hands, steam, etc). */
  step(elapsed: number, dt: number): void;
  /** Mutable flags toggled by anomalies + desk mini-games. */
  readonly flags: DioramaFlags;
  /** Gold rim pulse on the prop matching `tag` (e.g. evidence-envelope). */
  setDeskHighlight(tag: string | null): void;
  /**
   * World-space circles on the desk plane: mascot feet are pushed out so the
   * figurine does not walk through tall props (cursor ray hits the desk first).
   */
  readonly mascotFootObstacles: readonly DeskFootCircle[];
}

export interface DioramaFlags {
  /** When true, reagent tray swirl runs backward (legacy name: clock CCW). */
  clockReverse: boolean;
  steamDownward: boolean;
  /** Envelope cipher mini: flap opens toward 1. */
  envelopeOpen: boolean;
  /** Reagent mix mini: wells + bottle read as “active”. */
  reagentActive: boolean;
  /** Lamp spectrum mini: head tilts, card visible. */
  lampActive: boolean;
}

const WOOD = 0x6b4a2b;
const WOOD_DARK = 0x4a3320;
const PLASTIC = 0x1a1d24;
const STICKY = 0xfff48a;

/** Dark evidence-flag silhouette for the lamp-shadow standee (reads in bright cone). */
function makeFlagSilhouetteTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d");
  ctx.clearRect(0, 0, 256, 256);
  const poleW = 14;
  const poleX = 72;
  const poleTop = 48;
  const poleBot = 208;
  ctx.fillStyle = "#1d2330";
  ctx.strokeStyle = "#b88a3e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(poleX, poleTop, poleW, poleBot - poleTop, 3);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(poleX + poleW, poleTop + 28);
  ctx.lineTo(200, poleTop + 52);
  ctx.lineTo(200, poleTop + 128);
  ctx.lineTo(poleX + poleW, poleTop + 152);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Elongated cast-shadow on desk — same flag motif, stretched and feathered. */
function makeFlagShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d");
  ctx.clearRect(0, 0, 256, 128);
  const g = ctx.createLinearGradient(0, 64, 256, 64);
  g.addColorStop(0, "rgba(8,8,12,0.92)");
  g.addColorStop(0.35, "rgba(10,10,16,0.72)");
  g.addColorStop(0.75, "rgba(12,12,18,0.35)");
  g.addColorStop(1, "rgba(12,12,18,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(48, 64, 28, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(8,8,12,0.78)";
  ctx.beginPath();
  ctx.moveTo(70, 58);
  ctx.lineTo(230, 42);
  ctx.lineTo(238, 86);
  ctx.lineTo(78, 82);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createDesktopDiorama(): DioramaObjects {
  const root = new THREE.Group();
  root.name = "diorama";

  const flags: DioramaFlags = {
    clockReverse: false,
    steamDownward: false,
    envelopeOpen: false,
    reagentActive: false,
    lampActive: false,
  };

  const hoverables: THREE.Object3D[] = [];
  let deskHighlightTag: string | null = null;
  let envelopeOpenLerp = 0;
  let reagentActiveLerp = 0;
  let lampActiveLerp = 0;
  const GOLD_HEX = 0xc08532;

  // ---- Floor (subtle, just to ground the room) ----------------------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({
      color: 0x0c0e14,
      roughness: 0.9,
      metalness: 0.0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.2;
  floor.receiveShadow = true;
  root.add(floor);

  // ---- Back wall (also serves as the page-peel target on Day 5–6) ---
  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 14),
    new THREE.MeshStandardMaterial({
      color: 0x1a1f2c,
      roughness: 0.95,
    }),
  );
  backWall.position.set(0, 4, -6);
  backWall.receiveShadow = true;
  root.add(backWall);

  // ---- Desk ---------------------------------------------------------
  const deskWidth = 8;
  const deskDepth = 4;
  const deskThickness = 0.18;
  const deskTopY = 0.0;
  const deskGeo = new THREE.BoxGeometry(deskWidth, deskThickness, deskDepth);
  const deskMat = new THREE.MeshStandardMaterial({
    color: WOOD,
    roughness: 0.6,
    metalness: 0.0,
  });
  const desk = new THREE.Mesh(deskGeo, deskMat);
  desk.position.set(0, deskTopY - deskThickness / 2, 0);
  desk.castShadow = false;
  desk.receiveShadow = true;
  desk.userData.tag = "desk";
  root.add(desk);
  hoverables.push(desk);
  // Desk is a hoverable target for the cursor raycaster but not a "clueable"
  // anomaly target — its tag is only used for cursor projection, not tooltips.

  // Desk legs
  const legMat = new THREE.MeshStandardMaterial({
    color: WOOD_DARK,
    roughness: 0.7,
  });
  const legGeo = new THREE.BoxGeometry(0.12, 1.2, 0.12);
  const legPositions: Array<[number, number]> = [
    [-deskWidth / 2 + 0.2, -deskDepth / 2 + 0.2],
    [deskWidth / 2 - 0.2, -deskDepth / 2 + 0.2],
    [-deskWidth / 2 + 0.2, deskDepth / 2 - 0.2],
    [deskWidth / 2 - 0.2, deskDepth / 2 - 0.2],
  ];
  for (const [x, z] of legPositions) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, deskTopY - deskThickness - 0.6, z);
    leg.castShadow = true;
    leg.receiveShadow = true;
    root.add(leg);
  }

  // ---- Monitor ------------------------------------------------------
  const monitor = new THREE.Group();
  monitor.position.set(-1.8, deskTopY, -1.0);
  root.add(monitor);

  // Monitor stand
  const standMat = new THREE.MeshStandardMaterial({
    color: PLASTIC,
    roughness: 0.55,
    metalness: 0.3,
  });
  const standBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.5, 0.06, 24),
    standMat,
  );
  standBase.position.y = 0.03;
  standBase.castShadow = true;
  standBase.receiveShadow = true;
  monitor.add(standBase);
  const standArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.7, 0.1),
    standMat,
  );
  standArm.position.y = 0.4;
  standArm.castShadow = true;
  monitor.add(standArm);

  // Monitor body
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.12), standMat);
  bezel.position.set(0, 1.0, 0);
  bezel.castShadow = true;
  bezel.receiveShadow = true;
  bezel.userData.tag = "monitor";
  monitor.add(bezel);
  hoverables.push(bezel);

  // Screen (emissive)
  const screenTex = makeMonitorTexture(false);
  const monitorScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.05, 1.25),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }),
  );
  monitorScreen.position.set(0, 1.0, 0.061);
  monitorScreen.userData.tag = "monitor-screen";
  monitor.add(monitorScreen);
  hoverables.push(monitorScreen);

  // Reflection layer — drawn slightly in front of the screen, multiplicative.
  // Hidden by default; the "monitor-reflection" anomaly enables it.
  const reflectionTex = makeReflectionTexture();
  const monitorReflection = new THREE.Mesh(
    new THREE.PlaneGeometry(2.05, 1.25),
    new THREE.MeshBasicMaterial({
      map: reflectionTex,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  monitorReflection.position.set(0, 1.0, 0.062);
  monitorReflection.userData.tag = "monitor-screen";
  monitorReflection.visible = false;
  monitor.add(monitorReflection);

  // ---- Keyboard -----------------------------------------------------
  const keyboard = new THREE.Group();
  keyboard.position.set(-1.8, deskTopY + 0.04, 0.2);
  root.add(keyboard);

  const kbBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.08, 0.7),
    new THREE.MeshStandardMaterial({
      color: 0x14161e,
      roughness: 0.7,
    }),
  );
  kbBody.castShadow = true;
  kbBody.receiveShadow = true;
  kbBody.userData.tag = "keyboard";
  keyboard.add(kbBody);
  hoverables.push(kbBody);

  // Key tops grid — purely decorative. Drawn as a single InstancedMesh
  // (one draw call) instead of 48 individual meshes (47 extra draws +
  // 47 scene-graph entries the renderer would have to traverse and
  // frustum-cull every frame).
  const keyMat = new THREE.MeshStandardMaterial({
    color: 0x242833,
    roughness: 0.6,
  });
  const keyGeo = new THREE.BoxGeometry(0.16, 0.04, 0.16);
  const cols = 12;
  const rows = 4;
  const keys = new THREE.InstancedMesh(keyGeo, keyMat, rows * cols);
  keys.castShadow = false;
  const keyMatrix = new THREE.Matrix4();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      keyMatrix.makeTranslation(-1.0 + c * 0.18, 0.06, -0.27 + r * 0.16);
      keys.setMatrixAt(r * cols + c, keyMatrix);
    }
  }
  keys.instanceMatrix.needsUpdate = true;
  keyboard.add(keys);

  // ---- Mug + steam --------------------------------------------------
  const mug = new THREE.Group();
  mug.position.set(2.4, deskTopY + 0.0, 0.6);
  root.add(mug);

  const mugMat = new THREE.MeshStandardMaterial({
    color: 0xe8e6e1,
    roughness: 0.55,
  });
  const mugBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.25, 0.5, 24),
    mugMat,
  );
  mugBody.position.y = 0.25;
  mugBody.castShadow = true;
  mugBody.receiveShadow = true;
  mugBody.userData.tag = "mug";
  mug.add(mugBody);
  hoverables.push(mugBody);

  // Coffee inside
  const coffee = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.25, 0.02, 24),
    new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.4 }),
  );
  coffee.position.y = 0.49;
  mug.add(coffee);

  // Mug handle
  const handleGeo = new THREE.TorusGeometry(0.12, 0.025, 8, 16, Math.PI);
  const handle = new THREE.Mesh(handleGeo, mugMat);
  handle.position.set(0.28, 0.25, 0);
  handle.rotation.y = -Math.PI / 2;
  handle.rotation.z = Math.PI / 2;
  mug.add(handle);

  // Mug label (white plane wrapped onto front of mug, drawn via canvas tex).
  const mugLabelTex = makeMugLabelTexture("");
  const mugLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.18),
    new THREE.MeshBasicMaterial({
      map: mugLabelTex,
      transparent: true,
      depthWrite: false,
    }),
  );
  mugLabel.position.set(0, 0.27, 0.282);
  mug.add(mugLabel);

  // Steam: simple set of small translucent quads stacked above the mug.
  // Animation moves them up (or down, when the steam-down anomaly is active).
  const steamTex = makeSteamTexture();
  const steamMat = new THREE.MeshBasicMaterial({
    map: steamTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    toneMapped: false,
  });
  const steamGeo = new THREE.PlaneGeometry(0.4, 0.4);
  const coffeeSteam = new THREE.Mesh(steamGeo, steamMat);
  coffeeSteam.position.set(0, 0.7, 0);
  coffeeSteam.userData.tag = "coffee-steam";
  mug.add(coffeeSteam);
  hoverables.push(coffeeSteam);

  // ---- Calendar (small standing card) ------------------------------
  // Forward on the desk, right of the keyboard — not tucked behind the monitor.
  const calendarTex = makeCalendarTexture(formatToday());
  const calendar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.5),
    new THREE.MeshBasicMaterial({ map: calendarTex, side: THREE.DoubleSide }),
  );
  calendar.position.set(0.5, deskTopY + 0.27, 0.46);
  calendar.rotation.y = -0.36;
  calendar.userData.tag = "calendar";
  root.add(calendar);
  hoverables.push(calendar);

  // Two small feet at the bottom corners — avoids a center “stick” reading as a spine on the card art.
  const calFootMat = new THREE.MeshStandardMaterial({
    color: 0x222730,
    roughness: 0.5,
  });
  for (const fx of [-0.26, 0.26] as const) {
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.12, 0.08),
      calFootMat,
    );
    foot.position.set(fx, -0.24, -0.07);
    foot.castShadow = true;
    calendar.add(foot);
  }

  // ---- Reagent tray (3 wells + center mix + label) -------------------
  const reagentTray = new THREE.Group();
  reagentTray.position.set(2.15, deskTopY + 0.01, -1.32);
  reagentTray.rotation.y = -0.35;
  root.add(reagentTray);

  const trayBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.1, 0.62),
    new THREE.MeshStandardMaterial({ color: 0x252b34, roughness: 0.42 }),
  );
  trayBase.position.y = 0.05;
  trayBase.castShadow = true;
  trayBase.receiveShadow = true;
  reagentTray.add(trayBase);

  const labelStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.02, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x3a4450, roughness: 0.5 }),
  );
  labelStrip.position.set(0, 0.11, -0.28);
  reagentTray.add(labelStrip);

  function addWell(x: number, z: number, radius: number): void {
    const wellHole = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 0.06, 24),
      new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.55 }),
    );
    wellHole.rotation.x = Math.PI / 2;
    wellHole.position.set(x, 0.11, z);
    reagentTray.add(wellHole);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.018, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x6a7484, roughness: 0.35 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, 0.135, z);
    reagentTray.add(rim);
  }
  addWell(-0.28, 0.05, 0.12);
  addWell(0, 0.05, 0.14);
  addWell(0.28, 0.05, 0.12);

  const reagentSpinner = new THREE.Mesh(
    new THREE.CircleGeometry(0.13, 32),
    new THREE.MeshBasicMaterial({
      color: 0x4a8cff,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    }),
  );
  reagentSpinner.rotation.x = -Math.PI / 2;
  reagentSpinner.position.set(0, 0.142, 0.05);
  reagentTray.add(reagentSpinner);

  const reagentHit = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.35, 0.65),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  reagentHit.position.set(0, 0.18, 0);
  reagentHit.userData.tag = "reagent-tray";
  reagentTray.add(reagentHit);
  hoverables.push(reagentHit);

  const reagentOutline = new THREE.Mesh(
    new THREE.BoxGeometry(1.08, 0.14, 0.68),
    new THREE.MeshBasicMaterial({
      color: GOLD_HEX,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  reagentOutline.position.set(0, 0.12, 0);
  reagentTray.add(reagentOutline);

  // ---- Evidence envelope (body + flap + seal; face mesh for anomalies) ---
  const evidenceEnvelopeRoot = new THREE.Group();
  evidenceEnvelopeRoot.position.set(-0.28, deskTopY + 0.01, 1.38);
  evidenceEnvelopeRoot.rotation.y = 0.14;
  root.add(evidenceEnvelopeRoot);

  const envBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.03, 0.48),
    new THREE.MeshStandardMaterial({ color: 0xc9b596, roughness: 0.55 }),
  );
  envBody.position.y = 0.015;
  envBody.receiveShadow = true;
  envBody.castShadow = true;
  evidenceEnvelopeRoot.add(envBody);

  const envelopeTex = makeEvidenceEnvelopeTexture("CASE");
  const evidenceEnvelope = new THREE.Mesh(
    new THREE.PlaneGeometry(0.64, 0.44),
    new THREE.MeshBasicMaterial({ map: envelopeTex, side: THREE.DoubleSide }),
  );
  evidenceEnvelope.rotation.x = -Math.PI / 2;
  evidenceEnvelope.position.set(0, 0.028, 0);
  evidenceEnvelope.userData.tag = "evidence-envelope";
  evidenceEnvelopeRoot.add(evidenceEnvelope);
  hoverables.push(evidenceEnvelope);

  // Generous invisible hit volume so the whole envelope footprint
  // (body + flap area) launches the Sentence mini, not just the label face.
  const envelopeHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.84, 0.18, 0.6),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  envelopeHit.position.set(0, 0.07, 0);
  envelopeHit.userData.tag = "evidence-envelope";
  evidenceEnvelopeRoot.add(envelopeHit);
  hoverables.push(envelopeHit);

  const flapPivot = new THREE.Group();
  flapPivot.position.set(0, 0.026, -0.24);
  evidenceEnvelopeRoot.add(flapPivot);
  const envelopeFlap = new THREE.Mesh(
    new THREE.PlaneGeometry(0.64, 0.2),
    new THREE.MeshStandardMaterial({
      color: 0xb5a080,
      roughness: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  envelopeFlap.position.set(0, 0.1, 0.1);
  envelopeFlap.rotation.x = Math.PI * 0.5;
  flapPivot.add(envelopeFlap);

  const seal = new THREE.Mesh(
    new THREE.CircleGeometry(0.055, 20),
    new THREE.MeshStandardMaterial({ color: 0x8b2c2c, roughness: 0.4 }),
  );
  seal.rotation.x = -Math.PI / 2;
  seal.position.set(0.18, 0.032, 0.12);
  evidenceEnvelopeRoot.add(seal);

  const envelopeOutline = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.5),
    new THREE.MeshBasicMaterial({
      color: GOLD_HEX,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  envelopeOutline.rotation.x = -Math.PI / 2;
  envelopeOutline.position.set(0, 0.04, 0);
  evidenceEnvelopeRoot.add(envelopeOutline);

  // ---- Lamp + spectrum card ----------------------------------------
  const lamp = new THREE.Group();
  lamp.position.set(-3.4, deskTopY, -0.6);
  root.add(lamp);

  const lampBaseMat = new THREE.MeshStandardMaterial({
    color: 0x1a1d24,
    roughness: 0.4,
    metalness: 0.4,
  });
  const lampBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 0.06, 24),
    lampBaseMat,
  );
  lampBase.position.y = 0.03;
  lampBase.castShadow = true;
  lampBase.receiveShadow = true;
  lampBase.userData.tag = "lamp";
  lamp.add(lampBase);
  hoverables.push(lampBase);

  // Tall narrow invisible hit-cylinder so clicking anywhere on the lamp
  // body (neck / shade / bulb) launches the Tampering mini. Kept narrow
  // (0.18r) so it doesn't bleed into the envelope's screen projection.
  const lampHit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 1.05, 12),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  lampHit.position.y = 0.55;
  lampHit.userData.tag = "lamp";
  lamp.add(lampHit);
  hoverables.push(lampHit);

  const lampNeck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.9, 12),
    lampBaseMat,
  );
  lampNeck.position.y = 0.5;
  lamp.add(lampNeck);

  const lampHead = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.28, 0.3, 16, 1, true),
    lampBaseMat,
  );
  lampHead.position.y = 1.0;
  const lampHeadRestRx = -0.3;
  lampHead.rotation.x = lampHeadRestRx;
  lampHead.castShadow = true;
  lamp.add(lampHead);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd28c }),
  );
  bulb.position.set(0, 0.95, 0.03);
  lamp.add(bulb);

  const lampLight = new THREE.PointLight(0xffc78a, 1.6, 8, 2);
  lampLight.position.copy(bulb.position);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.setScalar(512);
  lampLight.shadow.bias = -0.001;
  lampLight.shadow.autoUpdate = false;
  lampLight.shadow.needsUpdate = true;
  lamp.add(lampLight);

  const lampCardTex = makeLampCardTexture("???");
  const lampCard = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.14),
    new THREE.MeshBasicMaterial({
      map: lampCardTex,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    }),
  );
  lampCard.position.set(0.55, deskTopY + 0.11, -0.35);
  lampCard.rotation.x = -Math.PI / 2;
  lampCard.rotation.z = 0.15;
  root.add(lampCard);

  const lampOutline = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.32, 0.1, 24),
    new THREE.MeshBasicMaterial({
      color: GOLD_HEX,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  lampOutline.position.y = 0.03;
  lamp.add(lampOutline);

  // Evidence-flag standee + elongated faux shadow (lamp-shadow-wrong flips / moves these).
  const standeeTex = makeFlagSilhouetteTexture();
  const standeeMat = new THREE.MeshStandardMaterial({
    map: standeeTex,
    transparent: true,
    alphaTest: 0.5,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const lampShadowStandee = new THREE.Mesh(
    new THREE.PlaneGeometry(0.44, 0.58),
    standeeMat,
  );
  lampShadowStandee.position.set(-1.55, deskTopY + 0.32, 0.05);
  lampShadowStandee.rotation.y = 0.42;
  lampShadowStandee.castShadow = true;
  lampShadowStandee.receiveShadow = true;
  lampShadowStandee.userData.tag = "lamp-shadow";
  root.add(lampShadowStandee);
  hoverables.push(lampShadowStandee);

  const fauxShadowTex = makeFlagShadowTexture();
  const lampShadowProp = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.7),
    new THREE.MeshBasicMaterial({
      map: fauxShadowTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  lampShadowProp.rotation.x = -Math.PI / 2;
  lampShadowProp.rotation.z = -0.35;
  lampShadowProp.position.set(-1.0, deskTopY + 0.004, 0.32);
  lampShadowProp.renderOrder = 1;
  lampShadowProp.userData.tag = "lamp-shadow";
  root.add(lampShadowProp);
  hoverables.push(lampShadowProp);

  // ---- Case file sheet (matches intro peel art; hidden until investigation) ---
  const sheetW = 0.95;
  const sheetD = 0.6;
  const caseFileTex = makeFakePageTexture(
    1024,
    Math.floor(1024 * (sheetD / sheetW)),
  );
  const caseFileSheet = new THREE.Mesh(
    new THREE.PlaneGeometry(sheetW, sheetD),
    new THREE.MeshBasicMaterial({
      map: caseFileTex,
      side: THREE.DoubleSide,
    }),
  );
  caseFileSheet.rotation.x = -Math.PI / 2;
  caseFileSheet.rotation.z = 0.12;
  caseFileSheet.position.set(0.38, deskTopY + 0.004, -1.48);
  caseFileSheet.visible = false;
  caseFileSheet.receiveShadow = true;
  caseFileSheet.castShadow = false;
  caseFileSheet.userData.tag = "case-file";
  caseFileSheet.userData.baseY = caseFileSheet.position.y;
  caseFileSheet.userData.floatActive = false;
  root.add(caseFileSheet);
  hoverables.push(caseFileSheet);

  // ---- Plant --------------------------------------------------------
  const plant = new THREE.Group();
  plant.position.set(3.4, deskTopY, -1.5);
  root.add(plant);

  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.22, 0.36, 16),
    new THREE.MeshStandardMaterial({ color: 0x8b4a2b, roughness: 0.7 }),
  );
  pot.position.y = 0.18;
  pot.castShadow = true;
  pot.receiveShadow = true;
  pot.userData.tag = "plant";
  plant.add(pot);
  hoverables.push(pot);

  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x2d6a3e,
    roughness: 0.55,
  });
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 6), leafMat);
    const angle = (i / 5) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 0.12, 0.55, Math.sin(angle) * 0.12);
    leaf.rotation.z = Math.cos(angle) * 0.5;
    leaf.rotation.x = Math.sin(angle) * 0.5;
    leaf.castShadow = true;
    plant.add(leaf);
  }

  // ---- Animation step -----------------------------------------------
  const steamBaseY = coffeeSteam.position.y;
  const caseFileBaseY = caseFileSheet.position.y;
  const plantBaseRotation = plant.rotation.clone();
  const keyboardBaseY = keyboard.position.y;
  const mugBaseRot = {
    x: mug.rotation.x,
    y: mug.rotation.y,
    z: mug.rotation.z,
  };
  const deskBaseScale = desk.scale.x;

  function step(elapsed: number, dt: number): void {
    // The diorama is hidden during the page-peel intro — skip every
    // per-frame transform/material write while it can't be seen.
    if (!root.visible) return;

    const k = Math.min(1, dt * 5);
    const targetEnv = flags.envelopeOpen ? 1 : 0;
    envelopeOpenLerp += (targetEnv - envelopeOpenLerp) * k;
    flapPivot.rotation.x = -envelopeOpenLerp * 1.15;

    const targetReag = flags.reagentActive ? 1 : 0;
    reagentActiveLerp += (targetReag - reagentActiveLerp) * k;
    trayBase.position.y = 0.05 + reagentActiveLerp * 0.02;

    const targetLamp = flags.lampActive ? 1 : 0;
    lampActiveLerp += (targetLamp - lampActiveLerp) * k;
    const nowMs = performance.now();
    let lampHeadX = lampHeadRestRx - lampActiveLerp * 0.35;
    const lampFlavorEnd = lamp.userData.flavorEndMs as number | undefined;
    if (lampFlavorEnd && nowMs < lampFlavorEnd) {
      const u = 1 - (lampFlavorEnd - nowMs) / 620;
      lampHeadX += Math.sin(u * Math.PI) * 0.14;
    }
    lampHead.rotation.x = lampHeadX;
    (lampCard.material as THREE.MeshBasicMaterial).opacity =
      lampActiveLerp * 0.96;

    const pulse = 0.35 + Math.sin(elapsed * 2.8) * 0.25;
    const setOutline = (
      mesh: THREE.Mesh,
      tag: "evidence-envelope" | "reagent-tray" | "lamp",
    ): void => {
      const m = mesh.material as THREE.MeshBasicMaterial;
      m.opacity = deskHighlightTag === tag ? pulse : 0;
    };
    setOutline(envelopeOutline, "evidence-envelope");
    setOutline(reagentOutline, "reagent-tray");
    setOutline(lampOutline, "lamp");

    // Reagent tray liquid swirl (replaces wall-clock hands).
    const dir = flags.clockReverse ? -1 : 1;
    reagentSpinner.rotation.z = elapsed * 0.85 * dir;

    // Steam drift
    const drift = (elapsed * 0.4) % 1;
    const steamDir = flags.steamDownward ? -1 : 1;
    let steamY = steamBaseY + drift * 0.6 * steamDir;
    let steamOp = 0.55 * (1 - drift);
    const steamFlavorEnd = coffeeSteam.userData.flavorEndMs as
      | number
      | undefined;
    if (steamFlavorEnd && nowMs < steamFlavorEnd) {
      const u = 1 - (steamFlavorEnd - nowMs) / 620;
      steamY += 0.06 * Math.sin(u * Math.PI * 2);
      steamOp = Math.min(0.92, steamOp + 0.35 * Math.sin(u * Math.PI));
    }
    coffeeSteam.position.y = steamY;
    (coffeeSteam.material as THREE.MeshBasicMaterial).opacity = steamOp;

    // Case file: hover when pen-floating anomaly retargets here.
    if (!caseFileSheet.userData.floatActive) {
      caseFileSheet.position.y = caseFileBaseY;
    } else {
      caseFileSheet.position.y =
        caseFileBaseY + 0.02 + Math.sin(elapsed * 1.45) * 0.008;
    }

    // Plant glitch jitter when the plant-glitching anomaly is on. This
    // used to live in a parallel requestAnimationFrame loop in
    // anomalies.ts which leaked across restarts; it now rides the main
    // render loop and is automatically torn down with the diorama.
    if (plant.userData.glitching) {
      plant.rotation.x = plantBaseRotation.x + (Math.random() - 0.5) * 0.05;
      plant.rotation.z = plantBaseRotation.z + (Math.random() - 0.5) * 0.05;
    } else {
      plant.rotation.x = plantBaseRotation.x;
      const pf = plant.userData.flavorEndMs as number | undefined;
      if (pf && nowMs < pf) {
        const u = 1 - (pf - nowMs) / 620;
        plant.rotation.z = plantBaseRotation.z + Math.sin(u * Math.PI) * 0.08;
      } else {
        plant.rotation.z = plantBaseRotation.z;
      }
    }

    // Click flavor reactions (propInteractions.applyPropFlavor)
    const calEnd = calendar.userData.flavorEndMs as number | undefined;
    if (calEnd && nowMs < calEnd) {
      const u = 1 - (calEnd - nowMs) / 620;
      calendar.rotation.x = Math.sin(u * Math.PI) * 0.22;
    } else {
      calendar.rotation.x = 0;
    }

    const mugEnd = mug.userData.flavorEndMs as number | undefined;
    if (mugEnd && nowMs < mugEnd) {
      const u = 1 - (mugEnd - nowMs) / 620;
      mug.rotation.z = mugBaseRot.z + Math.sin(u * Math.PI) * 0.38;
      mug.rotation.x = mugBaseRot.x + Math.sin(u * Math.PI * 2) * 0.06;
    } else {
      mug.rotation.set(mugBaseRot.x, mugBaseRot.y, mugBaseRot.z);
    }

    const caseFileFlavorEnd = caseFileSheet.userData.flavorEndMs as
      | number
      | undefined;
    if (caseFileFlavorEnd && nowMs < caseFileFlavorEnd) {
      const u = 1 - (caseFileFlavorEnd - nowMs) / 620;
      caseFileSheet.rotation.z = 0.12 + Math.sin(u * Math.PI * 2) * 0.04;
    } else {
      caseFileSheet.rotation.z = 0.12;
    }

    const kbEnd = keyboard.userData.flavorEndMs as number | undefined;
    if (kbEnd && nowMs < kbEnd) {
      const u = 1 - (kbEnd - nowMs) / 620;
      keyboard.position.y = keyboardBaseY + Math.sin(u * Math.PI) * 0.035;
    } else {
      keyboard.position.y = keyboardBaseY;
    }

    const deskEnd = desk.userData.flavorEndMs as number | undefined;
    if (deskEnd && nowMs < deskEnd) {
      const u = 1 - (deskEnd - nowMs) / 620;
      const s = deskBaseScale + Math.sin(u * Math.PI) * 0.004;
      desk.scale.set(s, s, s);
    } else {
      desk.scale.set(deskBaseScale, deskBaseScale, deskBaseScale);
    }

    const shEnd = lampShadowStandee.userData.flavorEndMs as number | undefined;
    if (shEnd && nowMs < shEnd) {
      const u = 1 - (shEnd - nowMs) / 620;
      lampShadowStandee.rotation.z = Math.sin(u * Math.PI * 2) * 0.07;
      (lampShadowProp.material as THREE.MeshBasicMaterial).opacity =
        0.85 + 0.12 * Math.sin(u * Math.PI);
    } else {
      lampShadowStandee.rotation.z = 0;
      (lampShadowProp.material as THREE.MeshBasicMaterial).opacity = 0.85;
    }
  }

  function setDeskHighlight(tag: string | null): void {
    deskHighlightTag = tag;
  }

  const mascotFootObstacles: DeskFootCircle[] = [
    { x: mug.position.x, z: mug.position.z, r: 0.38 },
    { x: caseFileSheet.position.x, z: caseFileSheet.position.z, r: 0.55 },
    { x: keyboard.position.x, z: keyboard.position.z, r: 1.16 },
    { x: monitor.position.x, z: monitor.position.z, r: 1.12 },
    { x: reagentTray.position.x, z: reagentTray.position.z, r: 0.7 },
    {
      x: evidenceEnvelopeRoot.position.x,
      z: evidenceEnvelopeRoot.position.z,
      r: 0.42,
    },
    { x: lamp.position.x, z: lamp.position.z, r: 0.34 },
    {
      x: lampShadowStandee.position.x,
      z: lampShadowStandee.position.z,
      r: 0.32,
    },
    { x: lampShadowProp.position.x, z: lampShadowProp.position.z, r: 0.82 },
    { x: plant.position.x, z: plant.position.z, r: 0.36 },
    { x: calendar.position.x, z: calendar.position.z, r: 0.34 },
  ];

  return {
    root,
    desk,
    hoverables,
    deskTopY,
    monitor,
    monitorScreen,
    monitorReflection,
    mug,
    mugLabel,
    calendar,
    evidenceEnvelope,
    evidenceEnvelopeRoot,
    reagentTray,
    reagentSpinner,
    lamp,
    lampCard,
    lampShadowStandee,
    lampShadowProp,
    caseFileSheet,
    coffeeSteam,
    keyboard,
    plant,
    backWall,
    flags,
    step,
    setDeskHighlight,
    mascotFootObstacles,
  };
}

// ---- Texture builders -----------------------------------------------

function formatToday(): { day: number; month: string } {
  const d = new Date();
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  return { day: d.getDate(), month: months[d.getMonth()] ?? "—" };
}

export function makeCalendarTexture(d: {
  day: number;
  month: string;
}): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 192;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  // Card background
  ctx.fillStyle = PAPER_HEX;
  ctx.fillRect(0, 0, c.width, c.height);
  // Red header band
  ctx.fillStyle = "#c14a3b";
  ctx.fillRect(0, 0, c.width, 56);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 36px ui-sans-serif, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(d.month, c.width / 2, 40);
  // Day number
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 110px ui-sans-serif, sans-serif";
  ctx.fillText(String(d.day).padStart(2, "0"), c.width / 2, 160);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PAPER_HEX = "#f2efe1";

export function makeMugLabelTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.clearRect(0, 0, c.width, c.height);
  if (text.length > 0) {
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 56px ui-sans-serif, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, c.width / 2, c.height / 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeMonitorTexture(reflection: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  // Gradient background
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, "#5a7fbf");
  g.addColorStop(1, "#2a4275");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  // Code window
  ctx.fillStyle = "#1a1f2c";
  ctx.fillRect(60, 60, 392, 220);
  ctx.fillStyle = "#a8d0ff";
  ctx.font = "16px ui-monospace, monospace";
  const lines = [
    "function findBug(scene) {",
    "  for (const obj of scene) {",
    "    if (obj.isWeird) return obj;",
    "  }",
    "  return null;",
    "}",
  ];
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i] ?? "", 80, 100 + i * 26);
  }
  if (reflection) {
    // Soft warm glow overlay (different room visible)
    ctx.fillStyle = "rgba(255,200,150,0.2)";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeReflectionTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  // Faint silhouette of a different room
  const g = ctx.createRadialGradient(256, 200, 30, 256, 200, 250);
  g.addColorStop(0, "rgba(255,210,170,0.7)");
  g.addColorStop(0.6, "rgba(120,80,60,0.25)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  // Window-frame silhouette
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 6;
  ctx.strokeRect(180, 100, 160, 180);
  ctx.beginPath();
  ctx.moveTo(260, 100);
  ctx.lineTo(260, 280);
  ctx.moveTo(180, 190);
  ctx.lineTo(340, 190);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeStickyTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = `#${STICKY.toString(16).padStart(6, "0")}`;
  ctx.fillRect(0, 0, c.width, c.height);
  // Folded corner
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  ctx.beginPath();
  ctx.moveTo(c.width, 0);
  ctx.lineTo(c.width - 36, 0);
  ctx.lineTo(c.width, 36);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "28px ui-sans-serif, sans-serif";
  ctx.textAlign = "center";
  // Wrap text crudely
  const words = text.split(" ");
  let line = "";
  let y = 110;
  for (const w of words) {
    if ((line + " " + w).length > 14) {
      ctx.fillText(line.trim(), c.width / 2, y);
      y += 36;
      line = w;
    } else {
      line += " " + w;
    }
  }
  if (line.trim()) ctx.fillText(line.trim(), c.width / 2, y);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Manila envelope look for the evidence slot (replaces sticky note art). */
/** Small card under lamp cone — spectrum mini uses texture swap at runtime. */
export function makeLampCardTexture(word: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = "#f4f0e6";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#8a7355";
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, c.width - 8, c.height - 8);
  ctx.fillStyle = "#1a1d24";
  ctx.font = "bold 28px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(word.slice(0, 8).toUpperCase(), c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeEvidenceEnvelopeTexture(
  label: string,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 220;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = "#d8c4a6";
  ctx.strokeStyle = "#8a7355";
  ctx.lineWidth = 2;
  ctx.fillRect(12, 28, c.width - 24, c.height - 40);
  ctx.strokeRect(12, 28, c.width - 24, c.height - 40);
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  ctx.beginPath();
  ctx.moveTo(12, 28);
  ctx.lineTo(c.width / 2, 78);
  ctx.lineTo(c.width - 12, 28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1a1d24";
  ctx.font = "bold 22px ui-sans-serif, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("EVIDENCE", c.width / 2, 118);
  ctx.font = "600 18px ui-sans-serif, sans-serif";
  ctx.fillStyle = "#3a3228";
  ctx.fillText(label.slice(0, 12), c.width / 2, 152);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makePhotoTexture(
  kind: "default" | "self",
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  // Sky/grass background
  const sky = ctx.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0, "#7ab0d6");
  sky.addColorStop(0.6, "#cfe6f3");
  sky.addColorStop(0.6, "#6ea84a");
  sky.addColorStop(1, "#3e6c2c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, c.width, c.height);
  // Person silhouette
  ctx.fillStyle = "#2a2d36";
  ctx.beginPath();
  ctx.arc(c.width / 2, 130, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(c.width / 2 - 50, 170, 100, 110);
  if (kind === "self") {
    // Tiny smiley face on the head — same as the mascot. The "uncanny" gag.
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(c.width / 2 - 14, 124, 6, 0, Math.PI * 2);
    ctx.arc(c.width / 2 + 14, 124, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(c.width / 2 - 14, 144);
    ctx.quadraticCurveTo(c.width / 2, 156, c.width / 2 + 14, 144);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeBookPagesTexture(hasText: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = PAPER_HEX;
  ctx.fillRect(0, 0, c.width, c.height);
  // Spine shadow
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(c.width / 2 - 4, 0, 8, c.height);
  if (hasText) {
    ctx.fillStyle = "#222";
    ctx.font = "12px ui-sans-serif, serif";
    for (let col = 0; col < 2; col++) {
      const x = 30 + col * 240;
      for (let row = 0; row < 18; row++) {
        const w = 180 + ((row * 31) % 30);
        ctx.fillRect(x, 26 + row * 16, w, 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeClockFaceTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = "#f2efe1";
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111418";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x = 128 + Math.cos(a) * 100;
    const y = 128 + Math.sin(a) * 100;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(128, 128, 6, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeSteamTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
