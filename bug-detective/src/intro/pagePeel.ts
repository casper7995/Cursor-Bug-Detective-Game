import * as THREE from "three";
import {
  CASE_FILE_BODY_LINES,
  CASE_FILE_TAGLINE,
} from "../ui/gameInstructions";

/** Base width for case-file art; real canvas scales by DPR (max 2×) so the peel looks sharp on Retina. */
const CASE_FILE_TEX_BASE_W = 1024;
const CASE_FILE_TEX_MAX_W = 4096;

function caseFileTexturePixelSize(
  baseW: number,
  baseH: number,
): { w: number; h: number } {
  const dpr =
    typeof window !== "undefined"
      ? Math.min(2, window.devicePixelRatio || 1)
      : 1;
  const w = Math.min(
    CASE_FILE_TEX_MAX_W,
    Math.max(CASE_FILE_TEX_BASE_W, Math.round(baseW * dpr)),
  );
  const h = Math.max(1, Math.floor((w * baseH) / baseW));
  return { w, h };
}

function drawFingerprintEvidenceCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pageH: number,
): void {
  ctx.save();
  ctx.fillStyle = "#e8dcc8";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#bdaa94";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const cx = x + w * 0.42;
  const cy = y + h * 0.4;
  ctx.strokeStyle = "rgba(70, 62, 52, 0.35)";
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 9; i++) {
    const r = 18 + i * 9;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.15, Math.PI * 0.72);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(90, 78, 64, 0.5)";
  ctx.beginPath();
  ctx.arc(cx + 2, cy - 1, 38, -0.2, 1.1);
  ctx.stroke();
  const smudge = ctx.createRadialGradient(
    cx + 22,
    cy + 10,
    4,
    cx + 18,
    cy + 14,
    48,
  );
  smudge.addColorStop(0, "rgba(120, 95, 70, 0.22)");
  smudge.addColorStop(1, "rgba(120, 95, 70, 0)");
  ctx.fillStyle = smudge;
  ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  ctx.fillStyle = "#5c5348";
  ctx.font = `500 ${Math.floor(pageH * 0.018)}px ui-sans-serif, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("Print · sample 03 — partial", x + 12, y + h - 10);
  ctx.restore();
}

function drawClueTagEvidenceCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pageH: number,
): void {
  ctx.save();
  const tagW = w - 6;
  const tagH = h - 4;
  const tx = x + 3;
  const ty = y + 6;
  ctx.fillStyle = "#f2ece3";
  ctx.beginPath();
  ctx.moveTo(tx + 10, ty);
  ctx.lineTo(tx + tagW - 10, ty);
  ctx.quadraticCurveTo(tx + tagW, ty, tx + tagW, ty + 10);
  ctx.lineTo(tx + tagW, ty + tagH - 10);
  ctx.quadraticCurveTo(tx + tagW, ty + tagH, tx + tagW - 10, ty + tagH);
  ctx.lineTo(tx + 10, ty + tagH);
  ctx.quadraticCurveTo(tx, ty + tagH, tx, ty + tagH - 10);
  ctx.lineTo(tx, ty + 10);
  ctx.quadraticCurveTo(tx, ty, tx + 10, ty);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#c9bfa8";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.strokeStyle = "#a89880";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(tx + tagW * 0.5, ty + 18, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#f2ece3";
  ctx.beginPath();
  ctx.arc(tx + tagW * 0.5, ty + 18, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8a7a68";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tx + tagW * 0.5, ty + 6);
  ctx.quadraticCurveTo(tx + tagW * 0.5 - 8, ty - 2, tx + tagW * 0.42, ty - 10);
  ctx.stroke();
  ctx.strokeStyle = "rgba(100, 90, 78, 0.25)";
  for (let i = 0; i < 4; i++) {
    const ly = ty + 34 + i * 14;
    ctx.beginPath();
    ctx.moveTo(tx + 14, ly);
    ctx.lineTo(tx + tagW - 14, ly);
    ctx.stroke();
  }
  ctx.fillStyle = "#6a6258";
  ctx.font = `500 ${Math.floor(pageH * 0.017)}px ui-sans-serif, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("Tag · ID 0427 — chain of custody", tx + 12, ty + tagH - 8);
  ctx.restore();
}

/**
 * Build a "case file cover" texture procedurally so we don't ship image
 * assets. The texture fills the viewport during the wow opener and is
 * then peeled away to reveal the diorama.
 */
