import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export interface MascotMesh {
  readonly group: THREE.Group;
  readonly faceAnchor: THREE.Object3D;
  setTilt(radians: number): void;
  setMagnifierLifted(t01: number): void;
  setBlink(open01: number): void;
  faceCamera(camera: THREE.Camera): void;
  /** Walk cycle: phase 0..1, intensity 0..1 when moving. */
  setStride(phase01: number, intensity01: number): void;
}

const CHARCOAL_DARK = 0x1a1d24;
const WHITE_GLOVE = 0xf1f3f7;
const FACE_TEX_SIZE = 256;

const MAX_THIGH_SWING = 0.42;
const MAX_ARM_SWING = 0.28;
/** Above this magnifier lift, freeze right-arm stride so the loupe stays stable. */
const MAGNIFIER_ARM_FREEZE_T = 0.2;

export function createMascotMesh(): MascotMesh {
  const group = new THREE.Group();
  group.name = "mascot";

  const skinDarkMat = new THREE.MeshStandardMaterial({
    color: CHARCOAL_DARK,
    roughness: 0.55,
    metalness: 0.05,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: WHITE_GLOVE,
    roughness: 0.4,
    metalness: 0.05,
  });
  const bodyDarkMat = new THREE.MeshStandardMaterial({
    color: 0x151922,
    roughness: 0.42,
    metalness: 0.08,
  });
  const bodyLightMat = new THREE.MeshStandardMaterial({
    color: 0xe8e8e8,
    roughness: 0.42,
    metalness: 0.08,
  });

  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, -0.26, 0);
  group.add(torsoGroup);

  const leftTorsoShell = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.24,
      0.24,
      0.3,
      16,
      1,
      false,
      Math.PI / 2,
      Math.PI,
    ),
    bodyLightMat,
  );
  leftTorsoShell.position.x = 0;
  leftTorsoShell.castShadow = true;
  torsoGroup.add(leftTorsoShell);

  const rightTorsoShell = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.24,
      0.24,
      0.3,
      16,
      1,
      false,
      -Math.PI / 2,
      Math.PI,
    ),
    bodyDarkMat,
  );
  rightTorsoShell.position.x = 0;
  rightTorsoShell.castShadow = true;
  torsoGroup.add(rightTorsoShell);

  const leftTorsoCap = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.24,
      16,
      12,
      Math.PI / 2,
      Math.PI,
      0,
      Math.PI / 2,
    ),
    bodyLightMat,
  );
  leftTorsoCap.position.set(0, 0.15, 0);
  leftTorsoCap.castShadow = true;
  torsoGroup.add(leftTorsoCap);

  const rightTorsoCap = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.24,
      16,
      12,
      -Math.PI / 2,
      Math.PI,
      0,
      Math.PI / 2,
    ),
    bodyDarkMat,
  );
  rightTorsoCap.position.set(0, 0.15, 0);
  rightTorsoCap.castShadow = true;
  torsoGroup.add(rightTorsoCap);

  // Hip cap stays charcoal — it visually marks the waistline where the
  // glass upper body meets the solid charcoal pants.
  const hipCap = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.27,
      16,
      12,
      0,
      Math.PI * 2,
      Math.PI / 2,
      Math.PI / 2,
    ),
    skinDarkMat,
  );
  hipCap.position.y = -0.15;
  torsoGroup.add(hipCap);

  const thighPivotL = new THREE.Group();
  const thighPivotR = new THREE.Group();
  const upperArmSwingL = new THREE.Group();
  const upperArmSwingR = new THREE.Group();

  const armParts = (
    side: "L" | "R",
  ): { shoulder: THREE.Group; hand: THREE.Group } => {
    const sx = side === "L" ? -1 : 1;
    const swing = side === "L" ? upperArmSwingL : upperArmSwingR;

    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.24, 0.1, 0);
    torsoGroup.add(shoulder);

    const shoulderBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 14, 10),
      skinDarkMat,
    );
    shoulderBall.castShadow = true;
    shoulder.add(shoulderBall);

    swing.position.set(0, 0, 0);
    shoulder.add(swing);

    // Glass arm cylinder wrapping a darker inner core (so the dark
    // shoulder/elbow balls read as "internals visible through glass").
    const upperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.085, 0.19, 16),
      side === "L" ? bodyLightMat : bodyDarkMat,
    );
    upperArm.position.set(sx * 0.03, -0.11, 0.03);
    upperArm.rotation.z = sx * -0.14;
    upperArm.castShadow = true;
    swing.add(upperArm);

    const elbow = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 12, 10),
      skinDarkMat,
    );
    elbow.position.set(sx * 0.07, -0.21, 0.06);
    elbow.castShadow = true;
    swing.add(elbow);

    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.08, 0.17, 16),
      side === "L" ? bodyLightMat : bodyDarkMat,
    );
    forearm.position.set(sx * 0.095, -0.305, 0.11);
    forearm.rotation.x = -0.42;
    forearm.castShadow = true;
    swing.add(forearm);

    const hand = new THREE.Group();
    hand.position.set(sx * 0.1, -0.365, 0.15);
    swing.add(hand);

    const handGlove = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 14, 10),
      gloveMat,
    );
    handGlove.castShadow = true;
    hand.add(handGlove);

    return { shoulder, hand };
  };

  armParts("L");
  const armR = armParts("R");

  const legParts = (side: "L" | "R", pivot: THREE.Group): void => {
    const sx = side === "L" ? -1 : 1;

    const hip = new THREE.Group();
    hip.position.set(sx * 0.13, -0.16, 0);
    torsoGroup.add(hip);

    pivot.position.set(0, 0, 0);
    hip.add(pivot);

    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.1, 0.19, 16),
      side === "L" ? bodyLightMat : bodyDarkMat,
    );
    thigh.position.y = -0.1;
    thigh.castShadow = true;
    pivot.add(thigh);

    const knee = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 12, 10),
      side === "L" ? gloveMat : bodyDarkMat,
    );
    knee.position.y = -0.2;
    knee.castShadow = true;
    pivot.add(knee);

    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.085, 0.17, 16),
      side === "L" ? bodyLightMat : bodyDarkMat,
    );
    shin.position.y = -0.3;
    shin.castShadow = true;
    pivot.add(shin);

    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.085, 0.22),
      side === "L" ? bodyLightMat : bodyDarkMat,
    );
    foot.position.set(0, -0.42, 0.06);
    foot.castShadow = true;
    pivot.add(foot);

    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.025, 0.18),
      gloveMat,
    );
    sole.position.set(0, -0.46, 0.08);
    sole.castShadow = true;
    pivot.add(sole);
  };
  legParts("L", thighPivotL);
  legParts("R", thighPivotR);

  // ---- Head: a perfect cube rotated 45 degrees with an inner logo shape ----
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.32, 0.02);
  headGroup.rotation.order = "YXZ";
  headGroup.rotation.y = Math.PI / 4; // Edge facing front
  headGroup.rotation.x = -0.05; // Slight downward tilt
  group.add(headGroup);

  const headRadius = 0.48; // Reduced head size (was 0.55)
  const cubeSize = headRadius * 1.5;
  const h = cubeSize / 2;

  // Inner solid dark shape representing the Cursor logo wedge
  const cursorWedge = new THREE.Group();
  cursorWedge.name = "cursorWedge";
  cursorWedge.renderOrder = 5;
  headGroup.add(cursorWedge);

  // Logo: two black mesh pieces on the inner glass surface (not cut-through solids).
  const logoMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const d = 0.01; // inset from glass
  const ih = h - d; // inner half-size

  const p_ih = ih - 0.01; // Just inside the glass shell

  // Left piece (Top of the head, occupying 50% of the top face)
  // This is an "inverted V" on the TOP of the cube (the +Y face)
  const P_Left_TopFront = new THREE.Vector3(-p_ih, p_ih, p_ih); // Corner facing camera
  const P_Left_TopBack = new THREE.Vector3(-p_ih, p_ih, -p_ih); // Back-left corner
  const P_Left_TopRight = new THREE.Vector3(p_ih, p_ih, p_ih); // Front-right corner

  // To fix the edge looking non-black, we fold the geometry down the -X face slightly
  // and down the +Z face slightly along the top-front edges.
  const edgeWidth = 0.04;

  // Left side fold (-X face)
  const P_Left_EdgeBack = new THREE.Vector3(-p_ih, p_ih - edgeWidth, -p_ih);
  const P_Left_EdgeFront = new THREE.Vector3(-p_ih, p_ih - edgeWidth, p_ih);

  // Right side fold (+Z face)
  const P_Right_EdgeLeft = new THREE.Vector3(-p_ih, p_ih - edgeWidth, p_ih);
  const P_Right_EdgeRight = new THREE.Vector3(p_ih, p_ih - edgeWidth, p_ih);

  const leftGeo = new THREE.BufferGeometry();
  const leftPos = new Float32Array([
    // Top face triangle
    ...P_Left_TopBack.toArray(),
    ...P_Left_TopFront.toArray(),
    ...P_Left_TopRight.toArray(),

    // Left face edge strip (Quad on -X face)
    ...P_Left_TopBack.toArray(),
    ...P_Left_EdgeBack.toArray(),
    ...P_Left_EdgeFront.toArray(),

    ...P_Left_TopBack.toArray(),
    ...P_Left_EdgeFront.toArray(),
    ...P_Left_TopFront.toArray(),

    // Right face edge strip (Quad on +Z face)
    ...P_Left_TopFront.toArray(),
    ...P_Right_EdgeLeft.toArray(),
    ...P_Right_EdgeRight.toArray(),

    ...P_Left_TopFront.toArray(),
    ...P_Right_EdgeRight.toArray(),
    ...P_Left_TopRight.toArray(),
  ]);
  leftGeo.setAttribute("position", new THREE.BufferAttribute(leftPos, 3));
  leftGeo.computeVertexNormals();
  const leftMesh = new THREE.Mesh(leftGeo, logoMat);
  cursorWedge.add(leftMesh);

  // Right piece (On the +Z face, matching the older design but on the surface)
  // The older design was a triangle with a gap.
  const gap = 0.15 * p_ih;
  const P_Right_TopLeft = new THREE.Vector3(-p_ih + gap, p_ih - gap, p_ih);
  const P_Right_Bottom = new THREE.Vector3(-p_ih + gap, -p_ih + gap * 2, p_ih);
  const P_Right_TopRight = new THREE.Vector3(p_ih, p_ih - gap, p_ih);

  const rightGeo = new THREE.BufferGeometry();
  const rightPos = new Float32Array([
    ...P_Right_TopLeft.toArray(),
    ...P_Right_Bottom.toArray(),
    ...P_Right_TopRight.toArray(),
  ]);
  rightGeo.setAttribute("position", new THREE.BufferAttribute(rightPos, 3));
  rightGeo.computeVertexNormals();
  const rightMesh = new THREE.Mesh(rightGeo, logoMat);
  cursorWedge.add(rightMesh);

  // Clear glass shell
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0xfcfeff,
    roughness: 0.07,
    metalness: 0,
    transparent: true,
    opacity: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const shell = new THREE.Mesh(
    new RoundedBoxGeometry(cubeSize, cubeSize, cubeSize, 4, 0.05),
    shellMat,
  );
  shell.renderOrder = 3;
  headGroup.add(shell);

  // Face printed across the front corner of the cube
  const faceTextures = makeBillboardFaceTextures();
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTextures.open,
    roughness: 0.5,
    metalness: 0,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const faceGeo = new THREE.BufferGeometry();
  const fw = 0.4; // wider face
  const fh = 0.22; // half-height
  const eps = 0.005; // offset outside glass

  // The face is wrapped around the front-most corner (-ih, y, ih)
  const cx = -h - eps,
    cz = h + eps;

  // Left edge of the face (further back along -Z on the -X face)
  const lx = -h - eps,
    lz = h + eps - fw;

  // Right edge of the face (further right along +X on the +Z face)
  const rx = -h - eps + fw,
    rz = h + eps;

  const ty = -h * 0.15 + fh;
  const by = -h * 0.15 - fh;

  const fpos = new Float32Array([
    // Left panel (-X face, screen left)
    // Triangle 1: TL, BL, TR
    lx,
    ty,
    lz,
    lx,
    by,
    lz,
    cx,
    ty,
    cz,
    // Triangle 2: BL, BR, TR
    lx,
    by,
    lz,
    cx,
    by,
    cz,
    cx,
    ty,
    cz,

    // Right panel (+Z face, screen right)
    // Triangle 1: TL, BL, TR
    cx,
    ty,
    cz,
    cx,
    by,
    cz,
    rx,
    ty,
    rz,
    // Triangle 2: BL, BR, TR
    cx,
    by,
    cz,
    rx,
    by,
    rz,
    rx,
    ty,
    rz,
  ]);

  const fuvs = new Float32Array([
    // Left panel UVs
    // Triangle 1: TL(0,1), BL(0,0), TR(0.5,1)
    0, 1, 0, 0, 0.5, 1,
    // Triangle 2: BL(0,0), BR(0.5,0), TR(0.5,1)
    0, 0, 0.5, 0, 0.5, 1,

    // Right panel UVs
    // Triangle 1: TL(0.5,1), BL(0.5,0), TR(1,1)
    0.5, 1, 0.5, 0, 1, 1,
    // Triangle 2: BL(0.5,0), BR(1,0), TR(1,1)
    0.5, 0, 1, 0, 1, 1,
  ]);

  faceGeo.setAttribute("position", new THREE.BufferAttribute(fpos, 3));
  faceGeo.setAttribute("uv", new THREE.BufferAttribute(fuvs, 2));
  faceGeo.computeVertexNormals();

  const facePlane = new THREE.Mesh(faceGeo, faceMat);
  facePlane.renderOrder = 6;
  headGroup.add(facePlane);

  const faceAnchor = new THREE.Object3D();
  faceAnchor.position.set(cx, -h * 0.15, cz);
  headGroup.add(faceAnchor);

  const magnifier = new THREE.Group();
  magnifier.name = "magnifier";
  armR.hand.add(magnifier);

  const magnifierParts = new THREE.Group();
  magnifierParts.name = "magnifierParts";
  magnifier.add(magnifierParts);

  const frameMat = new THREE.MeshStandardMaterial({
    color: CHARCOAL_DARK,
    roughness: 0.45,
    metalness: 0.1,
  });
  const frame = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.024, 12, 28),
    frameMat,
  );
  frame.position.set(0.14, -0.02, 0.2);
  frame.castShadow = true;
  magnifierParts.add(frame);

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.024, 0.26, 12),
    frameMat,
  );
  handle.position.set(0.015, -0.05, 0.065);
  handle.rotation.z = -0.52;
  handle.rotation.x = 0.1;
  handle.castShadow = true;
  magnifierParts.add(handle);

  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8efff,
    roughness: 0.04,
    metalness: 0,
    transmission: 0.98,
    thickness: 0.12,
    ior: 1.5,
    transparent: true,
    side: THREE.DoubleSide,
    clearcoat: 1,
  });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.14, 32), lensMat);
  lens.position.copy(frame.position);
  magnifierParts.add(lens);

  const idlePos = new THREE.Vector3(0.01, -0.08, -0.02);
  const idleEuler = new THREE.Euler(0, 0, 0);
  const activePos = new THREE.Vector3(0.01, -0.02, 0.02);
  const activeEuler = new THREE.Euler(0.72, -0.22, -0.46);

  const tmpQuatA = new THREE.Quaternion();
  const tmpQuatB = new THREE.Quaternion();
  let magnifierLift01 = 0;
  const setMagnifierLifted = (t01: number): void => {
    magnifierLift01 = THREE.MathUtils.clamp(t01, 0, 1);
    const t = magnifierLift01;
    magnifier.position.lerpVectors(idlePos, activePos, t);
    tmpQuatA.setFromEuler(idleEuler);
    tmpQuatB.setFromEuler(activeEuler);
    magnifier.quaternion.copy(tmpQuatA).slerp(tmpQuatB, t);
  };
  setMagnifierLifted(0);

  const setTilt = (radians: number): void => {
    group.rotation.x = radians;
  };

  const setBlink = (open01: number): void => {
    const closed = open01 < 0.5;
    faceMat.map = closed ? faceTextures.closed : faceTextures.open;
    faceMat.needsUpdate = true;
  };

  const faceCamera = (_camera: THREE.Camera): void => {
    // Face stays fixed to the front cube panel. Do not billboard it.
  };

  const setStride = (phase01: number, intensity01: number): void => {
    const t = THREE.MathUtils.clamp(intensity01, 0, 1);
    const ph = phase01 * Math.PI * 2;
    const s = Math.sin(ph) * MAX_THIGH_SWING * t;
    thighPivotL.rotation.x = s;
    thighPivotR.rotation.x = -s;
    const arm = Math.sin(ph + Math.PI) * MAX_ARM_SWING * t;
    const freezeR = magnifierLift01 > MAGNIFIER_ARM_FREEZE_T;
    upperArmSwingL.rotation.x = -arm * 0.9;
    upperArmSwingR.rotation.x = freezeR ? 0 : arm * 0.9;
  };

  return {
    group,
    faceAnchor,
    setTilt,
    setMagnifierLifted,
    setBlink,
    faceCamera,
    setStride,
  };
}

