import "./style.css";
import type { GameState } from "./types";
import { showPickScreen } from "./screens/pick";
import { runMatch } from "./loop";
import { showEndScreen } from "./screens/end";

const canvasEl = document.getElementById("game");
if (!(canvasEl instanceof HTMLCanvasElement))
  throw new Error("game canvas missing");
const canvas = canvasEl;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");
const renderCtx = ctx;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  renderCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

resize();
window.addEventListener("resize", resize);

let state: GameState = "pick";

async function main(): Promise<void> {
  while (true) {
    if (state === "pick") {
      const pick = await showPickScreen(renderCtx);
      state = "playing";
      const result = await runMatch(renderCtx, pick);
      state = "end";
      await showEndScreen(renderCtx, result);
      state = "pick";
    }
  }
}

void main();
