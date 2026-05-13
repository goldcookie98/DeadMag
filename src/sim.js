import { WEAPONS, ARSENAL_ORDER } from "./weapons.js";
import { WALLS, SPAWN_POINTS, ZOMBIE_SPAWNS, MAP_W, MAP_H } from "./map.js";

const PLAYER_R = 14;
const ZOMBIE_R = 13;
const BASE_SPEED = 220;
const BULLET_R = 3;
const ZOMBIE_HIT_COOLDOWN = 600;
const RESPAWN_MS = 2200;
const SHOP_DURATION_MS = 15000;
const WAVE_INTERMISSION_MS = 1500;

let _id = 1;
const nextId = () => _id++;

export function makePlayer(name, color, isBot = false) {
  const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  return {
    id: nextId(),
    name, color, isBot,
    x: spawn.x, y: spawn.y,
    vx: 0, vy: 0,
    angle: 0,
    hp: 100, maxHp: 100, armor: 0,
    weapon: "pistol",
    inventory: { pistol: true },
    ammo: WEAPONS.pistol.mag,
    reloadingUntil: 0,
    lastShotAt: 0,
    cash: 0,
    lives: 3,
    alive: true,
    deathAt: 0,
    upgrades: { dmg: 0, rate: 0, reload: 0, speed: 0 },
    arsenalKills: new Set(),
    score: 0,
  };
}

function makeZombie(x, y, wave) {
  const speedMul = 1 + wave * 0.05;
  const hp = 40 + wave * 12;
  return {
    id: nextId(),
    x, y,
    hp, maxHp: hp,
    speed: 90 * speedMul,
    dmg: 12 + Math.floor(wave * 1.5),
    lastHitAt: 0,
  };
}

export function createSim(mode = "horde") {
  return {
    mode,
    tick: 0,
    timeMs: 0,
    players: new Map(),
    zombies: [],
    bullets: [],
    explosions: [],
    pickups: [],
    inputs: new Map(),
    wave: 0,
    waveActive: false,
    nextWaveAt: 0,
    zombiesToSpawn: 0,
    zombieSpawnAt: 0,
    shopOpenUntil: 0,
    shopOpen: false,
    gameOver: false,
    winnerId: null,
    events: [],
  };
}

export function addPlayer(sim, name, color, isBot = false) {
  const p = makePlayer(name, color, isBot);
  sim.players.set(p.id, p);
  if (sim.mode === "horde" && !sim.waveActive && sim.wave === 0) {
    sim.nextWaveAt = sim.timeMs + 2000;
  }
  return p;
}

export function removePlayer(sim, id) {
  sim.players.delete(id);
  sim.inputs.delete(id);
}

export function setInput(sim, id, input) {
  sim.inputs.set(id, input);
}

function moveSpeedFor(p) {
  return BASE_SPEED + p.upgrades.speed * 35;
}
function dmgMulFor(p)  { return 1 + p.upgrades.dmg  * 0.15; }
function rateMulFor(p) { return 1 - p.upgrades.rate * 0.10; }
function reloadMulFor(p) { return 1 - p.upgrades.reload * 0.12; }

function collideCircleWalls(x, y, r) {
  for (const w of WALLS) {
    const nx = Math.max(w.x, Math.min(x, w.x + w.w));
    const ny = Math.max(w.y, Math.min(y, w.y + w.h));
    const dx = x - nx, dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.01;
      return { hit: true, nx: dx / d, ny: dy / d, depth: r - d };
    }
  }
  return null;
}

function moveWithCollisions(ent, r, dx, dy) {
  ent.x += dx;
  let h = collideCircleWalls(ent.x, ent.y, r);
  if (h) { ent.x += h.nx * h.depth; ent.y += h.ny * h.depth; }
  ent.y += dy;
  h = collideCircleWalls(ent.x, ent.y, r);
  if (h) { ent.x += h.nx * h.depth; ent.y += h.ny * h.depth; }
  ent.x = Math.max(r, Math.min(MAP_W - r, ent.x));
  ent.y = Math.max(r, Math.min(MAP_H - r, ent.y));
}