export function makeFakePageTexture(
  baseW: number,
  baseH: number,
): THREE.CanvasTexture {
  const { w: cw, h: ch } = caseFileTexturePixelSize(baseW, baseH);
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2d context unavailable for fake page texture");

  // Page background — warm off-white.
  ctx.fillStyle = "#f7f4ed";
  ctx.fillRect(0, 0, cw, ch);

  // Top nav bar
  const navH = Math.max(48, ch * 0.08);
  ctx.fillStyle = "#1f2330";
  ctx.fillRect(0, 0, cw, navH);
  ctx.fillStyle = "#e8efff";
  ctx.font = `${Math.floor(navH * 0.42)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("case-file.html", cw * 0.04, navH / 2);
  ctx.textAlign = "right";
  ctx.font = `${Math.floor(navH * 0.34)}px ui-sans-serif, system-ui, sans-serif`;
  const navItems = ["evidence", "timeline", "notes", "archive"];
  const navLinkGap = cw * 0.028;
  const navRightMargin = cw * 0.06;
  let nx = cw - navRightMargin;
  for (let i = navItems.length - 1; i >= 0; i--) {
    const tw = ctx.measureText(navItems[i] ?? "").width;
    ctx.fillText(navItems[i] ?? "", nx, navH / 2);
    nx -= tw + navLinkGap;
  }

  // Big serif headline — fit to ~7% margins left/right (max width 86% of canvas)
  const marginXL = cw * 0.07;
  const maxHeadlineWidth = cw * 0.86;
  const HEADLINE = "OPEN INVESTIGATION";
  let headlineFontPx = Math.floor(ch * 0.078);
  const minHeadlinePx = Math.max(20, Math.floor(ch * 0.042));
  const headlineY = navH + ch * 0.18;
  ctx.fillStyle = "#1f2330";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (;;) {
    ctx.font = `700 ${headlineFontPx}px Georgia, "Times New Roman", serif`;
    if (ctx.measureText(HEADLINE).width <= maxHeadlineWidth) break;
    headlineFontPx -= 1;
    if (headlineFontPx < minHeadlinePx) {
      ctx.font = `700 ${minHeadlinePx}px Georgia, "Times New Roman", serif`;
      headlineFontPx = minHeadlinePx;
      break;
    }
  }
  ctx.fillText(HEADLINE, marginXL, headlineY);

  // Subtitle — gap scales slightly with final headline size
  const subY =
    headlineY + Math.max(ch * 0.048, headlineFontPx * 0.72 + ch * 0.02);
  ctx.fillStyle = "#6f7080";
  ctx.font = `400 ${Math.floor(ch * 0.024)}px ui-sans-serif, sans-serif`;
  ctx.fillText(CASE_FILE_TAGLINE, marginXL, subY);

  // How to play + flavor (shared copy with optional DOM modal)
  let ly = subY + ch * 0.055;
  const lineStep = ch * 0.032;
  const marginX = cw * 0.07;
  for (let i = 0; i < CASE_FILE_BODY_LINES.length; i++) {
    const line = CASE_FILE_BODY_LINES[i] ?? "";
    if (line === "HOW TO PLAY") {
      ctx.fillStyle = "#c45a18";
      ctx.font = `700 ${Math.floor(ch * 0.024)}px ui-sans-serif, sans-serif`;
      ctx.fillText(line, marginX, ly);
      ly += lineStep * 1.25;
      ctx.fillStyle = "#2a2d36";
      ctx.font = `400 ${Math.floor(ch * 0.019)}px ui-sans-serif, sans-serif`;
      continue;
    }
    if (line.length === 0) {
      ly += lineStep * 0.6;
      continue;
    }
    ctx.fillStyle = "#2a2d36";
    ctx.font = `400 ${Math.floor(ch * 0.019)}px ui-sans-serif, sans-serif`;
    ctx.fillText(line, marginX, ly);
    ly += lineStep;
  }

  // Evidence-style thumbnails (same footprint as former placeholders)
  const cardY = ly + ch * 0.042;
  const cardW = cw * 0.4;
  const cardH = ch * 0.12;
  const gap = cw * 0.04;
  const leftX = cw * 0.07;
  drawFingerprintEvidenceCard(ctx, leftX, cardY, cardW, cardH, ch);
  drawClueTagEvidenceCard(ctx, leftX + cardW + gap, cardY, cardW, cardH, ch);

  // Footer — always below the cards, and (when there is room) high enough to clear the fixed CTA
  const cardBottom = cardY + cardH;
  const minBelowCards = cardBottom + ch * 0.038;
  const targetClearCta = ch * 0.796;
  const footerY = Math.min(ch * 0.88, Math.max(minBelowCards, targetClearCta));
  ctx.fillStyle = "#9aa0b0";
  ctx.font = `${Math.floor(ch * 0.018)}px ui-sans-serif, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(
    "Cursor Detective · case jacket (discard after peel)",
    cw / 2,
    footerY,
  );

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Ruled blank sheet for the `blank-book` anomaly (retargeted to desk case file).
 */
export function makeCaseFileBlankDeskTexture(
  baseW: number,
  baseH: number,
): THREE.CanvasTexture {
  const { w: cw, h: ch } = caseFileTexturePixelSize(baseW, baseH);
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = "#f7f4ed";
  ctx.fillRect(0, 0, cw, ch);
  const navH = Math.max(40, ch * 0.07);
  ctx.fillStyle = "#1f2330";
  ctx.fillRect(0, 0, cw, navH);
  ctx.fillStyle = "#e8efff";
  ctx.font = `${Math.floor(navH * 0.38)}px ui-sans-serif, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText("case-file.html", cw * 0.04, navH / 2);
  ctx.fillStyle = "#9aa0b0";
  ctx.font = `${Math.floor(ch * 0.022)}px ui-sans-serif, sans-serif`;
  ctx.fillText("No body copy — strangely silent.", cw * 0.06, navH + 36);
  const lineTop = navH + 56;
  const lineBot = ch - 24;
  const n = 22;
  for (let i = 0; i < n; i++) {
    const y = lineTop + (i / (n - 1)) * (lineBot - lineTop);
    ctx.fillStyle = "rgba(42, 45, 54, 0.14)";
    ctx.fillRect(cw * 0.06, y, cw * 0.88, 1.2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export interface PagePeel {
  readonly mesh: THREE.Mesh;
  /** Begin the peel animation. */
  start(): void;
  /** Per-frame animation tick. dt in seconds. */
  update(dtSec: number): void;
  /** 0 = page fully covers; 1 = page fully gone. */
  readonly progress01: number;
  readonly done: boolean;
}

const PEEL_DURATION_SEC = 2.65;

export interface PagePeelOptions {
  width: number;
  height: number;
  /** World-space center of the plane. */
  center: THREE.Vector3;
  /**
   * Plane segments. The peel curls along Y, so we want more vertical
   * density than horizontal. Defaults are tuned for a smooth curve.
   */
  segmentsX?: number;
  segmentsY?: number;
}

/**
 * The page is a PlaneGeometry with a vertex shader that rolls the bottom
 * edge upward over time. Peel direction is from bottom to top. The shader
 * is the only renderer — the previous fallback opacity-fade was retired
 * after the Day 6 decision gate (it never shipped).
 */
export function createPagePeel(opts: PagePeelOptions): PagePeel {
  // Peel curl is cylindrical along Y, so density only matters vertically.
  // 16×64 (=1k verts) replaces the original 96×96 (=9k verts) without any
  // visible difference at game zoom.
  const segX = opts.segmentsX ?? 16;
  const segY = opts.segmentsY ?? 64;
  const geo = new THREE.PlaneGeometry(opts.width, opts.height, segX, segY);
  const tex = makeFakePageTexture(
    1024,
    Math.floor(1024 * (opts.height / opts.width)),
  );

  const uniforms = {
    uMap: { value: tex },
    uPeel: { value: -0.05 },
    uPlaneHeight: { value: opts.height },
    uOpacity: { value: 1.0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    transparent: true,
    vertexShader: PEEL_VERT,
    fragmentShader: PEEL_FRAG,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(opts.center);
  mesh.renderOrder = 100; // draw on top of diorama during intro
  mesh.frustumCulled = false;

  let started = false;
  let elapsed = 0;
  let done = false;

  function start(): void {
    started = true;
    elapsed = 0;
    done = false;
  }

  function update(dtSec: number): void {
    if (!started || done) return;
    elapsed += dtSec;
    const t = Math.min(1, elapsed / PEEL_DURATION_SEC);
    // Smoothstep: gentle start/end so the curl reads less "snappy".
    const eased = t * t * (3 - 2 * t);
    uniforms.uPeel.value = -0.05 + eased * 1.02; // gentler curl; still clears frame
    if (t >= 1) {
      done = true;
      mesh.visible = false;
    }
  }

  return {
    mesh,
    start,
    update,
    get progress01() {
      return Math.min(1, elapsed / PEEL_DURATION_SEC);
    },
    get done() {
      return done;
    },
  };
}

const PEEL_VERT = /* glsl */ `
  uniform float uPeel;
  uniform float uPlaneHeight;
  varying vec2 vUv;
  varying float vCurl;

  void main() {
    vUv = uv;
    vec3 p = position;
    float bottom = -uPlaneHeight * 0.5;
    float distFromBottom = (p.y - bottom);
    float relative = distFromBottom / uPlaneHeight; // 0 at bottom, 1 at top
    // Front edge of the peel sweeps from -0.05 -> 1.15 over time. When the
    // current vertex is below the front edge, it curls forward.
    float front = relative - uPeel;
    float curlAmt = clamp(-front * 4.0, 0.0, 1.5);
    vCurl = curlAmt;
    float curlAngle = curlAmt * 2.4;
    float c = cos(curlAngle);
    float s = sin(curlAngle);
    // Rotate around X-axis at the front edge (y = bottom + uPeel*planeHeight)
    float pivotY = bottom + uPeel * uPlaneHeight;
    float dy = p.y - pivotY;
    vec3 q = p;
    q.y = pivotY + dy * c;
    q.z = p.z + dy * s + curlAmt * 0.05;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0);
  }
`;

const PEEL_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vCurl;

  void main() {
    vec4 c = texture2D(uMap, vUv);
    // Slight darkening on the curled side for a paper feel.
    float shade = 1.0 - vCurl * 0.18;
    gl_FragColor = vec4(c.rgb * shade, c.a * uOpacity);
  }
`;
