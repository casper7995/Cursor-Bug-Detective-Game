import * as THREE from "three";

export interface MascotMesh {
  /** Root group — set position/rotation here to move the mascot in the world. */
  readonly group: THREE.Group;
  /** Object3D the smile is parented to (for future per-side billboard tweaks). */
  readonly faceAnchor: THREE.Object3D;
  /** Tilt the mascot forward/back around its X axis (radians). */
  setTilt(radians: number): void;
  /** 0 = magnifier hangs at side, 1 = held up at "found-it" pose. */
  setMagnifierLifted(t01: number): void;
  /** 1 = wide eyes, 0 = blinked closed. */
  setBlink(open01: number): void;
  /** Update billboarded face/yaw to look at the camera. Call each frame. */
  faceCamera(camera: THREE.Camera): void;
}

const CHARCOAL_DARK = 0x1a1d24;
const WHITE_GLOVE = 0xf1f3f7;
const FACE_TEX_SIZE = 256;

/**
 * Build the Bug Detective mascot.
 *
 * Head: Cursor IDE logo cube — viewed at canonical iso angle so 3 faces are
 * visible, each face split by the arrow-cursor silhouette into a darker
 * panel and a lighter panel (two-tone). Smile sits across the front
 * vertical corner edge with one eye on each visible front facet.
 *
 * Body: human-ish anatomy — torso, jointed shoulders+arms (upper-arm +
 * forearm + glove hand), thighs+shins. Stays low-poly + chunky like the
 * reference toy.
 */
