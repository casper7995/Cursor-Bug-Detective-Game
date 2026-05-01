/**
 * Vibe Jam 2026 portal — exit + return rings for the Vibeverse interlink.
 *
 * Spec: vibej.am/2026 (sample at https://gist.github.com/levelsio/ffdbfe356b421b97a31664ded4bc961d).
 *
 * Bug Detective is a static-camera click-to-investigate puzzle (no
 * free-roam character collision), so portal "entry" is a click on the
 * ring mesh — not a Box3 intersection like in the reference gist.
 *
 * Public surface:
 *   - parsePortalParams(search)   — extract stored portal params from URL
 *   - buildExitUrl(stored, refHost) — destination on click of EXIT portal
 *   - buildReturnUrl(refHost, stored) — destination on click of RETURN portal
 *   - createExitPortal(scene)     — Cursor-orange torus + label, always shown
 *   - createReturnPortal(scene, refHost) — cyan torus + "← <host>" label,
 *                                          only shown when arrivedViaPortal
 */

import * as THREE from "three";

export const VIBE_JAM_PORTAL_HOST = "vibejam.cc";
export const BUG_DETECTIVE_REF = "bug-detective.pages.dev";

/** Keys forwarded verbatim from the source portal URL when present. */
const FORWARD_KEYS = [
  "username",
  "color",
  "speed",
  "ref",
  "avatar_url",
  "team",
  "hp",
  "speed_x",
  "speed_y",
  "speed_z",
  "rotation_x",
  "rotation_y",
  "rotation_z",
] as const;

export type StoredPortalParams = Readonly<Record<string, string>>;

/**
 * Read every relevant portal param off a URLSearchParams-like input.
 * Empty/blank values are dropped so they don't pollute outbound URLs.
 *
 * Per spec ("All parameters except portal are optional"), this is
 * permissive — bad/non-numeric values are kept as strings; the receiving
 * game decides whether to coerce. We do *light* sanitation for known
 * numeric ranges (hp 0-100, speed numeric) only when the value would
 * otherwise be obviously broken.
 */
export function parsePortalParams(search: string | URLSearchParams): {
  arrivedViaPortal: boolean;
  stored: StoredPortalParams;
} {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const arrivedViaPortal = params.get("portal") === "true";
  const out: Record<string, string> = {};
  for (const key of FORWARD_KEYS) {
    const raw = params.get(key);
    if (raw == null) continue;
    const v = raw.trim();
    if (v === "") continue;
    if (
      key === "speed" ||
      key.startsWith("speed_") ||
      key.startsWith("rotation_")
    ) {
      // Numeric fields: drop if not finite. Other senders may pass these.
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
    }
    if (key === "hp") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) continue;
    }
    out[key] = v;
  }
  return { arrivedViaPortal, stored: out };
}

/** Strip protocol and trailing slashes from a possibly-bare host string. */
export function normalizeRefHost(refHost: string): string {
  return refHost
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

/**
 * Destination when the player clicks the EXIT portal — sends them to the
 * Vibe Jam 2026 portal hub with whatever profile params they arrived with,
 * plus our `ref` so the next game can place a return portal back.
 */
export function buildExitUrl(
  stored: StoredPortalParams,
  refHost: string = BUG_DETECTIVE_REF,
): string {
  const params = new URLSearchParams();
  // Forward stored params (excluding `ref` — we'll set our own).
  for (const [k, v] of Object.entries(stored)) {
    if (k === "ref") continue;
    params.set(k, v);
  }
  params.set("ref", normalizeRefHost(refHost));
  return `https://${VIBE_JAM_PORTAL_HOST}/portal/2026?${params.toString()}`;
}

/**
 * Destination when the player clicks the RETURN portal — sends them
 * back to the source game (?ref=... that brought them here) with
 * `portal=true` and all stored params so that game can place them.
 *
 * Returns null when refHost is missing/blank — caller should not show
 * a return portal in that case.
 */
export function buildReturnUrl(
  refHost: string,
  stored: StoredPortalParams,
): string | null {
  const host = normalizeRefHost(refHost);
  if (!host) return null;
  const params = new URLSearchParams();
  params.set("portal", "true");
  for (const [k, v] of Object.entries(stored)) {
    if (k === "portal") continue;
    if (k === "ref") continue; // ref is the source we're returning to
    params.set(k, v);
  }
  return `https://${host}/?${params.toString()}`;
}

// ---------------------------------------------------------------------
// Mesh construction
// ---------------------------------------------------------------------

const CURSOR_ORANGE = 0xf54e00;
const CURSOR_CYAN = 0x7be0ff;

export interface PortalHandle {
  /** Top-level group; add to scene. */
  readonly group: THREE.Group;
  /** Mesh used for raycaster hit-tests (the inner disc fills the ring). */
  readonly hitTarget: THREE.Object3D;
  /** Drive the pulse animation; call once per frame with elapsed seconds. */
  step(elapsedSec: number): void;
  /** Free GPU resources when the scene is torn down. */
  dispose(): void;
}

interface BuildPortalOpts {
  readonly color: number;
  readonly label: string;
  readonly position: THREE.Vector3;
  /** Y-axis rotation so the disc faces the camera roughly. */
  readonly facingY: number;
  /** Outer ring radius (scene units). */
  readonly radius: number;
  /** userData.tag string for raycaster routing. */
  readonly tag: string;
}

function buildPortalGroup(opts: BuildPortalOpts): PortalHandle {
  const { color, label, position, facingY, radius, tag } = opts;
  const group = new THREE.Group();
  group.name = `vibe-jam-portal-${tag}`;
  group.position.copy(position);
  group.rotation.y = facingY;

  const tube = radius * 0.14;
  const torusGeo = new THREE.TorusGeometry(radius, tube, 18, 64);
  const torusMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.4,
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    opacity: 0.92,
  });
  const torus = new THREE.Mesh(torusGeo, torusMat);
  torus.castShadow = false;
  torus.receiveShadow = false;
  group.add(torus);

  // Inner disc — slightly translucent, doubles as the click hit target.
  const discGeo = new THREE.CircleGeometry(radius * 0.92, 48);
  const discMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.userData.tag = tag;
  disc.userData.isPortal = true;
  group.add(disc);

  // Label sprite floating above the ring.
  const sprite = makeLabelSprite(label, color);
  sprite.position.set(0, radius * 1.35, 0);
  sprite.scale.set(radius * 3.2, radius * 0.8, 1);
  group.add(sprite);

  // Make the torus also a hit target with the same tag so off-center
  // ray hits still register a portal click.
  torus.userData.tag = tag;
  torus.userData.isPortal = true;

  const baseEmissive = 1.4;
  const baseOpacity = 0.42;
  return {
    group,
    hitTarget: disc,
    step(elapsedSec: number): void {
      const pulse = 0.5 + 0.5 * Math.sin(elapsedSec * 2.4);
      torusMat.emissiveIntensity = baseEmissive + pulse * 0.7;
      discMat.opacity = baseOpacity + pulse * 0.18;
      const wob = 0.04 * Math.sin(elapsedSec * 1.6);
      group.position.y = position.y + wob;
      group.rotation.z = 0.05 * Math.sin(elapsedSec * 0.9);
    },
    dispose(): void {
      torusGeo.dispose();
      torusMat.dispose();
      discGeo.dispose();
      discMat.dispose();
      const spriteMat = sprite.material as THREE.SpriteMaterial;
      spriteMat.map?.dispose();
      spriteMat.dispose();
      group.parent?.remove(group);
    },
  };
}

