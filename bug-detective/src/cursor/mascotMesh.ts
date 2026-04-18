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

  // Materials shared across body parts.
  const bodyMat = new THREE.MeshStandardMaterial({
    color: CHARCOAL,
    roughness: 0.5,
    metalness: 0.05,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: WHITE_GLOVE,
    roughness: 0.4,
    metalness: 0.05,
  });

  // ---- Inner head: cube oriented to read as the Cursor iso logo -------
  // The Cursor logo is a cube viewed at the canonical isometric angle.
  // We keep the cube axis-aligned in mascot-local space; the gameplay
  // camera (positioned 3/4 over the desk) supplies the iso framing for
  // free. The cube's +Z face faces forward and gets the smiley decal.
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.55, 0);
  group.add(headGroup);

  const headEdge = 0.78;

  // The dark inner cube. Two-tone material is faked by overlaying a slightly
  // darker top-face decal so the iso silhouette reads with depth even in
  // ambient light.
  const cubeMat = new THREE.MeshStandardMaterial({
    color: CHARCOAL,
    roughness: 0.55,
    metalness: 0.05,
    flatShading: true,
  });
  const headCube = new THREE.Mesh(
    new THREE.BoxGeometry(headEdge, headEdge, headEdge),
    cubeMat,
  );
  headCube.castShadow = true;
  headGroup.add(headCube);

  // ---- Cursor-arrow decal on the top face -----------------------------
  // The Cursor logo signature is a small triangular arrow cut into the top
  // face. We draw it onto a canvas and lay it on the +Y face of the cube.
  const cursorArrowTex = makeCursorArrowTexture();
  const cursorArrowMat = new THREE.MeshBasicMaterial({
    map: cursorArrowTex,
    transparent: true,
    depthWrite: false,
  });
  const cursorArrowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(headEdge * 0.95, headEdge * 0.95),
    cursorArrowMat,
  );
  cursorArrowMesh.rotation.x = -Math.PI / 2;
  cursorArrowMesh.position.y = headEdge / 2 + 0.001;
  headCube.add(cursorArrowMesh);

  // ---- Smiley face on the FRONT face of the cube ---------------------
  // Welded to the +Z face of the cube. headGroup's local +Z is the world's
  // forward axis, which is what the camera looks at from 3/4.
  const faceAnchor = new THREE.Object3D();
  faceAnchor.position.set(0, 0, headEdge / 2 + 0.001);
  headGroup.add(faceAnchor);

  const faceTextures = makeFaceTextures();
  const faceMat = new THREE.MeshBasicMaterial({
    map: faceTextures.open,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const faceGeo = new THREE.PlaneGeometry(0.55, 0.4);
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  faceMesh.renderOrder = 999;
  faceAnchor.add(faceMesh);

  // ---- Outer glass shell (same iso cube, slightly larger) ------------
  const shellEdge = headEdge + 0.12;
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8efff,
    roughness: 0.05,
    metalness: 0,
    transmission: 0.95,
    thickness: 0.5,
    ior: 1.45,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.2,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const shellCube = new THREE.Mesh(
    new THREE.BoxGeometry(shellEdge, shellEdge, shellEdge),
    shellMat,
  );
  shellCube.renderOrder = 2;
  headGroup.add(shellCube);

  // ---- Body (small chunky torso, head dominates the silhouette) ------
  const torsoGeo = new THREE.SphereGeometry(0.32, 20, 14);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.position.set(0, 0.05, 0);
  torso.scale.set(1.05, 0.85, 1.05);
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  // Stubby legs (small, planted under the body)
  const legGeo = new THREE.SphereGeometry(0.14, 14, 10);
  const legL = new THREE.Mesh(legGeo, bodyMat);
  legL.position.set(-0.13, -0.22, 0.04);
  legL.castShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, bodyMat);
  legR.position.set(0.13, -0.22, 0.04);
  legR.castShadow = true;
  group.add(legR);

  // Left arm — short stub, no glove
  const armGeo = new THREE.SphereGeometry(0.12, 14, 10);
  const armL = new THREE.Mesh(armGeo, bodyMat);
  armL.position.set(-0.32, 0.05, 0.05);
  armL.castShadow = true;
  group.add(armL);

  // Right arm — slightly longer, holds the magnifying glass
  const armR = new THREE.Mesh(armGeo, bodyMat);
  armR.position.set(0.34, 0.0, 0.12);
  armR.castShadow = true;
  group.add(armR);

  // White glove on the right hand
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), gloveMat);
  glove.castShadow = true;
  armR.add(glove);
  glove.position.set(0.13, -0.02, 0.06);

  // ---- Magnifying glass (parented to the right hand glove) -----------
  const magnifier = new THREE.Group();
  magnifier.name = "magnifier";
  glove.add(magnifier);

  const frameMat = new THREE.MeshStandardMaterial({
    color: CHARCOAL,
    roughness: 0.45,
    metalness: 0.1,
  });
  const frameGeo = new THREE.TorusGeometry(0.16, 0.022, 12, 28);
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.castShadow = true;
  magnifier.add(frame);

  const handleGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.4, 12);
  const handle = new THREE.Mesh(handleGeo, frameMat);
  handle.position.set(0, -0.3, 0);
  handle.castShadow = true;
  magnifier.add(handle);

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
  magnifier.add(lens);

  // Idle pose (t=0): magnifier hangs at the right side, frame down.
  const idlePos = new THREE.Vector3(0.04, -0.32, 0.0);
  const idleEuler = new THREE.Euler(0, 0, 0);
  // Active pose (t=1): held up to the right, frame facing camera.
  const activePos = new THREE.Vector3(0.16, 0.16, 0.3);
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

  // The face is printed on the gem's front facet (matches the reference toy
  // where the smile is permanently on one face). No per-frame billboarding —
  // the face only reads correctly when the player looks at the mascot from
  // somewhere within the front hemisphere, which our camera does.
  const faceCamera = (_camera: THREE.Camera): void => {
    /* no-op; face is welded to the front gem facet */
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

/**
 * The Cursor logo's signature: a triangular arrow-cursor cut into the top
 * face of the cube. Drawn as a faint lighter triangle over the dark cube to
 * read clearly in low light.
 */
function makeCursorArrowTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.clearRect(0, 0, size, size);

  // Cursor arrow silhouette: a chunky pointer pointing toward the upper-left
  // corner of the top face. Brighter than the cube so it reads as a logo
  // mark even from across the desk.
  const cx = size * 0.5;
  const cy = size * 0.5;
  ctx.fillStyle = "rgba(232,239,255,0.78)";
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.32, cy - size * 0.32);          // tip (upper-left)
  ctx.lineTo(cx + size * 0.20, cy - size * 0.06);          // right shoulder
  ctx.lineTo(cx - size * 0.06, cy + size * 0.06);          // mid notch
  ctx.lineTo(cx - size * 0.06, cy + size * 0.32);          // tail-bottom-left
  ctx.lineTo(cx - size * 0.22, cy + size * 0.32);          // tail-bottom-right
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(232,239,255,1)";
  ctx.lineWidth = 4;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
