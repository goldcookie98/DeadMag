import { WALLS, MAP_W, MAP_H } from "./map.js";
import { CONSTANTS } from "./sim.js";
import { WEAPONS } from "./weapons.js";

const VOLT = {
  bg: "#08020F",
  surface: "#1A0A30",
  magenta: "#FF1F6E",
  cyan: "#2EFFE5",
  acid: "#B6FF2E",
  yellow: "#FFE03E",
  fg: "#F4ECFF",
  dim: "#8E6BB8",
};

const _bloodDecals = [];
// Local-only muzzle flashes for the client player's shots. Driven by main.js
// on click edge so the user sees their gun fire instantly instead of waiting
// for the server's bullet to round-trip back. Uses wall-clock (performance.now)
// since it's a UI effect, not part of sim.timeMs.
const _muzzleFlashes = [];
const MUZZLE_LIFE_MS = 70;

export function render(ctx, sim, camera, localId, mouse) {
  const { vw, vh } = camera;
  ctx.fillStyle = VOLT.bg;
  ctx.fillRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  drawGrid(ctx, camera);
  drawWalls(ctx);
  drawBlood(ctx, sim.timeMs);

  for (const e of sim.explosions) drawExplosion(ctx, e, sim.timeMs);

  for (const z of sim.zombies) drawZombie(ctx, z);

  for (const [, p] of sim.players) {
    if (p.state === "dead") continue;
    if (p.state === "down") drawDownedPlayer(ctx, p, p.id === localId, sim.timeMs);
    else drawPlayer(ctx, p, p.id === localId);
  }

  drawBullets(ctx, sim.bullets);
  drawMuzzleFlashes(ctx);

  ctx.restore();

  if (mouse) drawCrosshair(ctx, mouse.x, mouse.y);
}

export function recordZombieDeath(x, y, timeMs) {
  _bloodDecals.push({ x, y, t: timeMs, life: 6000 + Math.random() * 3000, r: 9 + Math.random() * 13, rot: Math.random() * Math.PI });
  if (_bloodDecals.length > 60) _bloodDecals.shift();
}

export function recordMuzzleFlash(x, y, angle, weapon, wallClockMs) {
  _muzzleFlashes.push({ x, y, angle, weapon, t: wallClockMs });
  if (_muzzleFlashes.length > 12) _muzzleFlashes.shift();
}

function drawMuzzleFlashes(ctx) {
  if (_muzzleFlashes.length === 0) return;
  const now = performance.now();
  for (let i = _muzzleFlashes.length - 1; i >= 0; i--) {
    const f = _muzzleFlashes[i];
    const age = (now - f.t) / MUZZLE_LIFE_MS;
    if (age >= 1) { _muzzleFlashes.splice(i, 1); continue; }
    const fade = 1 - age;
    const reach = 22 + age * 14;
    const tipX = f.x + Math.cos(f.angle) * (16 + reach * 0.5);
    const tipY = f.y + Math.sin(f.angle) * (16 + reach * 0.5);
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(f.angle);
    ctx.globalAlpha = fade;
    ctx.shadowBlur = 16;
    ctx.shadowColor = VOLT.yellow;
    ctx.fillStyle = VOLT.yellow;
    ctx.beginPath();
    ctx.moveTo(reach, 0);
    ctx.lineTo(0, -5 * fade);
    ctx.lineTo(0,  5 * fade);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = VOLT.fg;
    ctx.fillRect(-2, -1.5, 5, 3);
    ctx.restore();
  }
}

