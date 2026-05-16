import { WALLS, MAP_W, MAP_H, CRATE, PAP, BARRICADE } from "./map.js";
import { CONSTANTS } from "./sim.js";
import { WEAPONS } from "./weapons.js";
import { WEAPON_SVG } from "./ui.js";

const INTERACT_RANGE = 64;
const PAP_MIN_WAVE = 5;

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

const VOLT_FUSE_LIFE_MS = 6000;
let _renderSimTime = 0;
const _bloodDecals = [];
// Local-only muzzle flashes for the client player's shots. Driven by main.js
// on click edge so the user sees their gun fire instantly instead of waiting
// for the server's bullet to round-trip back. Uses wall-clock (performance.now)
// since it's a UI effect, not part of sim.timeMs.
const _muzzleFlashes = [];
const MUZZLE_LIFE_MS = 70;
const _hitSparks = [];
const HIT_SPARK_LIFE_MS = 220;
let _hitMarkerUntil = 0;
const HIT_MARKER_LIFE_MS = 180;

export function render(ctx, sim, camera, localId, mouse) {
  const { vw, vh } = camera;
  _renderSimTime = sim.timeMs;
  ctx.fillStyle = VOLT.bg;
  ctx.fillRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  drawGrid(ctx, camera);
  drawWalls(ctx, sim);
  drawProps(ctx, sim, localId);
  drawBlood(ctx, sim.timeMs);

  for (const e of sim.explosions) drawExplosion(ctx, e, sim.timeMs);
  if (sim.sonicRings) drawSonicRings(ctx, sim.sonicRings, sim.timeMs);

  for (const z of sim.zombies) drawZombie(ctx, z);
  drawStaggerEffects(ctx, sim.zombies, sim.timeMs);

  for (const [, p] of sim.players) {
    if (p.state === "dead") continue;
    if (p.state === "down") drawDownedPlayer(ctx, p, p.id === localId, sim.timeMs);
    else drawPlayer(ctx, p, p.id === localId);
    if (p.state === "alive" && p.weapon === "ripple" && p.chargingSince) {
      drawRippleCharge(ctx, p, sim.timeMs);
    }
  }

  drawBullets(ctx, sim.bullets);
  if (sim.chainBolts) drawChainBolts(ctx, sim.chainBolts, sim.timeMs);
  drawMuzzleFlashes(ctx);
  drawHitSparks(ctx);

  ctx.restore();

  if (mouse) drawCrosshair(ctx, mouse.x, mouse.y, performance.now() < _hitMarkerUntil);
}

export function recordZombieDeath(x, y, timeMs) {
  _bloodDecals.push({ x, y, t: timeMs, life: 6000 + Math.random() * 3000, r: 9 + Math.random() * 13, rot: Math.random() * Math.PI });
  if (_bloodDecals.length > 60) _bloodDecals.shift();
}

export function recordMuzzleFlash(x, y, angle, weapon, wallClockMs) {
  _muzzleFlashes.push({ x, y, angle, weapon, t: wallClockMs });
  if (_muzzleFlashes.length > 12) _muzzleFlashes.shift();
}

export function recordHit(x, y) {
  const t = performance.now();
  _hitSparks.push({ x, y, t });
  if (_hitSparks.length > 24) _hitSparks.shift();
  _hitMarkerUntil = t + HIT_MARKER_LIFE_MS;
}

function drawHitSparks(ctx) {
  if (_hitSparks.length === 0) return;
  const now = performance.now();
  for (let i = _hitSparks.length - 1; i >= 0; i--) {
    const s = _hitSparks[i];
    const age = (now - s.t) / HIT_SPARK_LIFE_MS;
    if (age >= 1) { _hitSparks.splice(i, 1); continue; }
    const fade = 1 - age;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = VOLT.yellow;
    ctx.lineWidth = 2;
    const r = 4 + age * 10;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = (Math.PI / 2) * k + age * 1.5;
      ctx.moveTo(s.x + Math.cos(a) * r * 0.4, s.y + Math.sin(a) * r * 0.4);
      ctx.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
    }
    ctx.stroke();
    ctx.restore();
  }
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

