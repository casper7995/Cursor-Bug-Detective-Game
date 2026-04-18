# Bug Detective — Cross-browser audit (Day 10)

This is a code-level compatibility audit performed against the latest
desktop versions of Chrome, Safari, and Firefox (as of Apr 2026). Live
matrix testing on Safari + Firefox is the user's job (see
`DEPLOY.md` § 3); this audit catches the issues we know to expect.

## Audit results & fixes applied

### ✅ Audio API

- `AudioContext` constructor: falls back to `webkitAudioContext` for
  older Safari (`src/audio/audio.ts:11-13`). Modern Safari 14+ ships
  `AudioContext` directly so this is belt-and-suspenders.
- All sound nodes resume on the first user `pointerdown` / `keydown`
  per Chrome / Safari autoplay policy.
- Mute state recoverable on every browser via the M hotkey + Settings
  panel toggle.

### ✅ localStorage in private/incognito

- All `localStorage` access is wrapped in `try/catch`:
  - `src/audio/audio.ts:30, 56` (mute state)
  - `src/ui/skipIntroPref.ts` (skip-intro pref)
  - `src/ui/streakOutro.ts` (streak counter)
  - `src/main.ts:259-264` — fixed in this audit; previously raw
    access could throw a `SecurityError` in Safari Private Browsing.
- Behavior in private mode: features degrade silently to defaults
  (sound on, intro plays, streak resets per session).

### ✅ Web Share API

- `src/main.ts` share handler:
  - Guards on `navigator.canShare` existence.
  - Uses `canShare(data)` to confirm the file payload is supported
    before invoking `share()`.
  - Falls through to `window.open(tweetIntent(...))` when share API
    or file payload is unsupported (Firefox desktop, older Safari).

### ✅ MeshPhysicalMaterial.transmission

- Three.js r155+ requires WebGL2 + a non-zero `scene.environment` for
  transmission to render. Both are satisfied:
  - `WebGLRenderer` defaults to WebGL2 in current Three.js.
  - `scene.environment` is set from a `RoomEnvironment` PMREM in
    `src/three/createScene.ts:30-32`.
- Graceful degradation: if a browser refuses transmission (very old
  Safari < 16.4), the mascot's glass shell renders as an opaque
  light-grey cube — the smiley face inside (which is on the head
  cube, not the shell) remains visible.

### ✅ CSS backdrop-filter

- Added `-webkit-backdrop-filter` prefix alongside the standard
  `backdrop-filter` in three places (Safari < 18 still requires the
  prefix on macOS and iOS):
  - `src/ui/answerPanel.ts` — answer overlay blur
  - `src/ui/resultsPanel.ts` — results overlay blur
  - `src/ui/settingsPanel.ts` — gear button blur

### ✅ WebGL availability fallback

- `createSceneBundle()` now wraps the `WebGLRenderer` constructor in a
  try/catch and throws a typed `WebGLUnsupportedError`. `bootGame`
  catches it and renders a friendly "WebGL is required" card instead
  of a stack trace into the void. Affects: very old browsers,
  hardware-acceleration-disabled enterprise installs, headless modes.

### ✅ Pointer / touch events

- `CursorTracker` listens for both `mousemove` and `touchmove` (the
  native touch event, not pointer events) so the mascot tracks on
  touch devices that fire `touchmove` during drag.
- The simplified flow uses `pointerdown` (Chrome/Edge/Firefox/Safari
  all support) AND `touchstart` as a fallback for engines that
  haven't unified on pointer events.

### ✅ ESM + module syntax

- All imports are top-of-file (no inline `await import`).
- `vite.config.ts` targets `es2022`; tested transpiles cleanly with
  Vite's esbuild minifier (no `export *` quirks, no `??=` reliance
  outside es2022 baseline).

## What still needs live browser testing

These can only be confirmed by opening the production URL on each
browser; the user's QA pass in `DEPLOY.md` § 3 covers them:

- Page-peel vertex shader on Safari (custom GLSL — historically the
  most browser-sensitive feature).
- Bloom / vignette post-processing on integrated-GPU Safari (sometimes
  underperforms).
- Audio resume on iOS Safari first interaction (page-load may need a
  visible button tap, not just a mousemove — the title splash already
  acts as that gesture).
- Settings panel + share intent click targets on touch devices via
  the simplified mobile flow.

## Build / runtime metrics (latest)

- 25/25 vitest tests pass.
- `npm run verify` passes (tests + tsc + vite build + jam-widget assertion).
- Production bundle: 613KB JS / 159KB gzipped.
- Renderer pixel ratio capped at 2 for HiDPI fill-rate sanity.
