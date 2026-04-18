import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export interface PostFx {
  readonly composer: EffectComposer;
  setSize(w: number, h: number): void;
  /** Enable/disable bloom (off during intro page-peel). */
  setBloomEnabled(on: boolean): void;
  render(): void;
}

const VIGNETTE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uOffset: { value: 1.05 },
    uDarkness: { value: 0.85 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uOffset;
    uniform float uDarkness;
    varying vec2 vUv;
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      vec2 uv = vUv * 2.0 - 1.0;
      float vignette = smoothstep(uOffset, uOffset - 0.6, length(uv));
      col.rgb *= mix(1.0, vignette, uDarkness);
      gl_FragColor = col;
    }
  `,
};

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostFx {
  const w = renderer.domElement.width;
  const h = renderer.domElement.height;

  const composer = new EffectComposer(renderer);
  composer.setSize(w, h);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom on bright pixels — only the lamp bulb is intentionally bright in
  // the diorama, so threshold is set conservatively. Disabled by default
  // (intro page is full-bleed bright; would wash everything out).
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.18, 0.6, 0.95);
  bloom.enabled = false;
  composer.addPass(bloom);

  const vignette = new ShaderPass(VIGNETTE_SHADER);
  vignette.uniforms.uOffset.value = 1.15;
  vignette.uniforms.uDarkness.value = 0.35;
  composer.addPass(vignette);

  const output = new OutputPass();
  composer.addPass(output);

  function setSize(width: number, height: number): void {
    composer.setSize(width, height);
    bloom.setSize(width, height);
  }

  function setBloomEnabled(on: boolean): void {
    bloom.enabled = on;
  }

  function render(): void {
    composer.render();
  }

  return { composer, setSize, setBloomEnabled, render };
}
