import * as THREE from "three";

/**
 * One hand-crafted desktop diorama. All interactive props carry a string
 * `userData.tag` so the anomaly system can find them by name. Each prop is
 * also exposed via the returned `DioramaObjects` for direct anomaly mutation.
 */
export interface DioramaObjects {
  readonly root: THREE.Group;
  readonly desk: THREE.Mesh;
  readonly hoverables: readonly THREE.Object3D[]; // raycaster targets
  readonly deskTopY: number;                       // Y of the desk surface
  readonly monitor: THREE.Group;
  readonly monitorScreen: THREE.Mesh;
  readonly monitorReflection: THREE.Mesh;
  readonly mug: THREE.Group;
  readonly mugLabel: THREE.Mesh;
  readonly pen: THREE.Mesh;
  readonly calendar: THREE.Mesh;
  readonly clock: THREE.Group;
  readonly clockHourHand: THREE.Mesh;
  readonly clockMinuteHand: THREE.Mesh;
  readonly photoFrame: THREE.Mesh;
  readonly photoImage: THREE.Mesh;
  readonly stickyNote: THREE.Mesh;
  readonly lamp: THREE.Group;
  readonly lampShadowProp: THREE.Mesh;
  readonly book: THREE.Mesh;
  readonly bookPages: THREE.Mesh;
  readonly coffeeSteam: THREE.Mesh;
  readonly keyboard: THREE.Group;
  readonly plant: THREE.Group;
  readonly backWall: THREE.Mesh;
  /** Step every prop's per-frame animation (clock hands, steam, etc). */
  step(elapsed: number, dt: number): void;
  /** Mutable flags toggled by anomalies. */
  readonly flags: DioramaFlags;
}

export interface DioramaFlags {
  clockReverse: boolean;
  steamDownward: boolean;
}

const WOOD = 0x6b4a2b;
const WOOD_DARK = 0x4a3320;
const PLASTIC = 0x1a1d24;
const STICKY = 0xfff48a;

