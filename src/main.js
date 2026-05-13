import { Game } from "./game.js";
import { attachInput } from "./input.js";
import { mountVersion } from "./version-display.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

const game = new Game(window.innerWidth, window.innerHeight);
attachInput(canvas, game);
mountVersion();

let last = performance.now();
function frame(now) {
  const dt = Math.min(33, now - last) / 1000;
  last = now;
  game.update(dt, window.innerWidth, window.innerHeight);
  game.render(ctx, window.innerWidth, window.innerHeight);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
