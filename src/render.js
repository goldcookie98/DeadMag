import { WALLS, MAP_W, MAP_H } from "./map.js";
import { CONSTANTS } from "./sim.js";
import { WEAPONS } from "./weapons.js";

export function render(ctx, sim, camera, localId, mouse) {
  const { vw, vh } = camera;
  ctx.fillStyle = "#07070b";
  ctx.fillRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  drawGrid(ctx, camera);
  drawWalls(ctx);

  for (const e of sim.explosions) {
    const age = (sim.timeMs - e.t) / 400;
    ctx.strokeStyle = `rgba(255,212,0,${1 - age})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * (0.4 + age * 0.7), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,46,108,${(1 - age) * 0.2})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * (0.4 + age * 0.7), 0, Math.PI * 2);
    ctx.fill();
  }

  for (const z of sim.zombies) drawZombie(ctx, z);

  for (const [, p] of sim.players) {
    if (p.state === "dead") continue;
    if (p.state === "down") drawDownedPlayer(ctx, p, p.id === localId, sim.timeMs);
    else drawPlayer(ctx, p, p.id === localId);
  }

  ctx.fillStyle = "#ffd400";
  for (const b of sim.bullets) {
    const len = 8;
    const vx = b.vx, vy = b.vy;
    const m = Math.hypot(vx, vy) || 1;
    const ux = vx / m, uy = vy / m;
    ctx.strokeStyle = b.weapon === "rocket" ? "#ff2e6c" : "#ffd400";
    ctx.lineWidth = b.weapon === "rocket" ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(b.x - ux * len, b.y - uy * len);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.restore();

  if (mouse) drawCrosshair(ctx, mouse.x, mouse.y);
}

function drawGrid(ctx, camera) {
  const step = 64;
  const x0 = Math.floor(camera.x / step) * step;
  const y0 = Math.floor(camera.y / step) * step;
  const x1 = camera.x + camera.vw;
  const y1 = camera.y + camera.vh;
  ctx.strokeStyle = "rgba(0,255,209,0.04)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += step) {
    ctx.moveTo(x + 0.5, Math.max(0, camera.y));
    ctx.lineTo(x + 0.5, Math.min(MAP_H, y1));
  }
  for (let y = y0; y <= y1; y += step) {
    ctx.moveTo(Math.max(0, camera.x), y + 0.5);
    ctx.lineTo(Math.min(MAP_W, x1), y + 0.5);
  }
  ctx.stroke();
}

function drawWalls(ctx) {
  for (const w of WALLS) {
    ctx.fillStyle = "#1a1a26";
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = "#00ffd1";
    ctx.lineWidth = 1;
    ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
  }
}

function drawPlayer(ctx, p, isLocal) {
  const r = CONSTANTS.PLAYER_R;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  drawWeaponNotch(ctx, p.weapon, r);
  ctx.fillStyle = p.color || "#ff2e6c";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isLocal ? "#00ffd1" : "rgba(255,46,108,0.6)";
  ctx.lineWidth = isLocal ? 2 : 1;
  ctx.stroke();
  ctx.restore();

  drawHpBar(ctx, p.x, p.y - r - 12, p.hp, p.maxHp, p.armor);
  ctx.fillStyle = "rgba(0,255,209,0.7)";
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(p.name, p.x, p.y - r - 22);
}

function drawWeaponNotch(ctx, weapon, r) {
  const base = "#3a3a48";
  const metal = "#7a7a90";
  const accent = "#b8b8c8";
  ctx.lineCap = "butt";
  switch (weapon) {
    case "pistol":
      ctx.fillStyle = base;
      ctx.fillRect(r - 3, -2, 8, 4);
      ctx.fillStyle = metal;
      ctx.fillRect(r + 4, -2, 1, 4);
      break;
    case "shotgun":
      ctx.fillStyle = base;
      ctx.fillRect(r - 4, -4, 14, 8);
      ctx.fillStyle = metal;
      ctx.fillRect(r + 8, -4, 2, 8);
      ctx.strokeStyle = "#1a1a26";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(r - 4, 0); ctx.lineTo(r + 9, 0);
      ctx.stroke();
      break;
    case "smg":
      ctx.fillStyle = base;
      ctx.fillRect(r - 3, -2.5, 13, 5);
      ctx.fillStyle = metal;
      ctx.fillRect(r + 9, -2, 2, 4);
      ctx.fillStyle = "#1a1a26";
      ctx.fillRect(r - 1, 2.5, 4, 4);
      break;
    case "sniper":
      ctx.fillStyle = base;
      ctx.fillRect(r - 3, -2, 20, 4);
      ctx.fillStyle = metal;
      ctx.fillRect(r + 16, -2, 2, 4);
      ctx.fillStyle = accent;
      ctx.fillRect(r + 2, -5, 6, 3);
      break;
    case "rocket":
      ctx.fillStyle = base;
      ctx.fillRect(r - 4, -5, 12, 10);
      ctx.fillStyle = "#ff2e6c";
      ctx.beginPath();
      ctx.moveTo(r + 8, -5);
      ctx.lineTo(r + 14, 0);
      ctx.lineTo(r + 8, 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffd400";
      ctx.fillRect(r + 9, -1, 4, 2);
      break;
    case "knife":
      ctx.fillStyle = base;
      ctx.fillRect(r - 2, -1.5, 4, 3);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(r + 2, -2);
      ctx.lineTo(r + 12, 0);
      ctx.lineTo(r + 2, 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(r + 2, 0); ctx.lineTo(r + 11, 0);
      ctx.stroke();
      break;
    default:
      ctx.fillStyle = base;
      ctx.fillRect(r - 2, -3, 10, 6);
  }
}

function drawDownedPlayer(ctx, p, isLocal, timeMs) {
  const r = CONSTANTS.PLAYER_R;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = "rgba(255,46,108,0.35)";
  ctx.beginPath();
  ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isLocal ? "#ffd400" : "rgba(255,46,108,0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,46,108,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6,  r * 0.6);
  ctx.moveTo( r * 0.6, -r * 0.6); ctx.lineTo(-r * 0.6, r * 0.6);
  ctx.stroke();
  ctx.restore();

  const bleedLeft = Math.max(0, (p.bleedOutAt - timeMs) / 30000);
  ctx.strokeStyle = bleedLeft < 0.25 ? "#ff2e6c" : "#ffd400";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r + 8, -Math.PI / 2, -Math.PI / 2 + bleedLeft * Math.PI * 2);
  ctx.stroke();

  const rev = Math.max(0, Math.min(1, (p.reviveProgress || 0) / 5000));
  if (rev > 0) {
    ctx.strokeStyle = "#00ffd1";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 14, -Math.PI / 2, -Math.PI / 2 + rev * Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "#ff2e6c";
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(p.name + " · DOWN", p.x, p.y - r - 12);
}

function drawZombie(ctx, z) {
  const r = CONSTANTS.ZOMBIE_R;
  ctx.fillStyle = "#3d5a2a";
  ctx.beginPath();
  ctx.arc(z.x, z.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7fff5e";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#ff2e6c";
  ctx.fillRect(z.x - 3, z.y - 3, 2, 2);
  ctx.fillRect(z.x + 1, z.y - 3, 2, 2);
  drawHpBar(ctx, z.x, z.y - r - 8, z.hp, z.maxHp, 0, true);
}

function drawHpBar(ctx, x, y, hp, maxHp, armor, small = false) {
  const w = small ? 24 : 32, h = small ? 3 : 4;
  const bx = x - w / 2;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(bx - 1, y - 1, w + 2, h + 2);
  const ratio = Math.max(0, hp / maxHp);
  ctx.fillStyle = ratio > 0.4 ? "#00ffd1" : "#ff2e6c";
  ctx.fillRect(bx, y, w * ratio, h);
  if (armor > 0) {
    const ar = Math.min(armor, 150) / 150;
    ctx.fillStyle = "#ffd400";
    ctx.fillRect(bx, y + h + 1, w * ar, 2);
  }
}

function drawCrosshair(ctx, x, y) {
  ctx.strokeStyle = "#00ffd1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 10, y); ctx.lineTo(x - 3, y);
  ctx.moveTo(x + 3, y);  ctx.lineTo(x + 10, y);
  ctx.moveTo(x, y - 10); ctx.lineTo(x, y - 3);
  ctx.moveTo(x, y + 3);  ctx.lineTo(x, y + 10);
  ctx.stroke();
}