function lineHitsWall(x1, y1, x2, y2) {
  for (const w of WALLS) {
    if (segRectIntersect(x1, y1, x2, y2, w)) return true;
  }
  return false;
}
function segRectIntersect(x1, y1, x2, y2, r) {
  if (x1 >= r.x && x1 <= r.x + r.w && y1 >= r.y && y1 <= r.y + r.h) return true;
  if (x2 >= r.x && x2 <= r.x + r.w && y2 >= r.y && y2 <= r.y + r.h) return true;
  const lines = [
    [r.x, r.y, r.x + r.w, r.y],
    [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
    [r.x + r.w, r.y + r.h, r.x, r.y + r.h],
    [r.x, r.y + r.h, r.x, r.y],
  ];
  for (const l of lines) if (segIntersect(x1, y1, x2, y2, l[0], l[1], l[2], l[3])) return true;
  return false;
}
function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (d === 0) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function tryShoot(sim, p, input) {
  const w = WEAPONS[p.weapon];
  const now = sim.timeMs;
  if (now < p.reloadingUntil) return;
  const rate = w.rate * rateMulFor(p);
  if (now - p.lastShotAt < rate) return;
  if (w.kind !== "melee" && p.ammo <= 0) {
    startReload(sim, p);
    return;
  }
  p.lastShotAt = now;

  const dx = input.aimX - p.x;
  const dy = input.aimY - p.y;
  const baseAngle = Math.atan2(dy, dx);

  if (w.kind === "melee") {
    for (const z of sim.zombies) {
      const ddx = z.x - p.x, ddy = z.y - p.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist > w.range) continue;
      const a = Math.atan2(ddy, ddx);
      const da = Math.abs(angleDiff(a, baseAngle));
      if (da < 0.6) {
        z.hp -= w.dmg * dmgMulFor(p);
        if (z.hp <= 0) onZombieDeath(sim, z, p);
      }
    }
    for (const [, other] of sim.players) {
      if (other.id === p.id || !other.alive) continue;
      if (sim.mode !== "arsenal") continue;
      const ddx = other.x - p.x, ddy = other.y - p.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist > w.range) continue;
      const a = Math.atan2(ddy, ddx);
      if (Math.abs(angleDiff(a, baseAngle)) < 0.6) {
        damagePlayer(sim, other, w.dmg * dmgMulFor(p), p);
      }
    }
    return;
  }

  const pellets = w.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    const angle = baseAngle + (Math.random() - 0.5) * w.spread * 2;
    sim.bullets.push({
      id: nextId(),
      x: p.x + Math.cos(angle) * (PLAYER_R + 4),
      y: p.y + Math.sin(angle) * (PLAYER_R + 4),
      vx: Math.cos(angle) * w.proj,
      vy: Math.sin(angle) * w.proj,
      ownerId: p.id,
      weapon: p.weapon,
      dmg: w.dmg * dmgMulFor(p),
      range: w.range,
      traveled: 0,
    });
  }
  p.ammo -= 1;
  if (p.ammo <= 0 && w.mag > 1) startReload(sim, p);
}

function startReload(sim, p) {
  const w = WEAPONS[p.weapon];
  if (w.kind === "melee") return;
  if (p.ammo >= w.mag) return;
  p.reloadingUntil = sim.timeMs + w.reload * reloadMulFor(p);
}

function finishReloads(sim) {
  for (const [, p] of sim.players) {
    if (p.reloadingUntil > 0 && sim.timeMs >= p.reloadingUntil) {
      p.ammo = WEAPONS[p.weapon].mag;
      p.reloadingUntil = 0;
    }
  }
}

function damagePlayer(sim, target, amount, attacker) {
  if (!target.alive) return;
  const absorb = Math.min(target.armor, amount * 0.6);
  target.armor = Math.max(0, target.armor - absorb);
  const taken = amount - absorb;
  target.hp -= taken;
  if (target.hp <= 0) onPlayerDeath(sim, target, attacker);
}

function onPlayerDeath(sim, target, attacker) {
  target.alive = false;
  target.hp = 0;
  target.deathAt = sim.timeMs;
  target.lives -= 1;
  sim.events.push({ type: "kill", killerId: attacker?.id ?? null, victimId: target.id, weapon: attacker?.weapon ?? null });

  if (attacker && sim.mode === "arsenal" && attacker.id !== target.id) {
    attacker.arsenalKills.add(attacker.weapon);
    attacker.score += 1;
    const idx = ARSENAL_ORDER.indexOf(attacker.weapon);
    const next = ARSENAL_ORDER[(idx + 1) % ARSENAL_ORDER.length];
    attacker.weapon = next;
    attacker.ammo = WEAPONS[next].mag;
    attacker.reloadingUntil = 0;
    if (attacker.arsenalKills.size >= ARSENAL_ORDER.length) {
      sim.gameOver = true;
      sim.winnerId = attacker.id;
    }
  }
}

