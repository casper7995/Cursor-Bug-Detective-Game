import * as THREE from "three";

export interface MascotMesh {
  /** Root group — set position/rotation here to move the mascot in the world. */
  readonly group: THREE.Group;
  /** Object3D the smiley face is parented to. Billboarded toward camera. */
  readonly faceAnchor: THREE.Object3D;
  /** Tilt the mascot forward/back around its X axis (radians). */
  setTilt(radians: number): void;
  /** 0 = magnifier hangs at side, 1 = held up at "found-it" pose. */
  setMagnifierLifted(t01: number): void;
  /** 1 = wide eyes, 0 = blinked closed. */
  setBlink(open01: number): void;
  /** Update billboarded face to look at the camera. Call each frame. */
  faceCamera(camera: THREE.Camera): void;
}

const CHARCOAL = 0x2a2d36;
const WHITE_GLOVE = 0xf1f3f7;
const FACE_TEX_SIZE = 256;

/**
 * Build the Bug Detective mascot, matching the reference toy figure:
 *  - clear faceted glass shell wrapping the upper body
 *  - charcoal pyramid head with smiley decal
 *  - chubby charcoal body with stubby limbs
 *  - white "glove" on the right hand holding a magnifying glass that
 *    animates between "hanging at side" and "lifted-to-find-bug" poses
 */
export function createMascotMesh(): MascotMesh {
  const group = new THREE.Group();
  group.name = "mascot";

  // ---- Body (sits below the glass shell) ------------------------------
  const bodyMat = new THREE.MeshStandardMaterial({
    color: CHARCOAL,
    roughness: 0.5,
    metalness: 0.05,
  });

  const torsoGeo = new THREE.SphereGeometry(0.55, 24, 16);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.position.set(0, -0.25, 0);
  torso.scale.set(1.0, 0.85, 1.0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  // Stubby legs
  const legGeo = new THREE.SphereGeometry(0.2, 16, 12);
  const legL = new THREE.Mesh(legGeo, bodyMat);
  legL.position.set(-0.22, -0.7, 0.05);
  legL.castShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, bodyMat);
  legR.position.set(0.22, -0.7, 0.05);
  legR.castShadow = true;
  group.add(legR);

  // Left arm (small blob, no glove)
  const armGeo = new THREE.SphereGeometry(0.18, 16, 12);
  const armL = new THREE.Mesh(armGeo, bodyMat);
  armL.position.set(-0.5, -0.18, 0.1);
  armL.castShadow = true;
  group.add(armL);

  // Right arm — extends further, holds the magnifying glass
  const armR = new THREE.Mesh(armGeo, bodyMat);
  armR.position.set(0.55, -0.22, 0.18);
  armR.castShadow = true;
  group.add(armR);

  // White glove on the right hand
  const gloveMat = new THREE.MeshStandardMaterial({
    color: WHITE_GLOVE,
    roughness: 0.4,
    metalness: 0.05,
  });
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), gloveMat);
  glove.castShadow = true;
  armR.add(glove);
  glove.position.set(0.18, -0.05, 0.1);

  // ---- Inner head (charcoal pyramid) ----------------------------------
  // ConeGeometry with 4 radial segments = square pyramid. Rotated 45° on Y so
  // a flat triangular face points at the camera (the "smiley face" face).
  const headGeo = new THREE.ConeGeometry(0.42, 0.7, 4, 1);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, 0.35, 0);
  head.rotation.y = Math.PI / 4;
  head.castShadow = true;
  group.add(head);

  // ---- Smiley face (camera-billboarded plane on front of head) --------
  const faceAnchor = new THREE.Object3D();
  faceAnchor.position.set(0, 0.32, 0.32); // front of pyramid head
  group.add(faceAnchor);

  const faceTextures = makeFaceTextures();
  const faceMat = new THREE.MeshBasicMaterial({
    map: faceTextures.open,
    transparent: true,
    depthWrite: false,
  });
  const faceGeo = new THREE.PlaneGeometry(0.45, 0.32);
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  faceMesh.renderOrder = 3;
  faceAnchor.add(faceMesh);

  // ---- Outer glass shell (transmissive) -------------------------------
  // Squashed octahedron wrapping head + upper torso. Drawn last so the
  // transmission samples the inner head's contribution correctly.
  const shellGeo = new THREE.OctahedronGeometry(0.85, 0);
  shellGeo.scale(1.0, 1.18, 1.0);
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8efff,
    roughness: 0.05,
    metalness: 0,
    transmission: 0.95,
    thickness: 0.6,
    ior: 1.45,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.2,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.position.set(0, 0.2, 0);
  shell.renderOrder = 2;
  // Shell does not cast shadow (would be a chunky black diamond shadow);
  // the body underneath does the shadow work.
  group.add(shell);

  // ---- Magnifying glass (parented to the right hand glove) -----------
  const magnifier = new THREE.Group();
  magnifier.name = "magnifier";
  glove.add(magnifier);

  const frameMat = new THREE.MeshStandardMaterial({
    color: CHARCOAL,
    roughness: 0.45,
    metalness: 0.1,
  });
  const frameGeo = new THREE.TorusGeometry(0.18, 0.025, 12, 32);
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.castShadow = true;
  magnifier.add(frame);

  const handleGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.45, 12);
  const handle = new THREE.Mesh(handleGeo, frameMat);
  handle.position.set(0, -0.32, 0);
  handle.castShadow = true;
  magnifier.add(handle);

  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8efff,
    roughness: 0.04,
    metalness: 0,
    transmission: 0.98,
    thickness: 0.15,
    ior: 1.5,
    transparent: true,
    side: THREE.DoubleSide,
    clearcoat: 1,
  });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.155, 32), lensMat);
  magnifier.add(lens);

  // Idle pose (t=0): magnifier hangs at the right side, frame down.
  const idlePos = new THREE.Vector3(0.05, -0.4, 0.0);
  const idleEuler = new THREE.Euler(0, 0, 0);
  // Active pose (t=1): held up to the right, frame facing camera.
  const activePos = new THREE.Vector3(0.18, 0.18, 0.35);
  const activeEuler = new THREE.Euler(Math.PI / 2, 0, -0.3);

  const tmpQuatA = new THREE.Quaternion();
  const tmpQuatB = new THREE.Quaternion();
  const setMagnifierLifted = (t01: number): void => {
    const t = clamp01(t01);
    magnifier.position.lerpVectors(idlePos, activePos, t);
    tmpQuatA.setFromEuler(idleEuler);
    tmpQuatB.setFromEuler(activeEuler);
    magnifier.quaternion.copy(tmpQuatA).slerp(tmpQuatB, t);
  };
  setMagnifierLifted(0);

  // ---- Public API -----------------------------------------------------
  const setTilt = (radians: number): void => {
    group.rotation.x = radians;
  };

  const setBlink = (open01: number): void => {
    faceMat.map = open01 < 0.5 ? faceTextures.closed : faceTextures.open;
    faceMat.needsUpdate = true;
  };

  const tmpCamPos = new THREE.Vector3();
  const tmpFacePos = new THREE.Vector3();
  const faceCamera = (camera: THREE.Camera): void => {
    camera.getWorldPosition(tmpCamPos);
    faceAnchor.getWorldPosition(tmpFacePos);
    // Project camera position onto a plane through the face that's parallel to
    // the world-up to keep the face from rolling.
    tmpCamPos.y = tmpFacePos.y;
    faceAnchor.lookAt(tmpCamPos);
  };

  return {
    group,
    faceAnchor,
    setTilt,
    setMagnifierLifted,
    setBlink,
    faceCamera,
  };
}

