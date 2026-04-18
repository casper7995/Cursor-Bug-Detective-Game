import * as THREE from "three";

/**
 * Build a believable "personal homepage" texture procedurally so we don't
 * ship any image assets. The texture fills the viewport during the wow
 * opener and is then peeled away to reveal the diorama.
 */
export function makeFakePageTexture(width: number, height: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable for fake page texture");

  // Page background — warm off-white.
  ctx.fillStyle = "#f7f4ed";
  ctx.fillRect(0, 0, width, height);

  // Top nav bar
  const navH = Math.max(48, height * 0.08);
  ctx.fillStyle = "#1f2330";
  ctx.fillRect(0, 0, width, navH);
  ctx.fillStyle = "#e8efff";
  ctx.font = `${Math.floor(navH * 0.42)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("welcome.html", width * 0.04, navH / 2);
  ctx.textAlign = "right";
  ctx.font = `${Math.floor(navH * 0.34)}px ui-sans-serif, system-ui, sans-serif`;
  const navItems = ["home", "about", "blog", "contact"];
  let nx = width * 0.96;
  for (let i = navItems.length - 1; i >= 0; i--) {
    const w = ctx.measureText(navItems[i] ?? "").width;
    ctx.fillText(navItems[i] ?? "", nx, navH / 2);
    nx -= w + width * 0.03;
  }

  // Big serif headline
  const headlineY = navH + height * 0.18;
  ctx.fillStyle = "#1f2330";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${Math.floor(height * 0.09)}px Georgia, "Times New Roman", serif`;
  ctx.fillText("welcome to my page", width * 0.07, headlineY);

  // Subtitle
  ctx.fillStyle = "#6f7080";
  ctx.font = `400 ${Math.floor(height * 0.025)}px ui-sans-serif, sans-serif`;
  ctx.fillText(
    "a small corner of the internet · last updated today",
    width * 0.07,
    headlineY + height * 0.045,
  );

  // Body paragraph (lorem ipsum-ish, drawn as text rules to keep it crisp)
  ctx.fillStyle = "#2a2d36";
  ctx.font = `400 ${Math.floor(height * 0.022)}px ui-sans-serif, sans-serif`;
  const lines = [
    "I write here when I have a thought worth keeping. Lately I have been",
    "thinking about cursors — the way they trail behind your eyes, the way",
    "they wait for you. Sometimes I forget mine is mine. Sometimes it does",
    "things I do not remember asking it to do. Maybe that is fine. Maybe",
    "everything in here is fine.",
  ];
  let ly = headlineY + height * 0.11;
  for (const line of lines) {
    ctx.fillText(line, width * 0.07, ly);
    ly += height * 0.032;
  }

  // Two faint placeholder image cards
  const cardY = ly + height * 0.04;
  const cardW = width * 0.4;
  const cardH = height * 0.16;
  for (let i = 0; i < 2; i++) {
    const x = width * 0.07 + i * (cardW + width * 0.04);
    ctx.fillStyle = "#e3deca";
    ctx.fillRect(x, cardY, cardW, cardH);
    ctx.strokeStyle = "#cbc5b0";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, cardY + 0.5, cardW - 1, cardH - 1);
    ctx.fillStyle = "#aaa492";
    ctx.font = `${Math.floor(height * 0.022)}px ui-sans-serif, sans-serif`;
    ctx.fillText(i === 0 ? "[a photo I took]" : "[another photo]", x + 16, cardY + cardH - 16);
  }

  // Footer
  const footerY = height - height * 0.05;
  ctx.fillStyle = "#9aa0b0";
  ctx.font = `${Math.floor(height * 0.018)}px ui-sans-serif, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("© me, today, this room", width / 2, footerY);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export interface PagePeel {
  readonly mesh: THREE.Mesh;
  readonly texture: THREE.CanvasTexture;
  /** Begin the peel animation. */
  start(): void;
  /** Per-frame animation tick. dt in seconds. */
  update(dtSec: number): void;
  /** 0 = page fully covers; 1 = page fully gone. */
  readonly progress01: number;
  readonly done: boolean;
  onComplete(handler: () => void): void;
}

const PEEL_DURATION_SEC = 1.4;

export interface PagePeelOptions {
  width: number;
  height: number;
  /** World-space center of the plane. */
  center: THREE.Vector3;
  /** Plane segments (higher = smoother peel curl). */
  segments?: number;
}

/**
 * The page is a high-resolution PlaneGeometry with a vertex shader that rolls
 * the bottom edge upward over time. Peel direction is from bottom to top.
 *
 * If `USE_PEEL_SHADER = false` the peel becomes a simple opacity/scale fade.
 * Day 6 decision gate flips this if the shader doesn't sell.
 */
export const USE_PEEL_SHADER = true;

export function createPagePeel(opts: PagePeelOptions): PagePeel {
  const segments = opts.segments ?? 96;
  const geo = new THREE.PlaneGeometry(
    opts.width,
    opts.height,
    segments,
    segments,
  );
  const tex = makeFakePageTexture(1024, Math.floor(1024 * (opts.height / opts.width)));

  const uniforms = {
    uMap: { value: tex },
    uPeel: { value: -0.05 },
    uPlaneHeight: { value: opts.height },
    uOpacity: { value: 1.0 },
  };

  const material: THREE.ShaderMaterial | THREE.MeshBasicMaterial = USE_PEEL_SHADER
    ? new THREE.ShaderMaterial({
        uniforms,
        side: THREE.DoubleSide,
        transparent: true,
        vertexShader: PEEL_VERT,
        fragmentShader: PEEL_FRAG,
      })
    : new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.DoubleSide,
        transparent: true,
      });

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(opts.center);
  mesh.renderOrder = 100; // draw on top of diorama during intro
  mesh.frustumCulled = false;

  let started = false;
  let elapsed = 0;
  let done = false;
  let onCompleteHandler: (() => void) | null = null;

  function start(): void {
    started = true;
    elapsed = 0;
    done = false;
  }

  function update(dtSec: number): void {
    if (!started || done) return;
    elapsed += dtSec;
    const t = Math.min(1, elapsed / PEEL_DURATION_SEC);
    // Ease-out cubic so the peel snaps off at the end.
    const eased = 1 - Math.pow(1 - t, 3);
    const peelValue = -0.05 + eased * 1.2; // overshoot to fully clear
    if (USE_PEEL_SHADER) {
      uniforms.uPeel.value = peelValue;
    } else {
      // Fallback fade.
      const m = mesh.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, 1 - t * 1.4);
      mesh.scale.setScalar(1 + t * 0.05);
    }
    if (t >= 1) {
      done = true;
      mesh.visible = false;
      onCompleteHandler?.();
    }
  }

  return {
    mesh,
    texture: tex,
    start,
    update,
    get progress01() {
      return Math.min(1, elapsed / PEEL_DURATION_SEC);
    },
    get done() {
      return done;
    },
    onComplete(handler) {
      onCompleteHandler = handler;
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