export function createDesktopDiorama(): DioramaObjects {
  const root = new THREE.Group();
  root.name = "diorama";

  const flags: DioramaFlags = {
    clockReverse: false,
    steamDownward: false,
  };

  const hoverables: THREE.Object3D[] = [];

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
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.4, 0.12),
    standMat,
  );
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

  // Key tops grid — purely decorative
  const keyMat = new THREE.MeshStandardMaterial({
    color: 0x242833,
    roughness: 0.6,
  });
  const keyGeo = new THREE.BoxGeometry(0.16, 0.04, 0.16);
  const cols = 12;
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = new THREE.Mesh(keyGeo, keyMat);
      k.position.set(
        -1.0 + c * 0.18,
        0.06,
        -0.27 + r * 0.16,
      );
      k.castShadow = false;
      keyboard.add(k);
    }
  }

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

  // ---- Pen ----------------------------------------------------------
  const penGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.8, 12);
  const penMat = new THREE.MeshStandardMaterial({
    color: 0x9b1c2e,
    roughness: 0.4,
  });
  const pen = new THREE.Mesh(penGeo, penMat);
  pen.position.set(1.4, deskTopY + 0.025, 1.0);
  pen.rotation.z = Math.PI / 2;
  pen.rotation.y = 0.4;
  pen.castShadow = true;
  pen.userData.tag = "pen";
  pen.userData.baseY = pen.position.y;
  root.add(pen);
  hoverables.push(pen);

  // ---- Calendar (small standing card) ------------------------------
  const calendarTex = makeCalendarTexture(formatToday());
  const calendar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.5),
    new THREE.MeshBasicMaterial({ map: calendarTex, side: THREE.DoubleSide }),
  );
  calendar.position.set(2.0, deskTopY + 0.27, -1.4);
  calendar.rotation.y = -0.25;
  calendar.userData.tag = "calendar";
  root.add(calendar);
  hoverables.push(calendar);

  // Calendar stand (thin triangle behind)
  const calStand = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.5, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x222730, roughness: 0.5 }),
  );
  calStand.position.copy(calendar.position);
  calStand.position.x += 0.05;
  calStand.position.z -= 0.1;
  calStand.rotation.y = -0.25;
  calStand.castShadow = true;
  root.add(calStand);

  // ---- Clock --------------------------------------------------------
  const clock = new THREE.Group();
  clock.position.set(0, 4.2, -5.95);
  root.add(clock);

  const clockFaceTex = makeClockFaceTexture();
  const clockFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 48),
    new THREE.MeshBasicMaterial({ map: clockFaceTex }),
  );
  clockFace.userData.tag = "clock";
  clock.add(clockFace);
  hoverables.push(clockFace);

  const clockRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.04, 12, 48),
    new THREE.MeshStandardMaterial({ color: 0x222730, roughness: 0.4 }),
  );
  clock.add(clockRing);

  const handMat = new THREE.MeshBasicMaterial({ color: 0x111418 });
  const clockHourHand = new THREE.Mesh(
    new THREE.PlaneGeometry(0.04, 0.36),
    handMat,
  );
  clockHourHand.geometry.translate(0, 0.18, 0);
  clockHourHand.position.z = 0.01;
  clock.add(clockHourHand);

  const clockMinuteHand = new THREE.Mesh(
    new THREE.PlaneGeometry(0.03, 0.5),
    handMat,
  );
  clockMinuteHand.geometry.translate(0, 0.25, 0);
  clockMinuteHand.position.z = 0.011;
  clock.add(clockMinuteHand);

  // ---- Photo frame --------------------------------------------------
  const photoFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.6, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.5 }),
  );
  photoFrame.position.set(-3.0, deskTopY + 0.32, -1.4);
  photoFrame.rotation.y = 0.25;
  photoFrame.castShadow = true;
  photoFrame.userData.tag = "photo";
  root.add(photoFrame);
  hoverables.push(photoFrame);

  const photoTex = makePhotoTexture("default");
  const photoImage = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.5),
    new THREE.MeshBasicMaterial({ map: photoTex }),
  );
  photoImage.position.copy(photoFrame.position);
  photoImage.position.x += Math.sin(0.25) * 0.026;
  photoImage.position.z += Math.cos(0.25) * 0.026;
  photoImage.rotation.y = 0.25;
  photoImage.userData.tag = "photo";
  root.add(photoImage);

  // ---- Sticky note --------------------------------------------------
  const stickyTex = makeStickyTexture("ideas");
  const stickyNote = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.55),
    new THREE.MeshBasicMaterial({ map: stickyTex, side: THREE.DoubleSide }),
  );
  stickyNote.position.set(-0.3, deskTopY + 0.005, 1.4);
  stickyNote.rotation.x = -Math.PI / 2;
  stickyNote.rotation.z = 0.1;
  stickyNote.userData.tag = "sticky";
  root.add(stickyNote);
  hoverables.push(stickyNote);

  // ---- Lamp ---------------------------------------------------------
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
  lamp.add(lampBase);

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
  lampHead.rotation.x = -0.3;
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
  lamp.add(lampLight);

  // Shadow-casting prop (small block) used by lamp-shadow-wrong anomaly.
  const lampShadowProp = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.32, 0.18),
    new THREE.MeshStandardMaterial({ color: 0xb89060, roughness: 0.5 }),
  );
  lampShadowProp.position.set(-2.5, deskTopY + 0.16, -0.4);
  lampShadowProp.castShadow = true;
  lampShadowProp.receiveShadow = true;
  lampShadowProp.userData.tag = "lamp-shadow";
  root.add(lampShadowProp);
  hoverables.push(lampShadowProp);

  // ---- Book ---------------------------------------------------------
  const book = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.08, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x2a4a6e, roughness: 0.6 }),
  );
  book.position.set(0.4, deskTopY + 0.04, -1.5);
  book.rotation.y = 0.15;
  book.castShadow = true;
  book.receiveShadow = true;
  book.userData.tag = "book";
  root.add(book);
  hoverables.push(book);

  // Open page on top of book (visible "pages" plane). The blank-book anomaly
  // hides the text on this plane.
  const bookPagesTex = makeBookPagesTexture(true);
  const bookPages = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.55),
    new THREE.MeshBasicMaterial({ map: bookPagesTex, side: THREE.DoubleSide }),
  );
  bookPages.position.copy(book.position);
  bookPages.position.y += 0.045;
  bookPages.rotation.x = -Math.PI / 2;
  bookPages.rotation.z = 0.15;
  bookPages.userData.tag = "book";
  root.add(bookPages);

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
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.5, 6),
      leafMat,
    );
    const angle = (i / 5) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 0.12, 0.55, Math.sin(angle) * 0.12);
    leaf.rotation.z = Math.cos(angle) * 0.5;
    leaf.rotation.x = Math.sin(angle) * 0.5;
    leaf.castShadow = true;
    plant.add(leaf);
  }

  // ---- Animation step -----------------------------------------------
  const steamBaseY = coffeeSteam.position.y;
  const penBaseY = pen.position.y;

  function step(elapsed: number, _dt: number): void {
    // Clock hands: real wall-clock time, scaled so it feels alive.
    // Reverse direction if the anomaly is on.
    const dir = flags.clockReverse ? -1 : 1;
    const t = elapsed * 0.5 * dir;
    const minute = (t * 0.5) % (Math.PI * 2);
    const hour = (t * 0.04) % (Math.PI * 2);
    clockMinuteHand.rotation.z = -minute;
    clockHourHand.rotation.z = -hour;

    // Steam drift
    const drift = (elapsed * 0.4) % 1;
    const steamDir = flags.steamDownward ? -1 : 1;
    coffeeSteam.position.y = steamBaseY + drift * 0.6 * steamDir;
    (coffeeSteam.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - drift);

    // Pen idle: tiny breathing if floating-pen anomaly is on (handled by anomaly)
    if (!pen.userData.floatActive) {
      pen.position.y = penBaseY;
    } else {
      pen.position.y = penBaseY + 0.025 + Math.sin(elapsed * 1.6) * 0.005;
    }
  }

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
    pen,
    calendar,
    clock,
    clockHourHand,
    clockMinuteHand,
    photoFrame,
    photoImage,
    stickyNote,
    lamp,
    lampShadowProp,
    book,
    bookPages,
    coffeeSteam,
    keyboard,
    plant,
    backWall,
    flags,
    step,
  };
}

// ---- Texture builders -----------------------------------------------

function formatToday(): { day: number; month: string } {
  const d = new Date();
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  return { day: d.getDate(), month: months[d.getMonth()] ?? "—" };
}

export function makeCalendarTexture(d: { day: number; month: string }): THREE.CanvasTexture {
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
  const g = ctx.createRadialGradient(
    256, 200, 30, 256, 200, 250,
  );
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

export function makePhotoTexture(kind: "default" | "self"): THREE.CanvasTexture {
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
