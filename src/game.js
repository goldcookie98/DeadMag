import { Player } from "./player.js";
import { buildMap } from "./map.js";
import { stepPhysics } from "./physics.js";

export class Game {
  constructor(w, h) {
    this.player = new Player(w * 0.25, h * 0.4);
    this.platforms = buildMap(w, h);
    this.bullets = [];
    this.mouse = { x: w * 0.5, y: h * 0.5, down: false };
    this.readInput = () => ({ left: false, right: false, jump: false });
  }

  shoot() {
    const p = this.player;
    const ox = p.x + p.w / 2;
    const oy = p.y + p.h / 2;
    const dx = this.mouse.x - ox;
    const dy = this.mouse.y - oy;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 900;
    this.bullets.push({
      x: ox,
      y: oy,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      life: 0.6,
    });
  }

  update(dt, w, h) {
    stepPhysics(this.player, this.platforms, this.readInput(), dt, w, h);

    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }
    this.bullets = this.bullets.filter(
      (b) => b.life > 0 && b.x > -50 && b.x < w + 50 && b.y > -50 && b.y < h + 50
    );
  }

  render(ctx, w, h) {
    ctx.fillStyle = "#07070b";
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx, w, h);

    for (const p of this.platforms) {
      ctx.fillStyle = "#1a1a26";
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = "#00ffd1";
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
    }

    this.player.render(ctx);

    ctx.fillStyle = "#ff2e6c";
    for (const b of this.bullets) {
      ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
    }

    drawCrosshair(ctx, this.mouse.x, this.mouse.y);
  }
}

function drawGrid(ctx, w, h) {
  const step = 32;
  ctx.strokeStyle = "rgba(0, 255, 209, 0.04)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = 0; y < h; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();
}

function drawCrosshair(ctx, x, y) {
  ctx.strokeStyle = "#00ffd1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 8, y);
  ctx.lineTo(x - 2, y);
  ctx.moveTo(x + 2, y);
  ctx.lineTo(x + 8, y);
  ctx.moveTo(x, y - 8);
  ctx.lineTo(x, y - 2);
  ctx.moveTo(x, y + 2);
  ctx.lineTo(x, y + 8);
  ctx.stroke();
}
