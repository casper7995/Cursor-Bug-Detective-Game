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
  // Translucent shell for the upper body (torso + arm cylinders) so the
  // mascot reads as "half charcoal, half glass" like the reference. Keep it
  // subtle; if this shell gets too opaque the body just turns into white fog.
  const bodyShellMat = new THREE.MeshPhysicalMaterial({
    color: 0xf9fcff,
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: 0.24,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
    envMapIntensity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
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
    bodyShellMat,
  );
  leftTorsoShell.position.x = 0;
  leftTorsoShell.renderOrder = 2;
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
    bodyShellMat,
  );
  leftTorsoCap.position.set(0, 0.15, 0);
  leftTorsoCap.renderOrder = 2;
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
      side === "L" ? bodyShellMat : bodyDarkMat,
    );
    upperArm.position.set(sx * 0.03, -0.11, 0.03);
    upperArm.rotation.z = sx * -0.14;
    upperArm.renderOrder = 2;
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
      side === "L" ? bodyShellMat : bodyDarkMat,
    );
    forearm.position.set(sx * 0.095, -0.305, 0.11);
    forearm.rotation.x = -0.42;
    forearm.renderOrder = 2;
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
      side === "L" ? bodyShellMat : bodyDarkMat,
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
      side === "L" ? bodyShellMat : bodyDarkMat,
    );
    shin.position.y = -0.3;
    shin.castShadow = true;
    pivot.add(shin);

    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.085, 0.22),
      side === "L" ? bodyShellMat : bodyDarkMat,
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
  cursorWedge.renderOrder = 1;
  headGroup.add(cursorWedge);

  const logoMat = new THREE.MeshStandardMaterial({
    color: 0x151822, // Dark charcoal
    roughness: 0.3,
    metalness: 0.2,
  });

  const d = 0.01; // inset from glass
  const ih = h - d; // inner half-size

  // The Cursor logo is formed by two wedge pieces inside the cube.
  // The plane they sit on is the diagonal from Top-Left to Top-Right to Bottom-Front.
  const vLT = new THREE.Vector3(-ih, ih, -ih);
  const vRT = new THREE.Vector3(ih, ih, ih);
  const vBT = new THREE.Vector3(ih, ih, -ih);
  const vFB = new THREE.Vector3(-ih, -ih, ih);

  // M1 and M2 define the gap width on the top front edge.
  const vM1 = new THREE.Vector3(0.1 * ih, ih, 0.1 * ih);
  const vM2 = new THREE.Vector3(0.3 * ih, ih, 0.3 * ih);

  // B2 defines the bottom tip of the smaller right triangle.
  const vB2 = new THREE.Vector3(0.2 * ih, 0.2 * ih, ih);

  // --- Left Piece (Main Pointer) ---
  const leftWedgeGeo = new THREE.BufferGeometry();
  const leftPos = new Float32Array([
    ...vLT.toArray(),
    ...vM1.toArray(),
    ...vBT.toArray(), // Top Face
    ...vLT.toArray(),
    ...vFB.toArray(),
    ...vM1.toArray(), // Front Diagonal Face
    ...vLT.toArray(),
    ...vBT.toArray(),
    ...vFB.toArray(), // Left Inner Face
    ...vM1.toArray(),
    ...vFB.toArray(),
    ...vBT.toArray(), // Right Inner Face
  ]);
  leftWedgeGeo.setAttribute("position", new THREE.BufferAttribute(leftPos, 3));
  leftWedgeGeo.computeVertexNormals();
  const leftWedgeMesh = new THREE.Mesh(leftWedgeGeo, logoMat);
  cursorWedge.add(leftWedgeMesh);

  // --- Right Piece (Small Wedge) ---
  const rightWedgeGeo = new THREE.BufferGeometry();
  const rightPos = new Float32Array([
    ...vM2.toArray(),
    ...vBT.toArray(),
    ...vRT.toArray(), // Top Face
    ...vM2.toArray(),
    ...vB2.toArray(),
    ...vRT.toArray(), // Front Diagonal Face
    ...vM2.toArray(),
    ...vBT.toArray(),
    ...vB2.toArray(), // Left Inner Face
    ...vRT.toArray(),
    ...vB2.toArray(),
    ...vBT.toArray(), // Right Inner Face
  ]);
  rightWedgeGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(rightPos, 3),
  );
  rightWedgeGeo.computeVertexNormals();
  const rightWedgeMesh = new THREE.Mesh(rightWedgeGeo, logoMat);
  cursorWedge.add(rightWedgeMesh);

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
  facePlane.renderOrder = 4;
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
  const eyeY = size * 0.58;
  const eyeSpread = size * 0.36;
  ctx.fillStyle = "#0a0d12";
  if (eyes === "open") {
    const r = size * 0.09;
    ctx.beginPath();
    ctx.ellipse(cx - eyeSpread, eyeY, r, r, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + eyeSpread, eyeY, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = size * 0.03;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0a0d12";
    ctx.beginPath();
    ctx.moveTo(cx - eyeSpread - size * 0.05, eyeY);
    ctx.lineTo(cx - eyeSpread + size * 0.05, eyeY);
    ctx.moveTo(cx + eyeSpread - size * 0.05, eyeY);
    ctx.lineTo(cx + eyeSpread + size * 0.05, eyeY);
    ctx.stroke();
  }

  ctx.lineWidth = size * 0.042;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#0a0d12";
  ctx.beginPath();
  ctx.arc(cx, size * 0.72, size * 0.09, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
