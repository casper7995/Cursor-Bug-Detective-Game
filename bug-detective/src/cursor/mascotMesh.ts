import * as THREE from "three";

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

  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, -0.15, 0);
  group.add(torsoGroup);

  const torsoGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.6, 16);
  const torso = new THREE.Mesh(torsoGeo, skinDarkMat);
  torso.castShadow = true;
  torso.receiveShadow = true;
  torsoGroup.add(torso);

  const torsoCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    skinDarkMat,
  );
  torsoCap.position.y = 0.3;
  torsoGroup.add(torsoCap);

  const hipCap = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.32,
      16,
      12,
      0,
      Math.PI * 2,
      Math.PI / 2,
      Math.PI / 2,
    ),
    skinDarkMat,
  );
  hipCap.position.y = -0.3;
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
    shoulder.position.set(sx * 0.32, 0.22, 0);
    torsoGroup.add(shoulder);

    const shoulderBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 14, 10),
      skinDarkMat,
    );
    shoulderBall.castShadow = true;
    shoulder.add(shoulderBall);

    swing.position.set(0, 0, 0);
    shoulder.add(swing);

    const upperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.07, 0.28, 12),
      skinDarkMat,
    );
    upperArm.position.set(sx * 0.05, -0.16, 0.04);
    upperArm.rotation.z = sx * -0.2;
    upperArm.castShadow = true;
    swing.add(upperArm);

    const elbow = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 10),
      skinDarkMat,
    );
    elbow.position.set(sx * 0.115, -0.32, 0.07);
    elbow.castShadow = true;
    swing.add(elbow);

    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.065, 0.25, 12),
      skinDarkMat,
    );
    forearm.position.set(sx * 0.13, -0.43, 0.18);
    forearm.rotation.x = -0.7;
    forearm.castShadow = true;
    swing.add(forearm);

    const hand = new THREE.Group();
    hand.position.set(sx * 0.14, -0.5, 0.32);
    swing.add(hand);

    const handGlove = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 14, 10),
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
    hip.position.set(sx * 0.15, -0.28, 0);
    torsoGroup.add(hip);

    pivot.position.set(0, 0, 0);
    hip.add(pivot);

    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.08, 0.28, 12),
      skinDarkMat,
    );
    thigh.position.y = -0.16;
    thigh.castShadow = true;
    pivot.add(thigh);

    const knee = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 12, 10),
      skinDarkMat,
    );
    knee.position.y = -0.3;
    knee.castShadow = true;
    pivot.add(knee);

    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.07, 0.26, 12),
      skinDarkMat,
    );
    shin.position.y = -0.45;
    shin.castShadow = true;
    pivot.add(shin);

    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.08, 0.22),
      skinDarkMat,
    );
    foot.position.set(0, -0.6, 0.04);
    foot.castShadow = true;
    pivot.add(foot);
  };
  legParts("L", thighPivotL);
  legParts("R", thighPivotR);

  // ---- Head: octahedron crystal + white arrow wedge + clear shell --------
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.55, 0);
  headGroup.rotation.y = Math.PI / 4;
  group.add(headGroup);

  const headRadius = 0.38;
  const headCore = new THREE.Mesh(
    new THREE.OctahedronGeometry(headRadius, 0),
    new THREE.MeshStandardMaterial({
      color: CHARCOAL_DARK,
      roughness: 0.45,
      metalness: 0.08,
    }),
  );
  headCore.castShadow = true;
  headGroup.add(headCore);

  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 0.42);
  arrowShape.lineTo(-0.14, 0.12);
  arrowShape.lineTo(-0.05, 0.12);
  arrowShape.lineTo(-0.05, -0.28);
  arrowShape.lineTo(0.05, -0.28);
  arrowShape.lineTo(0.05, 0.12);
  arrowShape.lineTo(0.14, 0.12);
  arrowShape.lineTo(0, 0.42);

  const arrowGeo = new THREE.ExtrudeGeometry(arrowShape, {
    depth: 0.06,
    bevelEnabled: false,
  });
  arrowGeo.center();
  const arrowWedge = new THREE.Mesh(
    arrowGeo,
    new THREE.MeshStandardMaterial({
      color: WHITE_GLOVE,
      roughness: 0.35,
      metalness: 0.05,
    }),
  );
  arrowWedge.position.set(0, 0, 0.06);
  arrowWedge.rotation.y = -0.15;
  arrowWedge.castShadow = true;
  headGroup.add(arrowWedge);

  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8efff,
    roughness: 0.05,
    metalness: 0,
    transmission: 0.95,
    thickness: 0.45,
    ior: 1.45,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.2,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const shell = new THREE.Mesh(
    new THREE.OctahedronGeometry(headRadius * 1.14, 0),
    shellMat,
  );
  shell.renderOrder = 2;
  headGroup.add(shell);

  const faceTextures = makeBillboardFaceTextures();
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTextures.open,
    roughness: 0.5,
    metalness: 0,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const facePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.55),
    faceMat,
  );
  facePlane.position.set(0, 0.02, headRadius * 0.92);
  facePlane.renderOrder = 5;
  headGroup.add(facePlane);

  const faceAnchor = new THREE.Object3D();
  faceAnchor.position.copy(facePlane.position);
  headGroup.add(faceAnchor);

  const magnifier = new THREE.Group();
  magnifier.name = "magnifier";
  armR.hand.add(magnifier);

  const magnifierParts = new THREE.Group();
  magnifierParts.name = "magnifierParts";
  magnifierParts.rotation.y = Math.PI;
  magnifier.add(magnifierParts);

  const frameMat = new THREE.MeshStandardMaterial({
    color: CHARCOAL_DARK,
    roughness: 0.45,
    metalness: 0.1,
  });
  const frame = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.022, 12, 28),
    frameMat,
  );
  frame.castShadow = true;
  magnifierParts.add(frame);

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.4, 12),
    frameMat,
  );
  handle.position.set(0, -0.3, 0);
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
  magnifierParts.add(lens);

  const idlePos = new THREE.Vector3(0.04, -0.16, 0.0);
  const idleEuler = new THREE.Euler(0, 0, 0);
  const activePos = new THREE.Vector3(0.16, 0.05, 0.18);
  const activeEuler = new THREE.Euler(Math.PI / 2, 0, -0.3);

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

  const tmpCam = new THREE.Vector3();
  const tmpHead = new THREE.Vector3();
  const faceCamera = (camera: THREE.Camera): void => {
    facePlane.getWorldPosition(tmpHead);
    camera.getWorldPosition(tmpCam);
    facePlane.lookAt(tmpCam);
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

  ctx.fillStyle = "#00000000";
  ctx.clearRect(0, 0, size, size);

  const cx = size * 0.5;
  const eyeY = size * 0.42;
  const eyeSpread = size * 0.16;
  ctx.fillStyle = "#000";
  if (eyes === "open") {
    const r = size * 0.07;
    ctx.beginPath();
    ctx.ellipse(cx - eyeSpread, eyeY, r, r * 1.1, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + eyeSpread, eyeY, r, r * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = size * 0.035;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(cx - eyeSpread - size * 0.06, eyeY);
    ctx.lineTo(cx - eyeSpread + size * 0.06, eyeY);
    ctx.moveTo(cx + eyeSpread - size * 0.06, eyeY);
    ctx.lineTo(cx + eyeSpread + size * 0.06, eyeY);
    ctx.stroke();
  }

  ctx.lineWidth = size * 0.055;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#000";
  ctx.beginPath();
  ctx.arc(cx, size * 0.52, size * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
