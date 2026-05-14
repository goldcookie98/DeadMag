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
const DOWN_BLEED_MS = 30000;
const REVIVE_TIME_MS = 5000;
const REVIVE_RANGE = PLAYER_R * 5.5;

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
    reloadDuration: 0,
    lastShotAt: 0,
    cash: 0,
    lives: 3,
    alive: true,
    ready: false,
    state: "alive",
    deathAt: 0,
    downedAt: 0,
    bleedOutAt: 0,
    reviveProgress: 0,
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
    stuckMs: 0,
    detourDir: 0,
    detourUntil: 0,
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
  const base = BASE_SPEED + p.upgrades.speed * 35;
  return p.weapon === "knife" ? base * 1.5 : base;
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
  const ox = ent.x, oy = ent.y;
  ent.x += dx;
  let h = collideCircleWalls(ent.x, ent.y, r);
  if (h) { ent.x += h.nx * h.depth; ent.y += h.ny * h.depth; }
  ent.y += dy;
  h = collideCircleWalls(ent.x, ent.y, r);
  if (h) { ent.x += h.nx * h.depth; ent.y += h.ny * h.depth; }
  ent.x = Math.max(r, Math.min(MAP_W - r, ent.x));
  ent.y = Math.max(r, Math.min(MAP_H - r, ent.y));
  return { dx: ent.x - ox, dy: ent.y - oy };
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
  if (w.kind !== "melee" && p.ammo <= 0) {
    startReload(sim, p);
    return;
  }
  const rate = w.rate * rateMulFor(p);
  if (now - p.lastShotAt < rate) return;
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
  if (p.ammo <= 0 && w.kind === "ranged") startReload(sim, p);
}

function startReload(sim, p) {
  const w = WEAPONS[p.weapon];
  if (w.kind === "melee") return;
  if (p.ammo >= w.mag) return;
  if (sim.timeMs < p.reloadingUntil) return;
  const dur = w.reload * reloadMulFor(p);
  p.reloadDuration = dur;
  p.reloadingUntil = sim.timeMs + dur;
}

function finishReloads(sim) {
  for (const [, p] of sim.players) {
    if (p.reloadingUntil > 0 && sim.timeMs >= p.reloadingUntil) {
      p.ammo = WEAPONS[p.weapon].mag;
      p.reloadingUntil = 0;
      p.reloadDuration = 0;
    }
  }
}

function damagePlayer(sim, target, amount, attacker) {
  if (target.state === "dead") return;
  const absorb = Math.min(target.armor, amount * 0.6);
  target.armor = Math.max(0, target.armor - absorb);
  const taken = amount - absorb;
  target.hp -= taken;
  if (target.hp > 0) return;

  if (sim.mode === "horde") {
    if (target.state === "alive") onPlayerDown(sim, target);
    else if (target.state === "down") onPlayerDead(sim, target, attacker);
  } else {
    onPlayerDeath(sim, target, attacker);
  }
}

function onPlayerDown(sim, target) {
  target.state = "down";
  target.alive = false;
  target.hp = 0;
  target.downedAt = sim.timeMs;
  target.bleedOutAt = sim.timeMs + DOWN_BLEED_MS;
  target.reviveProgress = 0;
  target.reloadingUntil = 0;
  sim.events.push({ type: "down", id: target.id });
}

function onPlayerDead(sim, target, attacker) {
  target.state = "dead";
  target.alive = false;
  target.hp = 0;
  target.deathAt = sim.timeMs;
  target.lives -= 1;
  target.reviveProgress = 0;
  sim.events.push({ type: "death", id: target.id, killerId: attacker?.id ?? null });
}