function drawBlood(ctx, timeMs) {
  for (let i = _bloodDecals.length - 1; i >= 0; i--) {
    const d = _bloodDecals[i];
    const age = (timeMs - d.t) / d.life;
    if (age >= 1) { _bloodDecals.splice(i, 1); continue; }
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.fillStyle = `rgba(255,31,110,${0.22 * (1 - age)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, d.r, d.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawGrid(ctx, camera) {
  const step = 32;
  const x0 = Math.floor(camera.x / step) * step;
  const y0 = Math.floor(camera.y / step) * step;
  const x1 = camera.x + camera.vw;
  const y1 = camera.y + camera.vh;
  ctx.strokeStyle = "rgba(255,31,110,0.06)";
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
    ctx.fillStyle = VOLT.surface;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = VOLT.magenta;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
    ctx.strokeStyle = "rgba(255,31,110,0.3)";
    ctx.lineWidth = 0.6;
    ctx.strokeRect(w.x + 2.5, w.y + 2.5, w.w - 5, w.h - 5);
  }
}

function drawPlayer(ctx, p, isLocal) {
  const r = CONSTANTS.PLAYER_R;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  drawWeaponNotch(ctx, p.weapon, r);
  ctx.shadowColor = VOLT.magenta;
  ctx.shadowBlur = 8;
  ctx.fillStyle = p.color || VOLT.magenta;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = isLocal ? VOLT.cyan : "rgba(255,31,110,0.55)";
  ctx.lineWidth = isLocal ? 2.5 : 1;
  ctx.stroke();
  ctx.restore();

  drawHpBar(ctx, p.x, p.y - r - 12, p.hp, p.maxHp, p.armor);
  ctx.fillStyle = VOLT.cyan;
  ctx.font = "bold 12px Anton, Impact, sans-serif";
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
      ctx.fillStyle = base; ctx.fillRect(r - 3, -2, 8, 4);
      ctx.fillStyle = metal; ctx.fillRect(r + 4, -2, 1, 4);
      break;
    case "shotgun":
      ctx.fillStyle = base; ctx.fillRect(r - 4, -4, 14, 8);
      ctx.fillStyle = metal; ctx.fillRect(r + 8, -4, 2, 8);
      break;
    case "smg":
      ctx.fillStyle = base; ctx.fillRect(r - 3, -2.5, 13, 5);
      ctx.fillStyle = metal; ctx.fillRect(r + 9, -2, 2, 4);
      ctx.fillStyle = VOLT.bg; ctx.fillRect(r - 1, 2.5, 4, 4);
      break;
    case "sniper":
      ctx.fillStyle = base; ctx.fillRect(r - 3, -2, 20, 4);
      ctx.fillStyle = metal; ctx.fillRect(r + 16, -2, 2, 4);
      ctx.fillStyle = accent; ctx.fillRect(r + 2, -5, 6, 3);
      break;
    case "rocket":
      ctx.fillStyle = base; ctx.fillRect(r - 4, -5, 12, 10);
      ctx.fillStyle = VOLT.magenta;
      ctx.beginPath();
      ctx.moveTo(r + 8, -5);
      ctx.lineTo(r + 14, 0);
      ctx.lineTo(r + 8, 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = VOLT.yellow; ctx.fillRect(r + 9, -1, 4, 2);
      break;
    case "knife":
      ctx.fillStyle = base; ctx.fillRect(r - 2, -1.5, 4, 3);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(r + 2, -2);
      ctx.lineTo(r + 12, 0);
      ctx.lineTo(r + 2, 2);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      ctx.fillStyle = base; ctx.fillRect(r - 2, -3, 10, 6);
  }
}

function drawDownedPlayer(ctx, p, isLocal, timeMs) {
  const r = CONSTANTS.PLAYER_R;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = "rgba(255,31,110,0.20)";
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = VOLT.yellow;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.strokeStyle = VOLT.magenta;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6,  r * 0.6);
  ctx.moveTo( r * 0.6, -r * 0.6); ctx.lineTo(-r * 0.6, r * 0.6);
  ctx.stroke();
  ctx.restore();

  const bleedLeft = Math.max(0, (p.bleedOutAt - timeMs) / 30000);
  ctx.strokeStyle = VOLT.yellow;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 22, -Math.PI / 2, -Math.PI / 2 + bleedLeft * Math.PI * 2);
  ctx.stroke();

  const rev = Math.max(0, Math.min(1, (p.reviveProgress || 0) / 5000));
  if (rev > 0) {
    ctx.strokeStyle = VOLT.acid;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 28, -Math.PI / 2, -Math.PI / 2 + rev * Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = VOLT.magenta;
  ctx.font = "bold 11px Anton, Impact, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(p.name + " · DOWN", p.x, p.y - r - 12);
}

function drawZombie(ctx, z) {
  const r = CONSTANTS.ZOMBIE_R;
  ctx.fillStyle = "#4D3A2A";
  ctx.beginPath();
  ctx.arc(z.x, z.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(182,255,46,0.7)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = VOLT.magenta;
  ctx.fillRect(z.x - 3, z.y - 3, 2.5, 2.5);
  ctx.fillRect(z.x + 1, z.y - 3, 2.5, 2.5);
  drawZombieHp(ctx, z.x, z.y - r - 8, z.hp, z.maxHp);
}

function drawZombieHp(ctx, x, y, hp, maxHp) {
  const w = 30, h = 3.5;
  const bx = x - w / 2;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(bx - 1, y - 1, w + 2, h + 2);
  const ratio = Math.max(0, hp / maxHp);
  ctx.fillStyle = ratio > 0.4 ? VOLT.acid : VOLT.magenta;
  ctx.fillRect(bx, y, w * ratio, h);
}

function drawHpBar(ctx, x, y, hp, maxHp, armor) {
  const w = 32, h = 3.5;
  const bx = x - w / 2;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(bx - 1, y - 1, w + 2, h + 2);
  const ratio = Math.max(0, hp / maxHp);
  ctx.fillStyle = VOLT.magenta;
  ctx.fillRect(bx, y, w * ratio, h);
  if (armor > 0) {
    const ar = Math.min(armor, 150) / 150;
    ctx.fillStyle = VOLT.yellow;
    ctx.fillRect(bx, y + h + 1, w * ar, 2);
  }
}

function drawBullets(ctx, bullets) {
  ctx.save();
  ctx.shadowColor = VOLT.yellow;
  ctx.shadowBlur = 6;
  for (const b of bullets) {
    const len = 8;
    const m = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx / m, uy = b.vy / m;
    if (b.weapon === "rocket") {
      ctx.shadowColor = VOLT.magenta;
      ctx.strokeStyle = VOLT.magenta;
      ctx.lineWidth = 3;
    } else {
      ctx.shadowColor = VOLT.yellow;
      ctx.strokeStyle = VOLT.yellow;
      ctx.lineWidth = 2.2;
    }
    ctx.beginPath();
    ctx.moveTo(b.x - ux * len, b.y - uy * len);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawExplosion(ctx, e, timeMs) {
  const age = (timeMs - e.t) / 400;
  if (age >= 1) return;
  const ringR = e.r * (0.4 + age * 0.7);
  ctx.save();
  ctx.strokeStyle = `rgba(255,224,62,${(1 - age) * 0.85})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(e.x, e.y, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,31,110,${(1 - age) * 0.30})`;
  ctx.beginPath();
  ctx.arc(e.x, e.y, ringR, 0, Math.PI * 2);
  ctx.fill();
  if (age < 0.5) {
    ctx.strokeStyle = `rgba(255,224,62,${(1 - age * 2) * 0.85})`;
    ctx.lineWidth = 2;
    const off = ringR * 1.05;
    const sp = ringR * 0.5;
    ctx.beginPath();
    ctx.moveTo(e.x + off, e.y);      ctx.lineTo(e.x + off + sp, e.y);
    ctx.moveTo(e.x - off, e.y);      ctx.lineTo(e.x - off - sp, e.y);
    ctx.moveTo(e.x, e.y + off);      ctx.lineTo(e.x, e.y + off + sp);
    ctx.moveTo(e.x, e.y - off);      ctx.lineTo(e.x, e.y - off - sp);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCrosshair(ctx, x, y) {
  ctx.save();
  ctx.shadowColor = VOLT.cyan;
  ctx.shadowBlur = 5;
  ctx.strokeStyle = VOLT.cyan;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 18, y); ctx.lineTo(x - 8, y);
  ctx.moveTo(x + 8, y);  ctx.lineTo(x + 18, y);
  ctx.moveTo(x, y - 18); ctx.lineTo(x, y - 8);
  ctx.moveTo(x, y + 8);  ctx.lineTo(x, y + 18);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = VOLT.magenta;
  ctx.beginPath();
  ctx.arc(x, y, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