interface BillboardFaceSet {
  open: THREE.CanvasTexture;
  closed: THREE.CanvasTexture;
}

function makeBillboardFaceTextures(): BillboardFaceSet {
  return {
    open: drawBillboardFace("open"),
    closed: drawBillboardFace("closed"),
  };
}

type EyeMode = "open" | "closed";

function drawBillboardFace(eyes: EyeMode): THREE.CanvasTexture {
  const size = FACE_TEX_SIZE;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  ctx.clearRect(0, 0, size, size);

  const cx = size * 0.5;
  // Each panel is U 0..0.5 (left) and U 0.5..1 (right); eyes centered in
  // their panel at U ≈ 0.18 / 0.82 keeps the radius clear of the canvas
  // edge so the circles don't smear over the cube corner.
  const eyeSpread = size * 0.32;
  // Eyes sit above middle; smile sits below middle. The face panel itself
  // is anchored low on the head cube, so canvas-V 0.45 maps just above
  // the cube's geometric center, matching the reference layout.
  const eyeY = size * 0.45;
  ctx.fillStyle = "#000000"; // Pure black
  if (eyes === "open") {
    // Strong vertical ovals (rx ≪ ry), rotation 0 — tall pill shape, not wide ellipses.
    const rx = size * 0.054;
    const ry = size * 0.142;
    ctx.beginPath();
    ctx.ellipse(cx - eyeSpread, eyeY, rx, ry, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + eyeSpread, eyeY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Happy-closed eyes: gentle upward arcs, not flat dashes.
    ctx.lineWidth = size * 0.04;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000000"; // Pure black
    const halfW = size * 0.085;
    ctx.beginPath();
    ctx.arc(cx - eyeSpread, eyeY + halfW * 0.4, halfW, Math.PI, 2 * Math.PI);
    ctx.arc(cx + eyeSpread, eyeY + halfW * 0.4, halfW, Math.PI, 2 * Math.PI);
    ctx.stroke();
  }

  // Smile: shallow happy curve with slight upturn at the corners.
  // Drawn as a quadratic curve so the ends sit higher than the dip, which
  // gives the cute "smiling" feel from the reference (not a deep U).
  ctx.lineWidth = size * 0.045;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000000"; // Pure black
  const smileHalfW = size * 0.16; // corners at U ≈ 0.34 / 0.66 (under inner eyes)
  const smileTopY = size * 0.65; // y of the upturned corners
  const smileDip = size * 0.085; // how deep the middle dips below the corners
  ctx.beginPath();
  ctx.moveTo(cx - smileHalfW, smileTopY);
  ctx.quadraticCurveTo(
    cx,
    smileTopY + smileDip * 2,
    cx + smileHalfW,
    smileTopY,
  );
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