function onZombieDeath(sim, z, killer) {
  sim.zombies = sim.zombies.filter((zz) => zz !== z);
  if (killer) {
    killer.cash += 10;
    killer.score += 1;
    sim.events.push({ type: "kill", killerId: killer.id, victimId: -1, weapon: killer.weapon });
  }
}

function respawnPlayer(sim, p) {
  if (p.lives <= 0) return;
  const sp = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  p.x = sp.x; p.y = sp.y;
  p.hp = p.maxHp; p.alive = true;
  p.ammo = WEAPONS[p.weapon].mag;
  p.reloadingUntil = 0;
  sim.events.push({ type: "respawn", id: p.id });
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function updateBullets(sim, dt) {
  const next = [];
  for (const b of sim.bullets) {
    const stepX = b.vx * dt;
    const stepY = b.vy * dt;
    const nx = b.x + stepX;
    const ny = b.y + stepY;

    if (lineHitsWall(b.x, b.y, nx, ny)) {
      if (b.weapon === "rocket") rocketExplode(sim, b.x, b.y, b);
      continue;
    }

    let hit = null;
    for (const z of sim.zombies) {
      if (circleSeg(b.x, b.y, nx, ny, z.x, z.y, ZOMBIE_R + BULLET_R)) { hit = { zombie: z }; break; }
    }
    if (!hit && sim.mode === "arsenal") {
      for (const [, op] of sim.players) {
        if (op.id === b.ownerId || !op.alive) continue;
        if (circleSeg(b.x, b.y, nx, ny, op.x, op.y, PLAYER_R + BULLET_R)) { hit = { player: op }; break; }
      }
    }

    if (hit) {
      const owner = sim.players.get(b.ownerId);
      if (b.weapon === "rocket") {
        rocketExplode(sim, nx, ny, b);
      } else if (hit.zombie) {
        hit.zombie.hp -= b.dmg;
        if (hit.zombie.hp <= 0) onZombieDeath(sim, hit.zombie, owner);
      } else if (hit.player) {
        damagePlayer(sim, hit.player, b.dmg, owner);
      }
      continue;
    }

    b.x = nx; b.y = ny;
    b.traveled += Math.hypot(stepX, stepY);
    if (b.traveled < b.range && b.x > 0 && b.x < MAP_W && b.y > 0 && b.y < MAP_H) {
      next.push(b);
    } else if (b.weapon === "rocket") {
      rocketExplode(sim, b.x, b.y, b);
    }
  }
  sim.bullets = next;
}

function rocketExplode(sim, x, y, b) {
  const w = WEAPONS.rocket;
  const owner = sim.players.get(b.ownerId);
  sim.explosions.push({ x, y, r: w.splashR, t: sim.timeMs });
  for (const z of [...sim.zombies]) {
    const d = Math.hypot(z.x - x, z.y - y);
    if (d <= w.splashR) {
      const dmg = w.splashDmg * (1 - d / w.splashR);
      z.hp -= dmg;
      if (z.hp <= 0) onZombieDeath(sim, z, owner);
    }
  }
  if (sim.mode === "arsenal") {
    for (const [, p] of sim.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= w.splashR && p.id !== b.ownerId) {
        damagePlayer(sim, p, w.splashDmg * (1 - d / w.splashR), owner);
      }
    }
  }
}

function circleSeg(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  const bb = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = bb * bb - 4 * a * c;
  if (disc < 0) return false;
  disc = Math.sqrt(disc);
  const t1 = (-bb - disc) / (2 * a);
  const t2 = (-bb + disc) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

function updateZombies(sim, dt) {
  for (const z of sim.zombies) {
    let target = null, best = Infinity;
    for (const [, p] of sim.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - z.x, p.y - z.y);
      if (d < best) { best = d; target = p; }
    }
    if (!target) continue;
    const ang = Math.atan2(target.y - z.y, target.x - z.x);
    const dx = Math.cos(ang) * z.speed * dt;
    const dy = Math.sin(ang) * z.speed * dt;
    moveWithCollisions(z, ZOMBIE_R, dx, dy);

    if (best < ZOMBIE_R + PLAYER_R + 4 && sim.timeMs - z.lastHitAt > ZOMBIE_HIT_COOLDOWN) {
      z.lastHitAt = sim.timeMs;
      damagePlayer(sim, target, z.dmg, null);
    }
  }
}