export function createMascotMesh(): MascotMesh {
  const group = new THREE.Group();
  group.name = "mascot";

  // Materials
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

  // ---- Body skeleton --------------------------------------------------
  // Torso: capsule-ish (cylinder w/ rounded sphere caps)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, -0.15, 0);
  group.add(torsoGroup);

  const torsoGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.6, 16);
  const torso = new THREE.Mesh(torsoGeo, skinDarkMat);
  torso.castShadow = true;
  torso.receiveShadow = true;
  torsoGroup.add(torso);

  // Torso top cap (hides under head when looking down)
  const torsoCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    skinDarkMat,
  );
  torsoCap.position.y = 0.3;
  torsoGroup.add(torsoCap);

  // Hips bottom cap
  const hipCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    skinDarkMat,
  );
  hipCap.position.y = -0.3;
  torsoGroup.add(hipCap);

  // ---- Arms (left + right) -------------------------------------------
  // Each arm: shoulder ball + upper-arm cylinder + elbow ball + forearm
  // cylinder + hand glove. The right arm holds the magnifier.

  const armParts = (
    side: "L" | "R",
  ): { shoulder: THREE.Group; hand: THREE.Group } => {
    const sx = side === "L" ? -1 : 1;

    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.32, 0.22, 0);
    torsoGroup.add(shoulder);

    const shoulderBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 14, 10),
      skinDarkMat,
    );
    shoulderBall.castShadow = true;
    shoulder.add(shoulderBall);

    // Upper arm — cylinder hanging down + slightly forward
    const upperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.07, 0.28, 12),
      skinDarkMat,
    );
    upperArm.position.set(sx * 0.05, -0.16, 0.04);
    upperArm.rotation.z = sx * -0.2;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    // Elbow ball
    const elbow = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 10),
      skinDarkMat,
    );
    elbow.position.set(sx * 0.115, -0.32, 0.07);
    elbow.castShadow = true;
    shoulder.add(elbow);

    // Forearm — bent forward
    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.065, 0.25, 12),
      skinDarkMat,
    );
    forearm.position.set(sx * 0.13, -0.43, 0.18);
    forearm.rotation.x = -0.7;
    forearm.castShadow = true;
    shoulder.add(forearm);

    // Hand group at the end of forearm
    const hand = new THREE.Group();
    hand.position.set(sx * 0.14, -0.5, 0.32);
    shoulder.add(hand);

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

  // ---- Legs (left + right) -------------------------------------------
  const legParts = (side: "L" | "R"): void => {
    const sx = side === "L" ? -1 : 1;

    const hip = new THREE.Group();
    hip.position.set(sx * 0.15, -0.28, 0);
    torsoGroup.add(hip);

    // Thigh
    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.08, 0.28, 12),
      skinDarkMat,
    );
    thigh.position.y = -0.16;
    thigh.castShadow = true;
    hip.add(thigh);

    // Knee
    const knee = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 12, 10),
      skinDarkMat,
    );
    knee.position.y = -0.3;
    knee.castShadow = true;
    hip.add(knee);

    // Shin
    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.07, 0.26, 12),
      skinDarkMat,
    );
    shin.position.y = -0.45;
    shin.castShadow = true;
    hip.add(shin);

    // Foot
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.08, 0.22),
      skinDarkMat,
    );
    foot.position.set(0, -0.6, 0.04);
    foot.castShadow = true;
    hip.add(foot);
  };
  legParts("L");
  legParts("R");

  // ---- Head: Cursor cube at iso angle --------------------------------
  // The cube is rotated to its canonical iso pose so 3 faces point at the
  // camera. The "front vertical edge" is the spine of the smile — left
  // facet gets the left eye, right facet gets the right eye.
  const headGroup = new THREE.Group();
  // Place head above shoulders. Torso-top is at y ~ 0.4 in torsoGroup
  // local; torsoGroup is at y = -0.15 in mascot-local; so head sits at
  // mascot-local y = 0.55-ish.
  headGroup.position.set(0, 0.55, 0);
  // Rotate so a vertical edge (corner) points at camera.
  // 45° yaw puts the corner pointing +Z (toward camera).
  headGroup.rotation.y = Math.PI / 4;
  group.add(headGroup);

  const headEdge = 0.7;

  // Build the inner cube with PER-FACE materials so each face shows the
  // two-tone Cursor-logo split. BoxGeometry materials index order is:
  //   [+X, -X, +Y, -Y, +Z, -Z]
  //
  // After yaw +π/4 on Y, the visible faces (toward camera at +Z) are:
  //   +Z → front-RIGHT facet
  //   -X → front-LEFT facet
  //   +Y → top facet
  const headTextures = makeHeadFaceTextures();
  const headMats: THREE.Material[] = [
    // +X (back-right, not visible)
    new THREE.MeshStandardMaterial({ color: CHARCOAL_DARK }),
    // -X (front-LEFT facet)
    new THREE.MeshStandardMaterial({
      map: headTextures.frontLeft,
      roughness: 0.5,
      metalness: 0.05,
    }),
    // +Y (top facet)
    new THREE.MeshStandardMaterial({
      map: headTextures.top,
      roughness: 0.5,
      metalness: 0.05,
    }),
    // -Y (bottom, not visible)
    new THREE.MeshStandardMaterial({ color: CHARCOAL_DARK }),
    // +Z (front-RIGHT facet)
    new THREE.MeshStandardMaterial({
      map: headTextures.frontRight,
      roughness: 0.5,
      metalness: 0.05,
    }),
    // -Z (back-left, not visible)
    new THREE.MeshStandardMaterial({ color: CHARCOAL_DARK }),
  ];
  const headCube = new THREE.Mesh(
    new THREE.BoxGeometry(headEdge, headEdge, headEdge),
    headMats,
  );
  headCube.castShadow = true;
  headGroup.add(headCube);

  // Face anchor — used as a positional reference for blink / future tweaks.
  // The smile is baked into the head face textures (one eye per facet)
  // rather than a separate billboarded plane.
  const faceAnchor = new THREE.Object3D();
  faceAnchor.position.set(0, 0, 0);
  headGroup.add(faceAnchor);

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

  // ---- Magnifying glass parented to the right hand glove --------------
  const magnifier = new THREE.Group();
  magnifier.name = "magnifier";
  armR.hand.add(magnifier);

  const frameMat = new THREE.MeshStandardMaterial({
    color: CHARCOAL_DARK,
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

  const idlePos = new THREE.Vector3(0.04, -0.16, 0.0);
  const idleEuler = new THREE.Euler(0, 0, 0);
  const activePos = new THREE.Vector3(0.16, 0.05, 0.18);
  const activeEuler = new THREE.Euler(Math.PI / 2, 0, -0.3);

  const tmpQuatA = new THREE.Quaternion();
  const tmpQuatB = new THREE.Quaternion();
  const setMagnifierLifted = (t01: number): void => {
    const t = THREE.MathUtils.clamp(t01, 0, 1);
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

  const blinkVariants = headTextures.closed;
  const setBlink = (open01: number): void => {
    const closed = open01 < 0.5;
    const frontLeftMat = headMats[1] as THREE.MeshStandardMaterial;
    const topMat = headMats[2] as THREE.MeshStandardMaterial;
    const frontRightMat = headMats[4] as THREE.MeshStandardMaterial;
    if (closed) {
      frontLeftMat.map = blinkVariants.frontLeft;
      topMat.map = blinkVariants.top;
      frontRightMat.map = blinkVariants.frontRight;
    } else {
      frontLeftMat.map = headTextures.frontLeft;
      topMat.map = headTextures.top;
      frontRightMat.map = headTextures.frontRight;
    }
    frontLeftMat.needsUpdate = true;
    topMat.needsUpdate = true;
    frontRightMat.needsUpdate = true;
  };

  // Yaw the entire mascot so its +Z (which is the cube's front-corner
  // direction after the cube's local 45° yaw) points at the camera.
  const tmpCamPos = new THREE.Vector3();
  const tmpSelfPos = new THREE.Vector3();
  const faceCamera = (camera: THREE.Camera): void => {
    camera.getWorldPosition(tmpCamPos);
    group.getWorldPosition(tmpSelfPos);
    const dx = tmpCamPos.x - tmpSelfPos.x;
    const dz = tmpCamPos.z - tmpSelfPos.z;
    if (dx * dx + dz * dz > 1e-4) {
      group.rotation.y = Math.atan2(dx, dz);
    }
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

// ---------------------------------------------------------------------
// Head face textures
// Each face shows the Cursor-logo split: a triangular "arrow" panel in
// LIGHT, the rest of the face in DARK. The smile + eye are baked in.
// ---------------------------------------------------------------------

interface FaceTextureSet {
  frontLeft: THREE.CanvasTexture;
  frontRight: THREE.CanvasTexture;
  top: THREE.CanvasTexture;
  closed: {
    frontLeft: THREE.CanvasTexture;
    frontRight: THREE.CanvasTexture;
    top: THREE.CanvasTexture;
  };
}

function makeHeadFaceTextures(): FaceTextureSet {
  return {
    frontLeft: drawHeadFace("front-left", "open"),
    frontRight: drawHeadFace("front-right", "open"),
    top: drawHeadFace("top", "open"),
    closed: {
      frontLeft: drawHeadFace("front-left", "closed"),
      frontRight: drawHeadFace("front-right", "closed"),
      top: drawHeadFace("top", "closed"),
    },
  };
}

type FaceKind = "front-left" | "front-right" | "top";
type EyeMode = "open" | "closed";

const COLOR_DARK_HEX = "#1a1d24";
const COLOR_LIGHT_HEX = "#e8efff";

function drawHeadFace(kind: FaceKind, eyes: EyeMode): THREE.CanvasTexture {
  const size = FACE_TEX_SIZE;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  // The cube is yawed +π/4 around Y. After yaw:
  //   +Z face → front-LEFT facet (texture's RIGHT edge meets the corner)
  //   +X face → front-RIGHT facet (texture's LEFT edge meets the corner)
  //   +Y face → top facet
  //
  // Box face UVs in three.js have origin at bottom-left when the face is
  // viewed from outside (so the texture appears upright when applied).

  switch (kind) {
    case "front-left":
      // Background dark.
      ctx.fillStyle = COLOR_DARK_HEX;
      ctx.fillRect(0, 0, size, size);
      // Cursor-arrow LIGHT panel: triangular wedge starting at the corner
      // (right edge mid) and sweeping toward upper-left. Mirrors the shape
      // of the real Cursor logo's right-side panel.
      ctx.fillStyle = COLOR_LIGHT_HEX;
      ctx.beginPath();
      ctx.moveTo(size, size * 0.3);                // right edge (top of corner)
      ctx.lineTo(size * 0.2, size * 0.7);          // tip toward upper-left
      ctx.lineTo(size, size * 0.85);               // back to right edge bottom
      ctx.closePath();
      ctx.fill();
      // Right eye sits near the corner edge (right side of this facet).
      drawEye(ctx, size * 0.78, size * 0.5, size, eyes);
      // Half of smile — left half of the smile arc (this facet is on the
      // viewer's LEFT, so the smile leg starts at the corner and curves to
      // the LEFT side of the facet).
      ctx.lineWidth = size * 0.06;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#000";
      ctx.beginPath();
      ctx.moveTo(size * 0.99, size * 0.7);
      ctx.quadraticCurveTo(size * 0.78, size * 0.84, size * 0.55, size * 0.68);
      ctx.stroke();
      break;

    case "front-right":
      ctx.fillStyle = COLOR_LIGHT_HEX;
      ctx.fillRect(0, 0, size, size);
      // Cursor-arrow DARK panel on the lighter facet (the toy reference
      // photo's right facet is the lighter one, so we invert the colors).
      ctx.fillStyle = COLOR_DARK_HEX;
      ctx.beginPath();
      ctx.moveTo(0, size * 0.3);
      ctx.lineTo(size * 0.8, size * 0.7);
      ctx.lineTo(0, size * 0.85);
      ctx.closePath();
      ctx.fill();
      // Left eye sits near the corner edge (left side of this facet).
      drawEye(ctx, size * 0.22, size * 0.5, size, eyes);
      // Right half of smile.
      ctx.lineWidth = size * 0.06;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#000";
      ctx.beginPath();
      ctx.moveTo(size * 0.01, size * 0.7);
      ctx.quadraticCurveTo(size * 0.22, size * 0.84, size * 0.45, size * 0.68);
      ctx.stroke();
      break;

    case "top":
      ctx.fillStyle = COLOR_DARK_HEX;
      ctx.fillRect(0, 0, size, size);
      // Top arrow: lighter triangle pointing toward the front corner.
      ctx.fillStyle = COLOR_LIGHT_HEX;
      ctx.beginPath();
      ctx.moveTo(size * 0.2, size * 0.85);     // back-left
      ctx.lineTo(size * 0.85, size * 0.2);     // far-right
      ctx.lineTo(size * 0.85, size * 0.85);    // front corner (closer)
      ctx.closePath();
      ctx.fill();
      break;
    default:
      throw new Error(`unknown face kind: ${kind as string}`);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  eyes: EyeMode,
): void {
  const r = size * 0.09;
  ctx.fillStyle = "#000";
  if (eyes === "open") {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = size * 0.04;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.stroke();
  }
}