function onPlayerDeath(sim, target, attacker) {
  target.alive = false;
  target.state = "dead";
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

function updateDowns(sim, dt) {
  if (sim.mode !== "horde") return;
  for (const [, p] of sim.players) {
    if (p.state !== "down") continue;
    if (sim.timeMs >= p.bleedOutAt) {
      onPlayerDead(sim, p, null);
      continue;
    }
    let reviverNear = false;
    for (const [, r] of sim.players) {
      if (r.id === p.id || r.state !== "alive") continue;
      const input = sim.inputs.get(r.id);
      if (!input?.revive) continue;
      const d = Math.hypot(r.x - p.x, r.y - p.y);
      if (d <= REVIVE_RANGE) { reviverNear = true; break; }
    }
    if (reviverNear) {
      p.reviveProgress += dt * 1000;
      if (p.reviveProgress >= REVIVE_TIME_MS) revivePlayer(sim, p, 50);
    } else if (p.reviveProgress > 0) {
      p.reviveProgress = Math.max(0, p.reviveProgress - dt * 1500);
    }
  }
}

function revivePlayer(sim, p, hp) {
  p.state = "alive";
  p.alive = true;
  p.hp = Math.min(p.maxHp, hp);
  p.reviveProgress = 0;
  p.bleedOutAt = 0;
  p.downedAt = 0;
  p.reloadingUntil = 0;
  p.ammo = WEAPONS[p.weapon].mag;
  sim.events.push({ type: "revive", id: p.id });
}

export function shopRevive(sim, playerId) {
  const p = sim.players.get(playerId);
  if (!p || p.state !== "dead") return false;
  const sp = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  p.x = sp.x; p.y = sp.y;
  revivePlayer(sim, p, p.maxHp);
  return true;
}

function onZombieDeath(sim, z, killer) {
  sim.zombies = sim.zombies.filter((zz) => zz !== z);
  if (killer) {
    killer.cash += 20;
    killer.score += 1;
    sim.events.push({ type: "kill", killerId: killer.id, victimId: -1, weapon: killer.weapon });
  }
}

function respawnPlayer(sim, p) {
  if (p.lives <= 0) return;
  const sp = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  p.x = sp.x; p.y = sp.y;
  p.hp = p.maxHp; p.alive = true;
  p.state = "alive";
  p.downedAt = 0;
  p.bleedOutAt = 0;
  p.reviveProgress = 0;
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
    const baseAng = Math.atan2(target.y - z.y, target.x - z.x);
    let ang = baseAng;
    if (sim.timeMs < z.detourUntil) ang = baseAng + z.detourDir;
    const dx = Math.cos(ang) * z.speed * dt;
    const dy = Math.sin(ang) * z.speed * dt;
    const moved = moveWithCollisions(z, ZOMBIE_R, dx, dy);

    const expected = z.speed * dt;
    const actual = Math.hypot(moved.dx, moved.dy);
    if (expected > 0.001 && actual < expected * 0.4) {
      z.stuckMs += dt * 1000;
      if (z.stuckMs > 120 && sim.timeMs >= z.detourUntil) {
        const side = pickDetourSide(z, ZOMBIE_R, baseAng);
        z.detourDir = side * (Math.PI / 2);
        z.detourUntil = sim.timeMs + 350 + Math.random() * 300;
      }
    } else {
      z.stuckMs = 0;
    }

    if (best < ZOMBIE_R + PLAYER_R + 4 && sim.timeMs - z.lastHitAt > ZOMBIE_HIT_COOLDOWN) {
      z.lastHitAt = sim.timeMs;
      damagePlayer(sim, target, z.dmg, null);
    }
  }
}

function pickDetourSide(ent, r, baseAng) {
  const probe = r * 1.6;
  const leftAng = baseAng - Math.PI / 2;
  const rightAng = baseAng + Math.PI / 2;
  const lx = ent.x + Math.cos(leftAng) * probe;
  const ly = ent.y + Math.sin(leftAng) * probe;
  const rx = ent.x + Math.cos(rightAng) * probe;
  const ry = ent.y + Math.sin(rightAng) * probe;
  const leftBlocked = collideCircleWalls(lx, ly, r) != null;
  const rightBlocked = collideCircleWalls(rx, ry, r) != null;
  if (leftBlocked && !rightBlocked) return 1;
  if (rightBlocked && !leftBlocked) return -1;
  return Math.random() < 0.5 ? -1 : 1;
}