function drawChainBolts(ctx, bolts, timeMs) {
  if (!bolts || bolts.length === 0) return;
  for (const bolt of bolts) {
    const age = (timeMs - bolt.t) / bolt.duration;
    if (age >= 1) continue;
    const fade = 1 - age;
    const pts = bolt.points;
    if (!pts || pts.length < 2) continue;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len, py = dx / len;
      const segs = 8;
      const path = [];
      path.push({ x: a.x, y: a.y });
      for (let s = 1; s < segs; s++) {
        const t = s / segs;
        const jit = (Math.random() - 0.5) * 16;
        path.push({ x: a.x + dx * t + px * jit, y: a.y + dy * t + py * jit });
      }
      path.push({ x: b.x, y: b.y });
      ctx.shadowBlur = 8;
      ctx.shadowColor = VOLT.cyan;
      ctx.strokeStyle = VOLT.cyan;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let k = 1; k < path.length; k++) ctx.lineTo(path[k].x, path[k].y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = VOLT.fg;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawSonicRings(ctx, rings, timeMs) {
  if (!rings || rings.length === 0) return;
  for (const ring of rings) {
    const age = (timeMs - ring.t) / ring.duration;
    if (age >= 1) continue;
    const fade = 1 - age;
    const layers = [
      { lag: 0,    color: VOLT.acid, baseW: 4, blur: 14 },
      { lag: 0.09, color: "rgba(182,255,46,0.5)", baseW: 3, blur: 8 },
      { lag: 0.18, color: "rgba(244,236,255,0.7)", baseW: 2, blur: 6 },
    ];
    ctx.save();
    for (const L of layers) {
      const localAge = age - L.lag;
      if (localAge <= 0 || localAge >= 1) continue;
      const r = Math.max(1, ring.r * localAge);
      const w = Math.max(1, L.baseW * (1 - localAge));
      ctx.globalAlpha = fade;
      ctx.shadowBlur = L.blur;
      ctx.shadowColor = VOLT.acid;
      ctx.strokeStyle = L.color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawRippleCharge(ctx, p, timeMs) {
  const w = WEAPONS.ripple;
  const dur = Math.max(0, timeMs - p.chargingSince);
  const ratio = Math.min(1, dur / w.chargeMaxMs);
  const blastR = w.range * ratio;
  ctx.save();
  // Translucent disc showing the upcoming blast radius.
  ctx.globalAlpha = 0.12 + 0.10 * ratio;
  ctx.fillStyle = VOLT.acid;
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(6, blastR), 0, Math.PI * 2);
  ctx.fill();
  // Outer ring.
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = VOLT.acid;
  ctx.lineWidth = 2 + ratio * 2;
  ctx.shadowBlur = 10;
  ctx.shadowColor = VOLT.acid;
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(6, blastR), 0, Math.PI * 2);
  ctx.stroke();
  // Charge arc near the player so the user can read progress at a glance.
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ratio >= 1 ? VOLT.fg : VOLT.acid;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 22, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawStaggerEffects(ctx, zombies, timeMs) {
  for (const z of zombies) {
    if (!z.staggeredUntil || timeMs >= z.staggeredUntil) continue;
    const r = (z.radius || 13) + 4;
    ctx.save();
    ctx.strokeStyle = VOLT.acid;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 3; i++) {
      const phase = timeMs * 0.012 + i * (Math.PI * 2 / 3);
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.4) {
        const wob = 1 + Math.sin(a * 4 + phase) * 0.12;
        const x = z.x + Math.cos(a) * r * wob;
        const y = z.y + Math.sin(a) * r * wob;
        if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawWalls(ctx, sim) {
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
  if (!sim?.barricadeDown) drawBarricade(ctx, BARRICADE);
}

function drawBarricade(ctx, b) {
  ctx.save();
  ctx.fillStyle = "#2A1810";
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = VOLT.yellow;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  // Plank slats.
  ctx.strokeStyle = "rgba(255,224,62,0.55)";
  ctx.lineWidth = 1;
  for (let y = b.y + 12; y < b.y + b.h; y += 22) {
    ctx.beginPath();
    ctx.moveTo(b.x + 2, y);
    ctx.lineTo(b.x + b.w - 2, y);
    ctx.stroke();
  }
  // Nails.
  ctx.fillStyle = VOLT.fg;
  for (let y = b.y + 8; y < b.y + b.h - 4; y += 18) {
    ctx.fillRect(b.x + 4, y, 2, 2);
    ctx.fillRect(b.x + b.w - 6, y, 2, 2);
  }
  ctx.restore();
}

function drawProps(ctx, sim, localId) {
  drawCrate(ctx, CRATE, sim.timeMs);
  drawPap(ctx, PAP, sim?.wave ?? 0, sim.timeMs);

  const me = sim.players.get(localId);

  // The CS:GO-style spin renders above the crate (in world coords) so it
  // doesn't lock the screen.
  for (const [, p] of sim.players) {
    if (p.crateOpenedAt) drawCrateSpin(ctx, p, sim.timeMs);
  }
  // Floating "TAKE [WEAPON]" reward above the crate for any player with a
  // pending pickup.
  for (const [, p] of sim.players) {
    if (p.crateResultPending && p.id === localId) drawCratePending(ctx, p.crateResultPending, sim.timeMs);
  }

  // Proximity F-prompts for the local player.
  if (!me || me.state !== "alive" || me.crateOpenedAt) return;
  const crateLabel = me.crateResultPending
    ? `TAKE ${WEAPONS[me.crateResultPending]?.name || me.crateResultPending.toUpperCase()}`
    : "OPEN CRATE · $950";
  const candidates = [
    { rect: CRATE, label: crateLabel, color: VOLT.yellow },
    { rect: PAP, label: sim.wave < PAP_MIN_WAVE
        ? `PACK-A-PUNCH · UNLOCKS W${PAP_MIN_WAVE}`
        : (me.slotPacked?.[me.activeSlot] ? "ALREADY PACKED" : "PACK · $10,000"),
      color: VOLT.acid },
  ];
  if (!sim.barricadeDown) {
    candidates.push({ rect: BARRICADE, label: "BREAK BARRICADE · $1,000", color: VOLT.magenta });
  }
  for (const c of candidates) {
    const cx = c.rect.x + c.rect.w / 2;
    const cy = c.rect.y + c.rect.h / 2;
    const d = Math.hypot(me.x - cx, me.y - cy);
    if (d > INTERACT_RANGE) continue;
    // Lift prompt above pending reward floater so they don't overlap.
    const yLift = (c.rect === CRATE && me.crateResultPending) ? 56 : 12;
    drawInteractPrompt(ctx, cx, c.rect.y - yLift, c.label, c.color);
  }
}

// ────────── Crate spin (in-world CS:GO-style strip) ──────────
const CRATE_ANIM_MS = 3500;
const CRATE_POOL = ["pistol", "shotgun", "smg", "sniper", "rocket", "knife", "voltspike", "ripple"];
const CRATE_SPIN_W = 380;
const CRATE_SPIN_H = 84;
const CRATE_CELL_W = 76;
const CRATE_TARGET_IDX = 34;
const CRATE_STRIP_LEN = 40;
const _crateStrips = new Map(); // playerId → { openedAt, cells }
const _weaponIconCache = {}; // weaponId → Image (rasterised SVG)

function getWeaponIcon(wid) {
  if (wid in _weaponIconCache) return _weaponIconCache[wid];
  const svg = WEAPON_SVG[wid];
  if (!svg) { _weaponIconCache[wid] = null; return null; }
  // The HUD SVGs use CSS vars (var(--cyan)) and currentColor; substitute the
  // VOLT palette literally so the raster works without a stylesheet.
  const resolved = svg
    .replace(/var\(--cyan\)/g, VOLT.cyan)
    .replace(/var\(--magenta\)/g, VOLT.magenta)
    .replace(/var\(--acid\)/g, VOLT.acid)
    .replace(/var\(--yellow\)/g, VOLT.yellow)
    .replace(/currentColor/g, VOLT.fg);
  const blob = new Blob([resolved], { type: "image/svg+xml" });
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  _weaponIconCache[wid] = img;
  return img;
}

function getCrateStripCells(playerId, openedAt, result, blowUp) {
  const cached = _crateStrips.get(playerId);
  if (cached && cached.openedAt === openedAt) return cached.cells;
  const cells = [];
  for (let i = 0; i < CRATE_STRIP_LEN; i++) {
    if (i === CRATE_TARGET_IDX) cells.push(blowUp ? "BOOM" : (result || "pistol"));
    else cells.push(CRATE_POOL[Math.floor(Math.random() * CRATE_POOL.length)]);
  }
  _crateStrips.set(playerId, { openedAt, cells });
  return cells;
}

function drawCrateSpin(ctx, p, simTimeMs) {
  const elapsed = Math.max(0, simTimeMs - p.crateOpenedAt);
  const ratio = Math.max(0, Math.min(1, elapsed / CRATE_ANIM_MS));
  const eased = 1 - Math.pow(1 - ratio, 3);
  const finalOffset = (CRATE_TARGET_IDX * CRATE_CELL_W + CRATE_CELL_W / 2) - CRATE_SPIN_W / 2;
  const offset = eased * finalOffset;
  const cells = getCrateStripCells(p.id, p.crateOpenedAt, p.crateResult, p.crateBlowUp);

  const cx = CRATE.x + CRATE.w / 2;
  const boxX = cx - CRATE_SPIN_W / 2;
  const boxY = CRATE.y - CRATE_SPIN_H - 18;

  ctx.save();
  // Backing.
  ctx.fillStyle = "rgba(8,2,15,0.92)";
  ctx.fillRect(boxX, boxY, CRATE_SPIN_W, CRATE_SPIN_H);
  ctx.strokeStyle = VOLT.yellow;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(boxX + 0.5, boxY + 0.5, CRATE_SPIN_W - 1, CRATE_SPIN_H - 1);

  // Clip the strip to the box.
  ctx.beginPath();
  ctx.rect(boxX, boxY, CRATE_SPIN_W, CRATE_SPIN_H);
  ctx.clip();

  ctx.font = "bold 9px JetBrains Mono, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const iconW = CRATE_CELL_W - 12;
  const iconH = iconW * 0.5; // SVG viewBox is 160x80, so 2:1
  for (let i = 0; i < cells.length; i++) {
    const cellLeft = boxX + i * CRATE_CELL_W - offset;
    if (cellLeft + CRATE_CELL_W < boxX || cellLeft > boxX + CRATE_SPIN_W) continue;
    const wid = cells[i];
    const isBoom = wid === "BOOM";
    ctx.fillStyle = isBoom ? "rgba(255,31,110,0.22)" : "rgba(21,7,40,0.7)";
    ctx.fillRect(cellLeft, boxY + 2, CRATE_CELL_W - 1, CRATE_SPIN_H - 4);
    if (isBoom) {
      ctx.fillStyle = VOLT.magenta;
      ctx.font = "bold 22px Anton, Impact, sans-serif";
      ctx.fillText("⚠", cellLeft + CRATE_CELL_W / 2, boxY + CRATE_SPIN_H / 2 - 8);
      ctx.font = "bold 9px JetBrains Mono, monospace";
      ctx.fillText("BOOM", cellLeft + CRATE_CELL_W / 2, boxY + CRATE_SPIN_H - 12);
    } else {
      const img = getWeaponIcon(wid);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, cellLeft + (CRATE_CELL_W - iconW) / 2, boxY + 8, iconW, iconH);
      }
      ctx.fillStyle = VOLT.dim;
      ctx.fillText((WEAPONS[wid]?.name || wid).toUpperCase(), cellLeft + CRATE_CELL_W / 2, boxY + CRATE_SPIN_H - 12);
    }
  }

  // Pointer.
  ctx.fillStyle = VOLT.cyan;
  ctx.shadowColor = VOLT.cyan;
  ctx.shadowBlur = 10;
  ctx.fillRect(boxX + CRATE_SPIN_W / 2 - 1, boxY, 2, CRATE_SPIN_H);
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawCratePending(ctx, weaponId, timeMs) {
  const cx = CRATE.x + CRATE.w / 2;
  const cy = CRATE.y - 32;
  const bob = Math.sin(timeMs * 0.005) * 3;
  ctx.save();
  ctx.font = "bold 11px JetBrains Mono, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = (WEAPONS[weaponId]?.name || weaponId).toUpperCase();
  const w = Math.max(80, ctx.measureText(label).width + 24);
  const h = 22;
  ctx.fillStyle = "rgba(8,2,15,0.9)";
  ctx.fillRect(cx - w / 2, cy - h / 2 + bob, w, h);
  ctx.strokeStyle = VOLT.acid;
  ctx.lineWidth = 1.4;
  ctx.shadowColor = VOLT.acid;
  ctx.shadowBlur = 10;
  ctx.strokeRect(cx - w / 2 + 0.5, cy - h / 2 + bob + 0.5, w - 1, h - 1);
  ctx.shadowBlur = 0;
  ctx.fillStyle = VOLT.acid;
  ctx.fillText(label, cx, cy + bob);
  ctx.restore();
}

function drawCrate(ctx, c, timeMs) {
  ctx.save();
  // Body.
  ctx.fillStyle = "#3A2A1A";
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.strokeStyle = VOLT.yellow;
  ctx.lineWidth = 2;
  ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
  // Banding.
  ctx.strokeStyle = "rgba(255,224,62,0.7)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y + c.h * 0.4);
  ctx.lineTo(c.x + c.w, c.y + c.h * 0.4);
  ctx.moveTo(c.x + c.w * 0.5, c.y);
  ctx.lineTo(c.x + c.w * 0.5, c.y + c.h);
  ctx.stroke();
  // Pulse glyph.
  const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.005);
  ctx.globalAlpha = 0.4 + pulse * 0.5;
  ctx.fillStyle = VOLT.yellow;
  ctx.shadowColor = VOLT.yellow;
  ctx.shadowBlur = 10;
  ctx.font = "bold 14px Anton, Impact, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", c.x + c.w / 2, c.y + c.h / 2);
  ctx.restore();
}

function drawPap(ctx, p, wave, timeMs) {
  ctx.save();
  // Base.
  ctx.fillStyle = "#1B0A36";
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.strokeStyle = VOLT.acid;
  ctx.lineWidth = 2.2;
  ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
  // Slot opening.
  ctx.fillStyle = "#08020F";
  ctx.fillRect(p.x + 8, p.y + p.h / 2 - 4, p.w - 16, 8);
  // Animated glow inside the slot.
  const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.004);
  const locked = wave < PAP_MIN_WAVE;
  ctx.globalAlpha = 0.5 + pulse * 0.4;
  ctx.fillStyle = locked ? VOLT.magenta : VOLT.acid;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 12;
  ctx.fillRect(p.x + 10, p.y + p.h / 2 - 2, p.w - 20, 4);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = locked ? VOLT.magenta : VOLT.acid;
  ctx.font = "bold 9px JetBrains Mono, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PACK-A-PUNCH", p.x + p.w / 2, p.y + 10);
  ctx.restore();
}

function drawInteractPrompt(ctx, cx, cy, label, color) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = "bold 11px JetBrains Mono, monospace";
  const padX = 6;
  const padY = 4;
  const textW = ctx.measureText(label).width;
  const boxW = textW + 24 + padX * 2;
  const boxH = 18;
  ctx.fillStyle = "rgba(8,2,15,0.85)";
  ctx.fillRect(cx - boxW / 2, cy - boxH, boxW, boxH);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(cx - boxW / 2 + 0.5, cy - boxH + 0.5, boxW - 1, boxH - 1);
  // [F] chip.
  ctx.fillStyle = color;
  ctx.fillRect(cx - boxW / 2 + padX - 2, cy - boxH + 3, 16, boxH - 6);
  ctx.fillStyle = "#08020F";
  ctx.font = "bold 10px JetBrains Mono, monospace";
  ctx.fillText("F", cx - boxW / 2 + padX + 6, cy - 5);
  ctx.fillStyle = color;
  ctx.font = "bold 10px JetBrains Mono, monospace";
  ctx.textAlign = "left";
  ctx.fillText(label, cx - boxW / 2 + padX + 18, cy - 5);
  ctx.restore();
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
    case "voltspike":
      ctx.fillStyle = base; ctx.fillRect(r - 3, -3, 16, 6);
      ctx.fillStyle = VOLT.cyan;
      ctx.fillRect(r + 13, -1.5, 4, 3);
      ctx.strokeStyle = VOLT.cyan;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(r - 1, -3); ctx.lineTo(r + 1, -5);
      ctx.lineTo(r + 3, -3); ctx.lineTo(r + 5, -5);
      ctx.lineTo(r + 7, -3); ctx.lineTo(r + 9, -5);
      ctx.stroke();
      break;
    case "ripple":
      ctx.fillStyle = base; ctx.fillRect(r - 3, -4, 14, 8);
      ctx.strokeStyle = VOLT.acid;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(r + 14, 0, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r + 14, 0, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = VOLT.acid;
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
  if (z.kind === "sprinter") return drawSprinter(ctx, z);
  if (z.kind === "brute") return drawBrute(ctx, z);
  if (z.kind === "volt-fuse") return drawVoltFuse(ctx, z);
  return drawNormalZombie(ctx, z);
}

function drawNormalZombie(ctx, z) {
  const r = z.radius || CONSTANTS.ZOMBIE_R;
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

function drawSprinter(ctx, z) {
  ctx.save();
  ctx.translate(z.x, z.y);
  // Motion lines pulse: alternate opacities across the three trails.
  const phase = Math.floor(performance.now() / 80) % 3;
  ctx.strokeStyle = VOLT.acid;
  ctx.lineWidth = 1.4;
  const trails = [
    [-22, -12, -32, -12],
    [-22, 0, -36, 0],
    [-22, 12, -32, 12],
  ];
  for (let i = 0; i < trails.length; i++) {
    ctx.globalAlpha = i === phase ? 0.22 : 0.45;
    const t = trails[i];
    ctx.beginPath();
    ctx.moveTo(t[0], t[1]); ctx.lineTo(t[2], t[3]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Lean body (ellipse).
  ctx.fillStyle = "#4D3A2A";
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = VOLT.acid;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Eye halos.
  ctx.fillStyle = "rgba(255,31,110,0.3)";
  ctx.beginPath(); ctx.arc(-2.7, -0.8, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(2.7, -0.8, 3, 0, Math.PI * 2); ctx.fill();
  // Eyes.
  ctx.fillStyle = VOLT.magenta;
  ctx.fillRect(-4, -2, 2.5, 2.5);
  ctx.fillRect(1.5, -2, 2.5, 2.5);
  // Forward-lean chevron.
  ctx.strokeStyle = VOLT.acid;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(8, -3); ctx.lineTo(13, -2); ctx.lineTo(8, -1);
  ctx.stroke();
  ctx.restore();
  drawZombieHp(ctx, z.x, z.y - z.radius - 8, z.hp, z.maxHp);
}

function drawBrute(ctx, z) {
  ctx.save();
  ctx.translate(z.x, z.y);
  // Body.
  ctx.fillStyle = "#3A2A1F";
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(182,255,46,0.6)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // Armor plates.
  const plateGeo = [
    { path: [[-22, -8], [-16, -16], [-10, -10], [-14, -2]], bolt: [-16, -10] },
    { path: [[22, -8], [16, -16], [10, -10], [14, -2]], bolt: [16, -10] },
    { path: [[-10, 22], [-4, 16], [4, 16], [10, 22]], bolt: [0, 19] },
  ];
  for (let i = 0; i < plateGeo.length; i++) {
    const g = plateGeo[i];
    const plate = z.plates ? z.plates[i] : { alive: true };
    ctx.beginPath();
    ctx.moveTo(g.path[0][0], g.path[0][1]);
    for (let k = 1; k < g.path.length; k++) ctx.lineTo(g.path[k][0], g.path[k][1]);
    ctx.closePath();
    ctx.fillStyle = plate.alive ? "#5A4632" : "#1A0A0A";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,224,62,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (plate.alive) {
      ctx.fillStyle = VOLT.yellow;
      ctx.beginPath();
      ctx.arc(g.bolt[0], g.bolt[1], 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Eyes (yellow, 4x4).
  ctx.fillStyle = VOLT.yellow;
  ctx.fillRect(-6, -5, 4, 4);
  ctx.fillRect(2, -5, 4, 4);
  // Magenta grimace.
  ctx.strokeStyle = VOLT.magenta;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-8, 6);
  ctx.lineTo(-4, 10);
  ctx.lineTo(0, 7);
  ctx.lineTo(4, 10);
  ctx.lineTo(8, 6);
  ctx.stroke();
  ctx.restore();
  drawZombieHp(ctx, z.x, z.y - 22 - 8, z.hp, z.maxHp);
}

function drawVoltFuse(ctx, z) {
  const now = performance.now();
  const remaining = (z.detonateAt && z.detonateAt > 0) ? Math.max(0, z.detonateAt - _renderSimTime) : VOLT_FUSE_LIFE_MS;
  // Critical phase = last 1.5s of fuse.
  const critical = z.detonateAt > 0 && remaining < 1500;
  const pulseHz = critical ? 4 : 1.25;
  const pulsePhase = 0.5 + 0.5 * Math.sin(now * 0.001 * Math.PI * 2 * pulseHz);
  const auraColor = critical ? VOLT.magenta : VOLT.yellow;

  ctx.save();
  ctx.translate(z.x, z.y);

  // Outer dashed danger aura (rotating).
  ctx.save();
  ctx.rotate((now * 0.0005) % (Math.PI * 2));
  ctx.strokeStyle = auraColor;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.fillStyle = auraColor;
  ctx.globalAlpha = 0.06;
  ctx.beginPath();
  ctx.arc(0, 0, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.arc(0, 0, 32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Inner pulsing glow.
  ctx.globalAlpha = 0.18 + pulsePhase * 0.17;
  ctx.fillStyle = VOLT.yellow;
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = VOLT.yellow;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Body.
  ctx.fillStyle = "#5A4A1A";
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = VOLT.yellow;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Magenta cracks.
  ctx.strokeStyle = VOLT.magenta;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-10, -8); ctx.lineTo(-4, -2); ctx.lineTo(-8, 4);
  ctx.moveTo(8, -10); ctx.lineTo(4, -4); ctx.lineTo(10, 2);
  ctx.moveTo(-6, 10); ctx.lineTo(2, 8); ctx.lineTo(8, 12);
  ctx.stroke();

  // Eyes (circles).
  ctx.fillStyle = VOLT.magenta;
  ctx.beginPath(); ctx.arc(-4, -3, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4, -3, 2, 0, Math.PI * 2); ctx.fill();

  // Fuse stem + tip.
  ctx.strokeStyle = VOLT.yellow;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -15); ctx.lineTo(0, -22);
  ctx.stroke();
  ctx.fillStyle = VOLT.magenta;
  ctx.beginPath();
  ctx.arc(0, -25, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = VOLT.yellow;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
  drawZombieHp(ctx, z.x, z.y - 32 - 6, z.hp, z.maxHp);
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

function drawCrosshair(ctx, x, y, hitMarker = false) {
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
  if (hitMarker) {
    ctx.strokeStyle = VOLT.yellow;
    ctx.shadowColor = VOLT.yellow;
    ctx.shadowBlur = 6;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 14, y - 14); ctx.lineTo(x - 6, y - 6);
    ctx.moveTo(x + 14, y - 14); ctx.lineTo(x + 6, y - 6);
    ctx.moveTo(x - 14, y + 14); ctx.lineTo(x - 6, y + 6);
    ctx.moveTo(x + 14, y + 14); ctx.lineTo(x + 6, y + 6);
    ctx.stroke();
  }
  ctx.restore();
}