interface FaceTextures {
  readonly open: THREE.CanvasTexture;
  readonly closed: THREE.CanvasTexture;
}

function makeFaceTextures(): FaceTextures {
  return {
    open: drawFace("open"),
    closed: drawFace("closed"),
  };
}

function drawFace(eyes: "open" | "closed"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = FACE_TEX_SIZE;
  c.height = Math.floor(FACE_TEX_SIZE * (0.32 / 0.45));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable for mascot face texture");

  // Transparent background.
  ctx.clearRect(0, 0, c.width, c.height);

  ctx.fillStyle = "#000";
  const eyeY = c.height * 0.35;
  const eyeR = c.height * 0.11;
  const eyeOffsetX = c.width * 0.18;

  if (eyes === "open") {
    // Left eye
    ctx.beginPath();
    ctx.ellipse(c.width / 2 - eyeOffsetX, eyeY, eyeR, eyeR * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    // Right eye
    ctx.beginPath();
    ctx.ellipse(c.width / 2 + eyeOffsetX, eyeY, eyeR, eyeR * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Blinked: short horizontal lines.
    ctx.lineWidth = c.height * 0.08;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(c.width / 2 - eyeOffsetX - eyeR, eyeY);
    ctx.lineTo(c.width / 2 - eyeOffsetX + eyeR, eyeY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.width / 2 + eyeOffsetX - eyeR, eyeY);
    ctx.lineTo(c.width / 2 + eyeOffsetX + eyeR, eyeY);
    ctx.stroke();
  }

  // Smile.
  ctx.lineWidth = c.height * 0.07;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#000";
  ctx.beginPath();
  const smileY = c.height * 0.62;
  ctx.moveTo(c.width / 2 - eyeOffsetX, smileY);
  ctx.quadraticCurveTo(c.width / 2, smileY + c.height * 0.2, c.width / 2 + eyeOffsetX, smileY);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