function updateHorde(sim) {
  if (sim.mode !== "horde") return;
  if (sim.gameOver) return;

  const allDead = [...sim.players.values()].every((p) => p.lives <= 0);
  if (allDead && sim.players.size > 0) {
    sim.gameOver = true;
    return;
  }

  if (sim.waveActive && sim.zombiesToSpawn === 0 && sim.zombies.length === 0) {
    sim.waveActive = false;
    sim.shopOpen = true;
    sim.shopOpenUntil = sim.timeMs + SHOP_DURATION_MS;
    for (const [, p] of sim.players) p.cash += 50 + sim.wave * 10;
    sim.events.push({ type: "wave-end", wave: sim.wave });
  }

  if (sim.shopOpen && sim.timeMs >= sim.shopOpenUntil) {
    sim.shopOpen = false;
    sim.nextWaveAt = sim.timeMs + WAVE_INTERMISSION_MS;
  }

  if (!sim.waveActive && !sim.shopOpen && sim.timeMs >= sim.nextWaveAt && sim.players.size > 0) {
    sim.wave += 1;
    sim.zombiesToSpawn = 6 + sim.wave * 3;
    sim.waveActive = true;
    sim.zombieSpawnAt = sim.timeMs;
    sim.events.push({ type: "wave-start", wave: sim.wave });
    for (const [, p] of sim.players) {
      if (p.lives > 0 && !p.alive) respawnPlayer(sim, p);
    }
  }

  if (sim.waveActive && sim.zombiesToSpawn > 0 && sim.timeMs >= sim.zombieSpawnAt) {
    const sp = ZOMBIE_SPAWNS[Math.floor(Math.random() * ZOMBIE_SPAWNS.length)];
    sim.zombies.push(makeZombie(sp.x, sp.y, sim.wave));
    sim.zombiesToSpawn -= 1;
    sim.zombieSpawnAt = sim.timeMs + Math.max(150, 600 - sim.wave * 20);
  }
}

function updateRespawns(sim) {
  for (const [, p] of sim.players) {
    if (!p.alive && p.lives > 0 && sim.mode === "arsenal" && sim.timeMs - p.deathAt >= RESPAWN_MS) {
      p.lives = 99;
      respawnPlayer(sim, p);
    }
  }
}

function updateBots(sim, dt) {
  for (const [, p] of sim.players) {
    if (!p.isBot || !p.alive) continue;
    let target = null, best = Infinity;
    if (sim.mode === "horde") {
      for (const z of sim.zombies) {
        const d = Math.hypot(z.x - p.x, z.y - p.y);
        if (d < best) { best = d; target = z; }
      }
    } else {
      for (const [, op] of sim.players) {
        if (op.id === p.id || !op.alive) continue;
        const d = Math.hypot(op.x - p.x, op.y - p.y);
        if (d < best) { best = d; target = op; }
      }
    }
    let mx = 0, my = 0;
    if (target) {
      const dx = target.x - p.x, dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const desired = WEAPONS[p.weapon].kind === "melee" ? 40 : 250;
      const sign = d < desired ? -1 : (d > desired + 80 ? 1 : 0);
      mx = (dx / d) * sign;
      my = (dy / d) * sign;
      mx += (Math.random() - 0.5) * 0.4;
      my += (Math.random() - 0.5) * 0.4;
      const len = Math.hypot(mx, my) || 1;
      mx /= len; my /= len;
    }
    const input = {
      mx, my,
      aimX: target ? target.x : p.x + 10,
      aimY: target ? target.y : p.y,
      shoot: !!target && best < 500,
      reload: false,
    };
    sim.inputs.set(p.id, input);
  }
}

function updatePlayers(sim, dt) {
  for (const [, p] of sim.players) {
    if (!p.alive) continue;
    const input = sim.inputs.get(p.id);
    if (!input) continue;
    const speed = moveSpeedFor(p);
    const dx = input.mx * speed * dt;
    const dy = input.my * speed * dt;
    moveWithCollisions(p, PLAYER_R, dx, dy);
    p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    if (input.reload) startReload(sim, p);
    if (input.shoot) tryShoot(sim, p, input);
  }
}