function makeLabelSprite(text: string, colorHex: number): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable for portal label");
  ctx.clearRect(0, 0, c.width, c.height);
  // Soft halo so text stays legible against the desk.
  ctx.fillStyle = "rgba(10,12,18,0.55)";
  roundedRect(ctx, 6, 18, c.width - 12, c.height - 36, 26);
  ctx.fill();
  const css = `#${colorHex.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = css;
  ctx.font = "bold 44px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = css;
  ctx.shadowBlur = 18;
  ctx.fillText(text, c.width / 2, c.height / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  return sprite;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * Tag carried by the EXIT portal's hit meshes — clicks routed by tag
 * are mapped back to portal-exit URL navigation in main.ts.
 */
export const PORTAL_TAG_EXIT = "portal-exit";
/** Tag for the RETURN portal (only present when ?portal=true on boot). */
export const PORTAL_TAG_RETURN = "portal-return";

/**
 * Standing visibly to the back-left of the desk so the ring frames the
 * mascot without colliding with monitor / keyboard / props. Off-desk in
 * world space (not on the desk surface) so it does NOT need a
 * mascotFootObstacles entry.
 */
const EXIT_PORTAL_POS = new THREE.Vector3(-3.2, 0.55, -1.0);
const EXIT_PORTAL_RADIUS = 0.42;
/** Yaw so the disc faces the camera at GAME_CAMERA_POS = (3.2, 2.4, 5.2). */
const EXIT_PORTAL_FACING_Y = Math.atan2(
  3.2 - EXIT_PORTAL_POS.x,
  5.2 - EXIT_PORTAL_POS.z,
);

const RETURN_PORTAL_POS = new THREE.Vector3(2.6, 0.55, -1.0);
const RETURN_PORTAL_RADIUS = 0.38;
const RETURN_PORTAL_FACING_Y = Math.atan2(
  3.2 - RETURN_PORTAL_POS.x,
  5.2 - RETURN_PORTAL_POS.z,
);

export function createExitPortal(scene: THREE.Scene): PortalHandle {
  const handle = buildPortalGroup({
    color: CURSOR_ORANGE,
    label: "VIBE JAM PORTAL",
    position: EXIT_PORTAL_POS,
    facingY: EXIT_PORTAL_FACING_Y,
    radius: EXIT_PORTAL_RADIUS,
    tag: PORTAL_TAG_EXIT,
  });
  scene.add(handle.group);
  return handle;
}

export function createReturnPortal(
  scene: THREE.Scene,
  refHost: string,
): PortalHandle {
  const host = normalizeRefHost(refHost) || "back";
  const handle = buildPortalGroup({
    color: CURSOR_CYAN,
    label: `← ${host}`,
    position: RETURN_PORTAL_POS,
    facingY: RETURN_PORTAL_FACING_Y,
    radius: RETURN_PORTAL_RADIUS,
    tag: PORTAL_TAG_RETURN,
  });
  scene.add(handle.group);
  return handle;
}