function updateHorde(sim) {
  if (sim.mode !== "horde") return;
  if (sim.gameOver) return;

  if (sim.players.size > 0) {
    const players = [...sim.players.values()];
    const anyAlive = players.some((p) => p.state === "alive");
    const allDead = players.every((p) => p.state === "dead");
    if (allDead || (!anyAlive && players.every((p) => p.lives <= 0))) {
      sim.gameOver = true;
      return;
    }
  }

  if (sim.waveActive && sim.zombiesToSpawn === 0 && sim.zombies.length === 0) {
    sim.waveActive = false;
    sim.shopOpen = true;
    sim.shopOpenUntil = sim.timeMs + SHOP_DURATION_MS;
    for (const [, p] of sim.players) { p.cash += 50 + sim.wave * 10; p.ready = false; }
    sim.events.push({ type: "wave-end", wave: sim.wave });
  }

  if (sim.shopOpen) {
    const alive = [...sim.players.values()].filter((p) => p.state === "alive");
    if (alive.length > 0 && alive.every((p) => p.ready)) {
      sim.shopOpenUntil = sim.timeMs;
    }
  }

  if (sim.shopOpen && sim.timeMs >= sim.shopOpenUntil) {
    sim.shopOpen = false;
    for (const [, p] of sim.players) p.ready = false;
    sim.nextWaveAt = sim.timeMs + WAVE_INTERMISSION_MS;
  }

  if (!sim.waveActive && !sim.shopOpen && sim.timeMs >= sim.nextWaveAt && sim.players.size > 0) {
    sim.wave += 1;
    sim.zombiesToSpawn = 6 + sim.wave * 3;
    sim.waveActive = true;
    sim.zombieSpawnAt = sim.timeMs;
    sim.events.push({ type: "wave-start", wave: sim.wave });
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
    if (!p._bot) p._bot = { detourUntil: 0, detourDir: 0, lastX: p.x, lastY: p.y, stuckMs: 0, jitterSeed: (p.id * 9301 + 49297) % 233280 };
    const bot = p._bot;
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

    const w = WEAPONS[p.weapon];
    const desiredBase = w.kind === "melee" ? 38 : 220;
    const desiredJitter = (bot.jitterSeed % 100) * 1.2;
    const desired = desiredBase + (w.kind === "melee" ? 0 : desiredJitter);

    let mx = 0, my = 0;
    if (target) {
      const dx = target.x - p.x, dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const sign = d < desired ? -1 : (d > desired + 80 ? 1 : 0);
      let baseAng = Math.atan2(dy, dx);
      if (sim.timeMs < bot.detourUntil) baseAng += bot.detourDir;
      mx = Math.cos(baseAng) * sign;
      my = Math.sin(baseAng) * sign;
      const wob = ((bot.jitterSeed >> 4) % 7 - 3) * 0.06;
      mx += (Math.sin(sim.timeMs * 0.003 + bot.jitterSeed) + wob) * 0.25;
      my += (Math.cos(sim.timeMs * 0.0027 + bot.jitterSeed) - wob) * 0.25;
      const len = Math.hypot(mx, my) || 1;
      mx /= len; my /= len;
    }

    const moved = Math.hypot(p.x - bot.lastX, p.y - bot.lastY);
    const expected = moveSpeedFor(p) * dt;
    if (target && expected > 0.001 && moved < expected * 0.4 && Math.hypot(mx, my) > 0.5) {
      bot.stuckMs += dt * 1000;
      if (bot.stuckMs > 120 && sim.timeMs >= bot.detourUntil) {
        const baseAng = Math.atan2(target.y - p.y, target.x - p.x);
        const side = pickDetourSide(p, PLAYER_R, baseAng);
        bot.detourDir = side * (Math.PI / 2);
        bot.detourUntil = sim.timeMs + 400 + Math.random() * 400;
      }
    } else {
      bot.stuckMs = 0;
    }
    bot.lastX = p.x; bot.lastY = p.y;

    const reloading = sim.timeMs < p.reloadingUntil;
    const shootClear = target ? !lineHitsWall(p.x, p.y, target.x, target.y) : false;
    const inFiringWindow = !!target && best < 500 && shootClear;
    const wantReload =
      w.kind !== "melee" &&
      !reloading &&
      p.ammo < w.mag &&
      (p.ammo === 0 || !inFiringWindow || p.ammo / w.mag <= 0.34);

    const input = {
      mx, my,
      aimX: target ? target.x : p.x + 10,
      aimY: target ? target.y : p.y,
      shoot: inFiringWindow && !reloading && (w.kind === "melee" || p.ammo > 0),
      reload: wantReload,
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
  // Refill ammo BEFORE reading shoot/reload inputs. Otherwise on the tick where
  // a reload completes, tryShoot sees ammo=0 and re-triggers startReload, which
  // pushes reloadingUntil into the future and finishReloads skips the refill —
  // leaving the player stuck reloading forever under autofire.
  finishReloads(sim);
  updateBots(sim, dt);
  updatePlayers(sim, dt);
  updateBullets(sim, dt);
  updateZombies(sim, dt);
  updateDowns(sim, dt);
  updateHorde(sim);
  updateRespawns(sim);
  pruneExplosions(sim);
}

export function shopBuy(sim, playerId, itemId) {
  const p = sim.players.get(playerId);
  if (!p || !sim.shopOpen) return false;
  if (p.state !== "alive") return false;
  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) return false;
  const cost = item.cost(p, sim);
  if (p.cash < cost) return false;
  if (!item.canBuy(p, sim)) return false;
  p.cash -= cost;
  item.apply(p, sim);
  sim.events.push({ type: "buy", playerId: p.id, itemId, itemName: item.name, cost });
  return true;
}

export function setReady(sim, playerId, value) {
  const p = sim.players.get(playerId);
  if (!p || !sim.shopOpen) return;
  p.ready = !!value;
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
  { id: "revive",      name: "REVIVE MATE",  desc: "Bring a dead teammate back.", cost: () => 1500,
    canBuy: (p, sim) => !!sim && [...sim.players.values()].some((o) => o.id !== p.id && o.state === "dead" && o.lives > 0),
    apply:  (p, sim) => {
      const dead = [...sim.players.values()].find((o) => o.id !== p.id && o.state === "dead" && o.lives > 0);
      if (dead) shopRevive(sim, dead.id);
    } },
];

export function switchWeapon(sim, playerId, weaponId) {
  const p = sim.players.get(playerId);
  if (!p || !p.inventory[weaponId]) return;
  p.weapon = weaponId;
  p.ammo = WEAPONS[weaponId].mag;
  p.reloadingUntil = 0;
}

export function reloadPlayer(sim, playerId) {
  const p = sim.players.get(playerId);
  if (p) startReload(sim, p);
}

export const CONSTANTS = { PLAYER_R, ZOMBIE_R, BULLET_R, MAP_W, MAP_H };