function pruneExplosions(sim) {
  sim.explosions = sim.explosions.filter((e) => sim.timeMs - e.t < 400);
}

export function step(sim, dt) {
  sim.timeMs += dt * 1000;
  sim.tick += 1;
  sim.events = [];
  updateBots(sim, dt);
  updatePlayers(sim, dt);
  updateBullets(sim, dt);
  updateZombies(sim, dt);
  finishReloads(sim);
  updateHorde(sim);
  updateRespawns(sim);
  pruneExplosions(sim);
}

export function shopBuy(sim, playerId, itemId) {
  const p = sim.players.get(playerId);
  if (!p || !sim.shopOpen) return false;
  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) return false;
  if (p.cash < item.cost(p)) return false;
  if (!item.canBuy(p)) return false;
  p.cash -= item.cost(p);
  item.apply(p);
  return true;
}

export const SHOP_ITEMS = [
  { id: "buy-shotgun", name: "SHOTGUN",      desc: "Buy weapon.",                cost: () => 1000, canBuy: (p) => !p.inventory.shotgun, apply: (p) => { p.inventory.shotgun = true; p.weapon = "shotgun"; p.ammo = WEAPONS.shotgun.mag; } },
  { id: "buy-smg",     name: "SMG",          desc: "Buy weapon.",                cost: () => 1500, canBuy: (p) => !p.inventory.smg,     apply: (p) => { p.inventory.smg = true; p.weapon = "smg"; p.ammo = WEAPONS.smg.mag; } },
  { id: "buy-sniper",  name: "SNIPER",       desc: "Buy weapon.",                cost: () => 2500, canBuy: (p) => !p.inventory.sniper,  apply: (p) => { p.inventory.sniper = true; p.weapon = "sniper"; p.ammo = WEAPONS.sniper.mag; } },
  { id: "buy-rocket",  name: "ROCKET",       desc: "Buy weapon.",                cost: () => 4000, canBuy: (p) => !p.inventory.rocket,  apply: (p) => { p.inventory.rocket = true; p.weapon = "rocket"; p.ammo = WEAPONS.rocket.mag; } },
  { id: "buy-knife",   name: "KNIFE",        desc: "Buy weapon.",                cost: () => 200,  canBuy: (p) => !p.inventory.knife,   apply: (p) => { p.inventory.knife = true; } },
  { id: "upg-dmg",     name: "+DAMAGE",      desc: "+15% damage per tier.",     cost: (p) => 400 + p.upgrades.dmg * 300, canBuy: (p) => p.upgrades.dmg < 5, apply: (p) => p.upgrades.dmg += 1 },
  { id: "upg-rate",    name: "+FIRE RATE",   desc: "-10% delay per tier.",      cost: (p) => 500 + p.upgrades.rate * 300, canBuy: (p) => p.upgrades.rate < 5, apply: (p) => p.upgrades.rate += 1 },
  { id: "upg-reload",  name: "+RELOAD",      desc: "-12% reload per tier.",     cost: (p) => 400 + p.upgrades.reload * 200, canBuy: (p) => p.upgrades.reload < 5, apply: (p) => p.upgrades.reload += 1 },
  { id: "upg-speed",   name: "+SPEED",       desc: "Faster move per tier.",     cost: (p) => 600 + p.upgrades.speed * 300, canBuy: (p) => p.upgrades.speed < 3, apply: (p) => p.upgrades.speed += 1 },
  { id: "armor",       name: "ARMOR +50",    desc: "Absorbs 60% of dmg.",       cost: () => 500, canBuy: (p) => p.armor < 150, apply: (p) => p.armor = Math.min(150, p.armor + 50) },
  { id: "heal",        name: "MEDKIT",       desc: "Full heal.",                cost: () => 250, canBuy: (p) => p.hp < p.maxHp, apply: (p) => p.hp = p.maxHp },
  { id: "life",        name: "EXTRA LIFE",   desc: "+1 life.",                  cost: () => 2000, canBuy: () => true, apply: (p) => p.lives += 1 },
];

export function switchWeapon(sim, playerId, weaponId) {
  const p = sim.players.get(playerId);
  if (!p || !p.inventory[weaponId]) return;
  p.weapon = weaponId;
  p.ammo = WEAPONS[weaponId].mag;
  p.reloadingUntil = 0;
}

export const CONSTANTS = { PLAYER_R, ZOMBIE_R, BULLET_R, MAP_W, MAP_H };
