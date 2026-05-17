import { WEAPONS, ARSENAL_ORDER } from "./weapons.js";
import {
  WALLS, BARRICADE, CRATE, PAP, DOORWAY, SPAWN_POINTS, ZOMBIE_SPAWNS,
  ROOM1_W, MAP_W, MAP_H, currentWalls,
} from "./map.js";
import { buildNavGrid, computeFlowField, sampleFlow } from "./pathfinding.js";

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

// Special-zombie tuning
const VOLT_FUSE_LIFE_MS = 11000;
const VOLT_FUSE_PROX_DETONATE = 36;
const VOLT_FUSE_SPLASH_R = 120;
const VOLT_FUSE_DMG = 80;
const VOLT_FUSE_SIGHT_R = 520;
const VOLT_FUSE_TIP_OFFSET = 25;
const VOLT_FUSE_TIP_R = 5;
const BRUTE_PLATE_HP = 100;
const BRUTE_PLATE_ABSORB = 0.7;
const BRUTE_SHOVE = 30;

// Pathfinding tuning
const FLOW_REFRESH_MS = 200;
const DIRECT_CHASE_RANGE = 80;

// Interactions
const INTERACT_RANGE = 64;
const CRATE_COST = 950;
const CRATE_ANIM_MS = 3500;
const CRATE_BLOW_UP_DMG = 60;
const CRATE_BOOM_COUNTDOWN_MS = 3000;
const CRATE_BOOM_RADIUS = 110;
const BARRICADE_COST = 1000;
const PAP_COST = 10000;
const PAP_MIN_WAVE = 5;
const CRATE_BLOWUP_CHANCE = 0.10;
const CRATE_VOLT_CHANCE = 0.05;
const CRATE_RIPPLE_CHANCE = 0.05;
const CRATE_NORMAL_POOL = ["shotgun", "smg", "sniper", "rocket", "knife"];
export const CRATE_PENDING_EXPIRE_MS = 10_000;

let _id = 1;
const nextId = () => _id++;

// Stats produced by Pack-a-Punch. Applied as a derived multiplier — we don't
// add a "smg+" variant to WEAPONS, we just multiply at the read site.
function weaponEff(p, slot = p.activeSlot) {
  const id = p.slots?.[slot];
  if (!id) return null;
  const base = WEAPONS[id];
  if (!base) return null;
  if (!p.slotPacked?.[slot]) return base;
  return {
    ...base,
    dmg: base.dmg * 2,
    mag: base.mag * 2,
    rate: base.rate / 2,
    range: base.range * 2,
    splashR: base.splashR != null ? base.splashR * 1.4 : base.splashR,
    splashDmg: base.splashDmg != null ? base.splashDmg * 2 : base.splashDmg,
    chainCount: base.chainCount != null ? base.chainCount + 2 : base.chainCount,
    chainRange: base.chainRange != null ? base.chainRange * 1.4 : base.chainRange,
    chargeMaxMs: base.chargeMaxMs != null ? base.chargeMaxMs * 0.7 : base.chargeMaxMs,
  };
}

function syncActiveWeapon(p) {
  const id = p.slots[p.activeSlot];
  p.weapon = id;
  p.ammo = id ? (p.slotAmmo[p.activeSlot] ?? 0) : 0;
}

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
    slots: ["pistol", null],
    activeSlot: 0,
    slotAmmo: [WEAPONS.pistol.mag, 0],
    slotPacked: [false, false],
    ammo: WEAPONS.pistol.mag,
    reloadingUntil: 0,
    reloadDuration: 0,
    lastShotAt: 0,
    chargingSince: 0,
    crateOpenedAt: 0,
    crateResult: null,
    crateBlowUp: false,
    crateResultPending: null,
    crateResultPendingSince: 0,
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
    stats: {
      damageDealt: 0,
      shotsFired: 0,
      shotsHit: 0,
      zombieKillsByKind: { normal: 0, sprinter: 0, brute: 0, "volt-fuse": 0 },
      moneyEarned: 0,
      cratesOpened: 0,
      killsByWeapon: {},
      weaponsCollected: new Set(["pistol"]),
    },
  };
}

function makeZombie(x, y, wave) {
  const speedMul = 1 + wave * 0.05;
  const hp = 40 + wave * 12;
  return {
    id: nextId(),
    kind: "normal",
    radius: ZOMBIE_R,
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

function makeSprinter(x, y, wave) {
  const z = makeZombie(x, y, wave);
  z.kind = "sprinter";
  z.radius = 11;
  z.hp = Math.round(z.hp * 0.5);
  z.maxHp = z.hp;
  z.speed *= 1.6;
  z.dmg = Math.round(z.dmg * 0.5);
  return z;
}

function makeBrute(x, y, wave) {
  const z = makeZombie(x, y, wave);
  z.kind = "brute";
  z.radius = 22;
  z.hp = Math.round(z.hp * 4);
  z.maxHp = z.hp;
  z.speed *= 0.6;
  z.dmg = Math.round(z.dmg * 2);
  z.plates = [
    { hp: BRUTE_PLATE_HP, maxHp: BRUTE_PLATE_HP, alive: true },
    { hp: BRUTE_PLATE_HP, maxHp: BRUTE_PLATE_HP, alive: true },
    { hp: BRUTE_PLATE_HP, maxHp: BRUTE_PLATE_HP, alive: true },
  ];
  return z;
}

function makeVoltFuse(x, y, wave) {
  const z = makeZombie(x, y, wave);
  z.kind = "volt-fuse";
  z.radius = 15;
  z.firstSightedAt = 0;
  z.detonateAt = 0;
  z.detonating = false;
  return z;
}

function makeZombieOfKind(kind, x, y, wave) {
  if (kind === "sprinter") return makeSprinter(x, y, wave);
  if (kind === "brute") return makeBrute(x, y, wave);
  if (kind === "volt-fuse") return makeVoltFuse(x, y, wave);
  return makeZombie(x, y, wave);
}

function pickZombieKind(sim) {
  if (sim.forceZombieKind) return sim.forceZombieKind;
  const wave = sim.wave;
  if (wave < 3) return "normal";
  const specialRate = Math.min(0.40, 0.20 + (wave - 3) * 0.025);
  if (Math.random() >= specialRate) return "normal";
  const pool = ["sprinter"];
  if (wave >= 5) pool.push("brute");
  if (wave >= 7) pool.push("volt-fuse");
  return pool[Math.floor(Math.random() * pool.length)];
}

function rebuildNav(sim) {
  if (!sim._nav) return;
  sim._nav.grid = buildNavGrid(currentWalls(sim), MAP_W, MAP_H);
  sim._nav.fields.clear();
  sim._nav.lastUpdateAt = -Infinity;
}

export function createSim(mode = "horde") {
  const sim = {
    mode,
    tick: 0,
    timeMs: 0,
    players: new Map(),
    zombies: [],
    bullets: [],
    explosions: [],
    chainBolts: [],
    sonicRings: [],
    pickups: [],
    inputs: new Map(),
    wave: 0,
    waveActive: false,
    nextWaveAt: 0,
    zombiesToSpawn: 0,
    zombieSpawnAt: 0,
    packQueue: null,
    forceZombieKind: null,
    shopOpenUntil: 0,
    shopOpen: false,
    gameOver: false,
    winnerId: null,
    barricadeDown: false,
    // Crate position is mutable — a BOOM result detonates the crate and
    // teleports it to a new random spot in room 1.
    crateRect: { x: CRATE.x, y: CRATE.y, w: CRATE.w, h: CRATE.h },
    crateBoom: null, // { x, y, endsAt } when a boom countdown is active
    events: [],
    _nav: { grid: null, fields: new Map(), lastUpdateAt: -Infinity },
  };
  rebuildNav(sim);
  return sim;
}

export function addPlayer(sim, name, color, isBot = false, forcedId = null) {
  const p = makePlayer(name, color, isBot);
  if (forcedId != null) p.id = forcedId;
  sim.players.set(p.id, p);
  if (sim.mode === "horde" && !sim.waveActive && sim.wave === 0) {
    sim.nextWaveAt = sim.timeMs + 2000;
  }
  return p;
}

function serializeStats(s) {
  if (!s) return null;
  return {
    damageDealt: s.damageDealt,
    shotsFired: s.shotsFired,
    shotsHit: s.shotsHit,
    zombieKillsByKind: { ...s.zombieKillsByKind },
    moneyEarned: s.moneyEarned,
    cratesOpened: s.cratesOpened,
    killsByWeapon: { ...s.killsByWeapon },
    weaponsCollected: [...s.weaponsCollected],
  };
}

// Wire-format snapshot for transmission over DataChannels. Maps/Sets aren't
// JSON-serializable, so we flatten to arrays here; the client re-inflates.
// `_bot` is host-only AI state and is stripped (guests don't run AI).
export function serializeSim(sim) {
  const players = [];
  for (const [, p] of sim.players) {
    players.push({
      id: p.id,
      name: p.name, color: p.color, isBot: p.isBot,
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, angle: p.angle,
      hp: p.hp, maxHp: p.maxHp, armor: p.armor,
      weapon: p.weapon,
      slots: [...p.slots],
      activeSlot: p.activeSlot,
      slotAmmo: [...p.slotAmmo],
      slotPacked: [...p.slotPacked],
      ammo: p.ammo, reloadingUntil: p.reloadingUntil, reloadDuration: p.reloadDuration,
      lastShotAt: p.lastShotAt, chargingSince: p.chargingSince,
      crateOpenedAt: p.crateOpenedAt, crateResult: p.crateResult, crateBlowUp: p.crateBlowUp,
      crateResultPending: p.crateResultPending,
      crateResultPendingSince: p.crateResultPendingSince,
      cash: p.cash, lives: p.lives, alive: p.alive, ready: p.ready,
      state: p.state, deathAt: p.deathAt, downedAt: p.downedAt,
      bleedOutAt: p.bleedOutAt, reviveProgress: p.reviveProgress,
      upgrades: p.upgrades,
      arsenalKills: [...p.arsenalKills],
      score: p.score,
      stats: serializeStats(p.stats),
    });
  }
  return {
    mode: sim.mode,
    tick: sim.tick,
    timeMs: sim.timeMs,
    players,
    zombies: sim.zombies,
    bullets: sim.bullets,
    explosions: sim.explosions,
    chainBolts: sim.chainBolts,
    sonicRings: sim.sonicRings,
    pickups: sim.pickups,
    wave: sim.wave,
    waveActive: sim.waveActive,
    nextWaveAt: sim.nextWaveAt,
    zombiesToSpawn: sim.zombiesToSpawn,
    zombieSpawnAt: sim.zombieSpawnAt,
    shopOpenUntil: sim.shopOpenUntil,
    shopOpen: sim.shopOpen,
    gameOver: sim.gameOver,
    winnerId: sim.winnerId,
    barricadeDown: sim.barricadeDown,
    crateRect: sim.crateRect,
    crateBoom: sim.crateBoom,
    events: sim.events,
  };
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
  const mul = p.speedMul || 1;
  return (p.weapon === "knife" ? base * 1.5 : base) * mul;
}
function dmgMulFor(p)  { return 1 + p.upgrades.dmg  * 0.15; }
function rateMulFor(p) { return 1 - p.upgrades.rate * 0.10; }
function reloadMulFor(p) { return 1 - p.upgrades.reload * 0.12; }

function collideCircleWalls(sim, x, y, r) {
  const walls = currentWalls(sim);
  for (const w of walls) {
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

function moveWithCollisions(sim, ent, r, dx, dy) {
  const ox = ent.x, oy = ent.y;
  ent.x += dx;
  let h = collideCircleWalls(sim, ent.x, ent.y, r);
  if (h) { ent.x += h.nx * h.depth; ent.y += h.ny * h.depth; }
  ent.y += dy;
  h = collideCircleWalls(sim, ent.x, ent.y, r);
  if (h) { ent.x += h.nx * h.depth; ent.y += h.ny * h.depth; }
  ent.x = Math.max(r, Math.min(MAP_W - r, ent.x));
  ent.y = Math.max(r, Math.min(MAP_H - r, ent.y));
  return { dx: ent.x - ox, dy: ent.y - oy };
}

function lineHitsWall(sim, x1, y1, x2, y2) {
  const walls = currentWalls(sim);
  for (const w of walls) {
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
  const w = weaponEff(p);
  if (!w) return;
  // Charge weapons (RIPPLE) are driven by the hold/release state machine
  // in updateCharges — tryShoot is a no-op for them.
  if (w.kind === "charge") return;
  const now = sim.timeMs;
  if (p.infAmmo && w.kind !== "melee") {
    p.ammo = w.mag;
    p.slotAmmo[p.activeSlot] = p.ammo;
    p.reloadingUntil = 0;
    p.reloadDuration = 0;
  }
  if (now < p.reloadingUntil) return;
  if (w.kind !== "melee" && p.ammo <= 0) {
    startReload(sim, p);
    return;
  }
  const rate = w.rate * rateMulFor(p) * (p.fireRateMul ?? 1);
  if (!p.noDelay && now - p.lastShotAt < rate) return;
  p.lastShotAt = now;
  sim.events.push({ type: "shoot", playerId: p.id, weapon: p.weapon, x: p.x, y: p.y });

  const dx = input.aimX - p.x;
  const dy = input.aimY - p.y;
  const baseAngle = Math.atan2(dy, dx);

  if (w.kind === "melee") {
    if (p.stats) p.stats.shotsFired += 1;
    let landed = false;
    for (const z of [...sim.zombies]) {
      const ddx = z.x - p.x, ddy = z.y - p.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist > w.range + (z.radius - ZOMBIE_R)) continue;
      const a = Math.atan2(ddy, ddx);
      const da = Math.abs(angleDiff(a, baseAngle));
      if (da < 0.6) { damageZombie(sim, z, w.dmg * dmgMulFor(p), p); landed = true; }
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
        landed = true;
      }
    }
    if (landed && p.stats) p.stats.shotsHit += 1;
    return;
  }

  const pellets = w.pellets || 1;
  const packed = !!p.slotPacked[p.activeSlot];
  if (p.stats) p.stats.shotsFired += pellets;
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
      packed,
      dmg: w.dmg * dmgMulFor(p),
      range: w.range * (p.rangeMul ?? 1),
      traveled: 0,
    });
  }
  if (!p.infAmmo) {
    p.ammo -= 1;
    p.slotAmmo[p.activeSlot] = p.ammo;
    if (p.ammo <= 0 && w.kind === "ranged") startReload(sim, p);
  }
}

function startReload(sim, p) {
  const w = weaponEff(p);
  if (!w || w.kind === "melee") return;
  if (p.ammo >= w.mag) return;
  if (sim.timeMs < p.reloadingUntil) return;
  const dur = w.reload * reloadMulFor(p);
  p.reloadDuration = dur;
  p.reloadingUntil = sim.timeMs + dur;
  sim.events.push({ type: "reload-start", playerId: p.id, weapon: p.weapon, x: p.x, y: p.y });
}

function finishReloads(sim) {
  for (const [, p] of sim.players) {
    if (p.reloadingUntil > 0 && sim.timeMs >= p.reloadingUntil) {
      const w = weaponEff(p);
      if (w) {
        p.ammo = w.mag;
        p.slotAmmo[p.activeSlot] = p.ammo;
      }
      p.reloadingUntil = 0;
      p.reloadDuration = 0;
    }
  }
}

function damagePlayer(sim, target, amount, attacker) {
  if (target.state === "dead") return;
  if (target.invincible) return;
  const absorb = Math.min(target.armor, amount * 0.6);
  target.armor = Math.max(0, target.armor - absorb);
  const taken = amount - absorb;
  target.hp -= taken;
  if (target.hp > 0) return;

  if (sim.mode === "horde") {
    const aliveOthers = [...sim.players.values()].some((o) => o.id !== target.id && o.state === "alive");
    if (target.state === "alive") {
      if (aliveOthers) onPlayerDown(sim, target);
      else {
        // Solo (or last-standing) horde: no teammate can revive — skip the
        // down phase, burn remaining lives, and end the run immediately.
        target.lives = 1;
        onPlayerDead(sim, target, attacker);
      }
    }
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
    if (attacker.stats) {
      const kbw = attacker.stats.killsByWeapon;
      const wid = attacker.weapon;
      if (wid) kbw[wid] = (kbw[wid] || 0) + 1;
    }
    const idx = ARSENAL_ORDER.indexOf(attacker.weapon);
    const next = ARSENAL_ORDER[(idx + 1) % ARSENAL_ORDER.length];
    attacker.weapon = next;
    attacker.slots[attacker.activeSlot] = next;
    attacker.slotAmmo[attacker.activeSlot] = WEAPONS[next].mag;
    attacker.ammo = WEAPONS[next].mag;
    attacker.reloadingUntil = 0;
    if (attacker.stats) attacker.stats.weaponsCollected.add(next);
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
  const w = weaponEff(p);
  if (w) {
    p.ammo = w.mag;
    p.slotAmmo[p.activeSlot] = p.ammo;
  }
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

function onZombieDeath(sim, z, killer, opts = {}) {
  sim.zombies = sim.zombies.filter((zz) => zz !== z);
  if (killer) {
    let reward = 20;
    if (z.kind === "sprinter") reward = 40;
    else if (z.kind === "brute") reward = 40;
    else if (z.kind === "volt-fuse") reward = opts.fuseTipKill ? 60 : 30;
    if (killer.doubleMoney) reward *= 2;
    killer.cash += reward;
    killer.score += 1;
    if (killer.stats) {
      killer.stats.moneyEarned += reward;
      const kbk = killer.stats.zombieKillsByKind;
      kbk[z.kind] = (kbk[z.kind] || 0) + 1;
      const kbw = killer.stats.killsByWeapon;
      const wid = killer.weapon;
      if (wid) kbw[wid] = (kbw[wid] || 0) + 1;
    }
    sim.events.push({ type: "kill", killerId: killer.id, victimId: -1, weapon: killer.weapon, zombieKind: z.kind });
  }
}

// Routes raw damage through kind-specific gates (brute plates, volt-fuse
// fuse-immunity). Returns true if the zombie was killed by this call.
function damageZombie(sim, z, dmg, attacker, opts = {}) {
  if (attacker?.oneShot) dmg *= 1000;
  if (attacker?.stats) attacker.stats.damageDealt += dmg;
  if (z.kind === "volt-fuse") {
    if (opts.fuseTipHit) {
      detonateVoltFuse(sim, z, attacker, { fuseTipKill: true });
      return true;
    }
    z.hp -= dmg;
    if (z.hp <= 0) {
      detonateVoltFuse(sim, z, attacker, { fuseTipKill: false });
      return true;
    }
    return false;
  }

  if (z.kind === "brute") {
    const aliveIdxs = [];
    for (let i = 0; i < z.plates.length; i++) if (z.plates[i].alive) aliveIdxs.push(i);
    if (opts.pierceArmor && aliveIdxs.length > 0) {
      // Voltspike pierce: full damage to body AND destroy one plate per hit.
      z.hp -= dmg;
      const plate = z.plates[aliveIdxs[0]];
      plate.alive = false;
      plate.hp = 0;
      if (attacker) {
        const bonus = attacker.doubleMoney ? 40 : 20;
        attacker.cash += bonus;
        if (attacker.stats) attacker.stats.moneyEarned += bonus;
      }
    } else if (aliveIdxs.length > 0) {
      z.hp -= dmg * (1 - BRUTE_PLATE_ABSORB);
      const pi = aliveIdxs[Math.floor(Math.random() * aliveIdxs.length)];
      const plate = z.plates[pi];
      plate.hp -= dmg;
      if (plate.hp <= 0) {
        plate.alive = false;
        plate.hp = 0;
        if (attacker) {
          const bonus = attacker.doubleMoney ? 40 : 20;
          attacker.cash += bonus;
          if (attacker.stats) attacker.stats.moneyEarned += bonus;
        }
      }
    } else {
      z.hp -= dmg;
    }
  } else {
    z.hp -= dmg;
  }

  if (z.hp <= 0) {
    onZombieDeath(sim, z, attacker);
    return true;
  }
  return false;
}

function detonateVoltFuse(sim, z, attacker, opts = {}) {
  if (z.detonating) return;
  z.detonating = true;
  sim.explosions.push({ x: z.x, y: z.y, r: VOLT_FUSE_SPLASH_R, t: sim.timeMs });
  sim.events.push({ type: "voltfuse-boom", x: z.x, y: z.y });
  // Friendly fire: damage other zombies in radius (chain detonations possible).
  for (const other of [...sim.zombies]) {
    if (other === z) continue;
    const d = Math.hypot(other.x - z.x, other.y - z.y);
    if (d <= VOLT_FUSE_SPLASH_R) {
      const dmg = VOLT_FUSE_DMG * (1 - d / VOLT_FUSE_SPLASH_R);
      damageZombie(sim, other, dmg, attacker, { explosion: true });
    }
  }
  // Damage players in radius (always — fuse-tip kill still damages other players in range).
  for (const [, p] of sim.players) {
    if (p.state !== "alive") continue;
    const d = Math.hypot(p.x - z.x, p.y - z.y);
    if (d <= VOLT_FUSE_SPLASH_R) {
      const dmg = VOLT_FUSE_DMG * (1 - d / VOLT_FUSE_SPLASH_R);
      damagePlayer(sim, p, dmg, null);
    }
  }
  onZombieDeath(sim, z, attacker, { fuseTipKill: !!opts.fuseTipKill });
}

// Voltspike chain: starting from `firstHit`, daisy-chain to the nearest
// unhit zombie within chainRange, up to chainCount links. Each link does
// dmg * chainDmgMul^link and pierces brute armor. Pushes a chainBolt
// effect into sim.chainBolts for the renderer.
function fireVoltspikeChain(sim, firstHit, baseDmg, attacker, packed) {
  const baseW = WEAPONS.voltspike;
  const w = packed ? {
    ...baseW,
    chainCount: baseW.chainCount + 2,
    chainRange: baseW.chainRange * 1.4,
  } : baseW;
  const points = [{ x: firstHit.x, y: firstHit.y }];
  const hitSet = new Set([firstHit.id]);
  damageZombie(sim, firstHit, baseDmg, attacker, { pierceArmor: true });
  let prev = firstHit;
  for (let link = 1; link <= w.chainCount; link++) {
    let next = null, bestD2 = (w.chainRange * w.chainRange);
    for (const z of sim.zombies) {
      if (hitSet.has(z.id)) continue;
      if (z.detonating) continue;
      const dx = z.x - prev.x, dy = z.y - prev.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; next = z; }
    }
    if (!next) break;
    hitSet.add(next.id);
    points.push({ x: next.x, y: next.y });
    const dmg = baseDmg * Math.pow(w.chainDmgMul, link);
    damageZombie(sim, next, dmg, attacker, { pierceArmor: true });
    prev = next;
  }
  sim.chainBolts.push({ points, t: sim.timeMs, duration: 280 });
  sim.events.push({ type: "voltspike-chain", x: firstHit.x, y: firstHit.y });
}

// Drives the RIPPLE hold-to-charge state machine for every player each tick.
// Records `chargingSince` on press, evaluates duration on release, and emits
// a sonic ring + damage if the charge crossed `chargeMinMs`. Tap-fires under
// minimum cancel without consuming a mag.
function updateCharges(sim) {
  for (const [, p] of sim.players) {
    const w = weaponEff(p);
    if (!w || w.kind !== "charge") {
      if (p.chargingSince) p.chargingSince = 0;
      continue;
    }
    if (p.state !== "alive") {
      p.chargingSince = 0;
      continue;
    }
    const input = sim.inputs.get(p.id);
    const shoot = !!input?.shoot;
    const reloading = sim.timeMs < p.reloadingUntil;

    if (reloading) {
      p.chargingSince = 0;
      continue;
    }
    if (p.ammo <= 0 && !shoot) {
      // Auto-reload between shots when empty.
      startReload(sim, p);
      continue;
    }

    if (shoot && !p.chargingSince && p.ammo > 0) {
      p.chargingSince = sim.timeMs;
    } else if (!shoot && p.chargingSince) {
      const dur = sim.timeMs - p.chargingSince;
      p.chargingSince = 0;
      if (dur < w.chargeMinMs) continue;
      const ratio = Math.min(1, dur / w.chargeMaxMs);
      const dmg = w.dmg * ratio * dmgMulFor(p);
      const radius = w.range * ratio;
      emitSonicRing(sim, p, dmg, radius, w.staggerMs);
      if (!p.infAmmo) {
        p.ammo -= 1;
        p.slotAmmo[p.activeSlot] = p.ammo;
        if (p.ammo <= 0) startReload(sim, p);
      }
    }
  }
}

function emitSonicRing(sim, attacker, dmg, radius, staggerMs) {
  const cx = attacker.x, cy = attacker.y;
  sim.sonicRings.push({ x: cx, y: cy, r: radius, t: sim.timeMs, duration: 350 });
  sim.events.push({ type: "sonic-ring", x: cx, y: cy, r: radius });
  if (radius <= 0 || dmg <= 0) return;
  for (const z of [...sim.zombies]) {
    if (z.detonating) continue;
    const d = Math.hypot(z.x - cx, z.y - cy);
    if (d > radius) continue;
    const falloff = 1 - 0.5 * (d / radius);
    const killed = damageZombie(sim, z, dmg * falloff, attacker);
    if (!killed) z.staggeredUntil = sim.timeMs + staggerMs;
  }
  // Players in arsenal/other modes (and self via splash) take damage too.
  for (const [, op] of sim.players) {
    if (op.state !== "alive") continue;
    const d = Math.hypot(op.x - cx, op.y - cy);
    if (d > radius) continue;
    const falloff = 1 - (d / radius);
    if (op.id === attacker.id) {
      damagePlayer(sim, op, dmg * WEAPONS.ripple.selfDamageMul * falloff, null);
    } else if (sim.mode === "arsenal") {
      damagePlayer(sim, op, dmg * falloff, attacker);
    }
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
  const w = weaponEff(p);
  if (w) {
    p.ammo = w.mag;
    p.slotAmmo[p.activeSlot] = p.ammo;
  }
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

    if (lineHitsWall(sim, b.x, b.y, nx, ny)) {
      if (b.weapon === "rocket") rocketExplode(sim, b.x, b.y, b);
      continue;
    }

    let hit = null;
    for (const z of sim.zombies) {
      if (z.kind === "volt-fuse") {
        if (circleSeg(b.x, b.y, nx, ny, z.x, z.y - VOLT_FUSE_TIP_OFFSET, VOLT_FUSE_TIP_R + BULLET_R)) {
          hit = { zombie: z, fuseTip: true };
          break;
        }
      }
      if (circleSeg(b.x, b.y, nx, ny, z.x, z.y, z.radius + BULLET_R)) { hit = { zombie: z }; break; }
    }
    if (!hit && sim.mode === "arsenal") {
      for (const [, op] of sim.players) {
        if (op.id === b.ownerId || !op.alive) continue;
        if (circleSeg(b.x, b.y, nx, ny, op.x, op.y, PLAYER_R + BULLET_R)) { hit = { player: op }; break; }
      }
    }

    if (hit) {
      const owner = sim.players.get(b.ownerId);
      if (owner?.stats) owner.stats.shotsHit += 1;
      sim.events.push({ type: "bullet-hit", ownerId: b.ownerId, x: nx, y: ny });
      if (b.weapon === "rocket") {
        rocketExplode(sim, nx, ny, b);
      } else if (b.weapon === "voltspike" && hit.zombie) {
        fireVoltspikeChain(sim, hit.zombie, b.dmg, owner, !!b.packed);
      } else if (hit.zombie) {
        damageZombie(sim, hit.zombie, b.dmg, owner, { fuseTipHit: !!hit.fuseTip });
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
  const baseW = WEAPONS.rocket;
  const w = b.packed ? {
    splashR: baseW.splashR * 1.4,
    splashDmg: baseW.splashDmg * 2,
  } : baseW;
  const owner = sim.players.get(b.ownerId);
  sim.explosions.push({ x, y, r: w.splashR, t: sim.timeMs });
  sim.events.push({ type: "explosion", x, y, r: w.splashR });
  for (const z of [...sim.zombies]) {
    const d = Math.hypot(z.x - x, z.y - y);
    if (d <= w.splashR) {
      const dmg = w.splashDmg * (1 - d / w.splashR);
      damageZombie(sim, z, dmg, owner, { explosion: true });
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

function updateFlowFields(sim) {
  const nav = sim._nav;
  if (!nav) return;
  if (sim.timeMs - nav.lastUpdateAt < FLOW_REFRESH_MS) return;
  nav.lastUpdateAt = sim.timeMs;
  const alive = new Set();
  for (const [, p] of sim.players) {
    if (p.state !== "alive") continue;
    alive.add(p.id);
    nav.fields.set(p.id, computeFlowField(nav.grid, p.x, p.y));
  }
  for (const id of [...nav.fields.keys()]) {
    if (!alive.has(id)) nav.fields.delete(id);
  }
}

// Push zombies out of alive players so they can't physically overlap.
// Only the zombie moves (players steer themselves with their own input).
// Pathing pulls the zombie back next tick — net effect is they bump the
// player's hitbox instead of standing inside it.
function separateZombiesFromPlayers(sim) {
  for (const z of sim.zombies) {
    if (z.detonating) continue;
    for (const [, p] of sim.players) {
      if (p.state !== "alive") continue;
      const dx = z.x - p.x, dy = z.y - p.y;
      const min = z.radius + PLAYER_R;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      if (d2 === 0) {
        moveWithCollisions(sim, z, z.radius, 0.5, 0);
        continue;
      }
      const d = Math.sqrt(d2);
      const overlap = min - d;
      moveWithCollisions(sim, z, z.radius, (dx / d) * overlap, (dy / d) * overlap);
    }
  }
}

// Pairwise zombie separation. O(N²) but N is bounded — zombie counts stay
// small enough that this is fine. Pushes overlapping pairs apart via
// moveWithCollisions so the wall solver still wins if separation would
// shove a zombie into geometry.
function separateZombies(sim) {
  const zs = sim.zombies;
  for (let i = 0; i < zs.length; i++) {
    const a = zs[i];
    if (a.detonating) continue;
    for (let j = i + 1; j < zs.length; j++) {
      const b = zs[j];
      if (b.detonating) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) {
        if (d2 === 0) {
          // Identical position: nudge one to break the tie.
          moveWithCollisions(sim, b, b.radius, 0.5, 0);
        }
        continue;
      }
      const d = Math.sqrt(d2);
      const overlap = min - d;
      const nx = dx / d, ny = dy / d;
      // Heavier zombies (brutes) move less; split overlap by inverse mass.
      const massA = a.radius, massB = b.radius;
      const shareA = massB / (massA + massB);
      const shareB = massA / (massA + massB);
      moveWithCollisions(sim, a, a.radius, -nx * overlap * shareA, -ny * overlap * shareA);
      moveWithCollisions(sim, b, b.radius,  nx * overlap * shareB,  ny * overlap * shareB);
    }
  }
}

function updateZombies(sim, dt) {
  updateFlowFields(sim);
  for (const z of [...sim.zombies]) {
    if (z.detonating) continue;
    let target = null, best = Infinity;
    for (const [, p] of sim.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - z.x, p.y - z.y);
      if (d < best) { best = d; target = p; }
    }
    if (!target) continue;

    if (z.kind === "volt-fuse") {
      if (z.firstSightedAt === 0 && best <= VOLT_FUSE_SIGHT_R) {
        z.firstSightedAt = sim.timeMs;
        z.detonateAt = sim.timeMs + VOLT_FUSE_LIFE_MS;
      }
      if (best <= VOLT_FUSE_PROX_DETONATE) {
        detonateVoltFuse(sim, z, null);
        continue;
      }
      if (z.detonateAt > 0 && sim.timeMs >= z.detonateAt) {
        detonateVoltFuse(sim, z, null);
        continue;
      }
    }

    // RIPPLE stagger: zombie freezes in place (still ticks fuse logic above).
    if (z.staggeredUntil && sim.timeMs < z.staggeredUntil) continue;

    const directAng = Math.atan2(target.y - z.y, target.x - z.x);
    let baseAng = directAng;
    // Use the flow field unless we're close enough that the direct line is
    // strictly better (no walls between us at point-blank range), or the
    // field has no data for this tile.
    if (best > DIRECT_CHASE_RANGE) {
      const field = sim._nav?.fields.get(target.id);
      const flow = field ? sampleFlow(field, z.x, z.y) : null;
      if (flow && (flow.dx !== 0 || flow.dy !== 0)) {
        baseAng = Math.atan2(flow.dy, flow.dx);
      }
    }
    let ang = baseAng;
    if (sim.timeMs < z.detourUntil) ang = baseAng + z.detourDir;
    const dx = Math.cos(ang) * z.speed * dt;
    const dy = Math.sin(ang) * z.speed * dt;
    const moved = moveWithCollisions(sim, z, z.radius, dx, dy);

    const expected = z.speed * dt;
    const actual = Math.hypot(moved.dx, moved.dy);
    if (expected > 0.001 && actual < expected * 0.4) {
      z.stuckMs += dt * 1000;
      if (z.stuckMs > 120 && sim.timeMs >= z.detourUntil) {
        const side = pickDetourSide(sim, z, z.radius, baseAng);
        z.detourDir = side * (Math.PI / 2);
        z.detourUntil = sim.timeMs + 350 + Math.random() * 300;
      }
    } else {
      z.stuckMs = 0;
    }

    if (best < z.radius + PLAYER_R + 4 && sim.timeMs - z.lastHitAt > ZOMBIE_HIT_COOLDOWN) {
      z.lastHitAt = sim.timeMs;
      damagePlayer(sim, target, z.dmg, null);
      if (z.kind === "brute" && target.state === "alive") {
        const ddx = target.x - z.x, ddy = target.y - z.y;
        const m = Math.hypot(ddx, ddy) || 1;
        moveWithCollisions(sim, target, PLAYER_R, (ddx / m) * BRUTE_SHOVE, (ddy / m) * BRUTE_SHOVE);
      }
    }
  }
  separateZombies(sim);
  separateZombiesFromPlayers(sim);
}

// Picks a random spawn point along room 1's perimeter. Tries to avoid
// landing on a wall (with a small margin) by retrying; falls back to
// the curated ZOMBIE_SPAWNS list if every random pick is blocked.
function pickZombieSpawn(sim) {
  const margin = 60;
  const minPlayerDist = 320;
  for (let attempt = 0; attempt < 16; attempt++) {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = margin + Math.random() * (ROOM1_W - margin * 2); y = margin; }
    else if (side === 1) { x = ROOM1_W - margin; y = margin + Math.random() * (MAP_H - margin * 2); }
    else if (side === 2) { x = margin + Math.random() * (ROOM1_W - margin * 2); y = MAP_H - margin; }
    else { x = margin; y = margin + Math.random() * (MAP_H - margin * 2); }
    if (collideCircleWalls(sim, x, y, ZOMBIE_R)) continue;
    let tooClose = false;
    for (const [, p] of sim.players) {
      if (p.state !== "alive") continue;
      if (Math.hypot(p.x - x, p.y - y) < minPlayerDist) { tooClose = true; break; }
    }
    if (tooClose) continue;
    return { x, y };
  }
  return ZOMBIE_SPAWNS[Math.floor(Math.random() * ZOMBIE_SPAWNS.length)];
}

function pickDetourSide(sim, ent, r, baseAng) {
  const probe = r * 1.6;
  const leftAng = baseAng - Math.PI / 2;
  const rightAng = baseAng + Math.PI / 2;
  const lx = ent.x + Math.cos(leftAng) * probe;
  const ly = ent.y + Math.sin(leftAng) * probe;
  const rx = ent.x + Math.cos(rightAng) * probe;
  const ry = ent.y + Math.sin(rightAng) * probe;
  const leftBlocked = collideCircleWalls(sim, lx, ly, r) != null;
  const rightBlocked = collideCircleWalls(sim, rx, ry, r) != null;
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
    for (const [, p] of sim.players) {
      const bonus = 50 + sim.wave * 10;
      p.cash += bonus;
      if (p.stats) p.stats.moneyEarned += bonus;
      p.ready = false;
    }
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
    sim.packQueue = null;
    sim.events.push({ type: "wave-start", wave: sim.wave });
  }

  if (sim.waveActive && sim.zombiesToSpawn > 0 && sim.timeMs >= sim.zombieSpawnAt) {
    let kind, sx, sy, fromPack = false;
    if (sim.packQueue && sim.packQueue.count > 0) {
      kind = sim.packQueue.kind;
      sx = sim.packQueue.x;
      sy = sim.packQueue.y;
      sim.packQueue.count -= 1;
      fromPack = true;
    } else {
      kind = pickZombieKind(sim);
      const sp = pickZombieSpawn(sim);
      sx = sp.x; sy = sp.y;
      if (kind === "sprinter" && sim.zombiesToSpawn >= 3) {
        const packSize = Math.min(sim.zombiesToSpawn, 3 + Math.floor(Math.random() * 4));
        sim.packQueue = { kind: "sprinter", x: sx, y: sy, count: packSize - 1 };
      }
    }
    sim.zombies.push(makeZombieOfKind(kind, sx, sy, sim.wave));
    sim.zombiesToSpawn -= 1;
    const baseDelay = Math.max(150, 600 - sim.wave * 20);
    sim.zombieSpawnAt = sim.timeMs + (fromPack ? Math.min(180, baseDelay) : baseDelay);
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

    const w = weaponEff(p);
    const desiredBase = w?.kind === "melee" ? 38 : 220;
    const desiredJitter = (bot.jitterSeed % 100) * 1.2;
    const desired = desiredBase + (w?.kind === "melee" ? 0 : desiredJitter);

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
        const side = pickDetourSide(sim, p, PLAYER_R, baseAng);
        bot.detourDir = side * (Math.PI / 2);
        bot.detourUntil = sim.timeMs + 400 + Math.random() * 400;
      }
    } else {
      bot.stuckMs = 0;
    }
    bot.lastX = p.x; bot.lastY = p.y;

    const reloading = sim.timeMs < p.reloadingUntil;
    const shootClear = target ? !lineHitsWall(sim, p.x, p.y, target.x, target.y) : false;
    const inFiringWindow = !!target && best < 500 && shootClear;
    const wantReload =
      w && w.kind !== "melee" &&
      !reloading &&
      p.ammo < w.mag &&
      (p.ammo === 0 || !inFiringWindow || p.ammo / w.mag <= 0.34);

    const input = {
      mx, my,
      aimX: target ? target.x : p.x + 10,
      aimY: target ? target.y : p.y,
      shoot: inFiringWindow && !reloading && (w?.kind === "melee" || p.ammo > 0),
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
    if (p.noClip) {
      p.x = Math.max(PLAYER_R, Math.min(MAP_W - PLAYER_R, p.x + dx));
      p.y = Math.max(PLAYER_R, Math.min(MAP_H - PLAYER_R, p.y + dy));
    } else {
      moveWithCollisions(sim, p, PLAYER_R, dx, dy);
    }
    p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    if (input.reload) startReload(sim, p);
    if (input.shoot) tryShoot(sim, p, input);
  }
}

function pruneExplosions(sim) {
  sim.explosions = sim.explosions.filter((e) => sim.timeMs - e.t < 400);
  sim.chainBolts = sim.chainBolts.filter((b) => sim.timeMs - b.t < b.duration);
  sim.sonicRings = sim.sonicRings.filter((r) => sim.timeMs - r.t < r.duration);
}

// ───────────────────────── Interactions ─────────────────────────

function rectCenter(r) { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }

function nearPoint(p, cx, cy, range) {
  return Math.hypot(p.x - cx, p.y - cy) <= range;
}

function pickInteractTarget(sim, p) {
  // Priority: closest among in-range props. Barricade is only interactable
  // while up; PaP only interactable from inside room 2 (which requires the
  // barricade to be down or the player to be standing in the doorway).
  const candidates = [];
  const c = rectCenter(sim.crateRect);
  if (nearPoint(p, c.x, c.y, INTERACT_RANGE)) candidates.push({ kind: "crate", d: Math.hypot(p.x - c.x, p.y - c.y) });
  const pp = rectCenter(PAP);
  if (nearPoint(p, pp.x, pp.y, INTERACT_RANGE)) candidates.push({ kind: "pap", d: Math.hypot(p.x - pp.x, p.y - pp.y) });
  if (!sim.barricadeDown) {
    const b = rectCenter(BARRICADE);
    if (nearPoint(p, b.x, b.y, INTERACT_RANGE)) candidates.push({ kind: "barricade", d: Math.hypot(p.x - b.x, p.y - b.y) });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.d - b.d);
  return candidates[0].kind;
}

function grantWeaponToActiveOrEmpty(sim, p, weaponId) {
  // If the player has an empty slot, fill it (and switch to it). Otherwise
  // replace the active slot.
  let slot = p.slots.findIndex((s) => s == null);
  if (slot < 0) slot = p.activeSlot;
  p.slots[slot] = weaponId;
  p.slotAmmo[slot] = WEAPONS[weaponId].mag;
  p.slotPacked[slot] = false;
  p.activeSlot = slot;
  syncActiveWeapon(p);
  p.reloadingUntil = 0;
  p.reloadDuration = 0;
  p.chargingSince = 0;
}

function acceptCrateResult(sim, p) {
  if (!p.crateResultPending) return;
  const wid = p.crateResultPending;
  grantWeaponToActiveOrEmpty(sim, p, wid);
  if (p.stats) p.stats.weaponsCollected.add(wid);
  p.crateResultPending = null;
  p.crateResultPendingSince = 0;
  sim.events.push({ type: "crate-take", playerId: p.id, weapon: wid });
}

function openCrate(sim, p) {
  if (p.crateOpenedAt) return;
  if (p.crateResultPending) return;
  if (sim.crateBoom) return; // Crate is mid-detonation.
  if (!p.infMoney && p.cash < CRATE_COST) return;
  if (!p.infMoney) p.cash -= CRATE_COST;
  if (p.stats) p.stats.cratesOpened += 1;
  const roll = Math.random();
  let result = null;
  let blowUp = false;
  if (roll < CRATE_BLOWUP_CHANCE) {
    blowUp = true;
  } else if (roll < CRATE_BLOWUP_CHANCE + CRATE_VOLT_CHANCE) {
    result = "voltspike";
  } else if (roll < CRATE_BLOWUP_CHANCE + CRATE_VOLT_CHANCE + CRATE_RIPPLE_CHANCE) {
    result = "ripple";
  } else {
    result = CRATE_NORMAL_POOL[Math.floor(Math.random() * CRATE_NORMAL_POOL.length)];
  }
  p.crateOpenedAt = sim.timeMs;
  p.crateResult = result;
  p.crateBlowUp = blowUp;
  // Force-stop firing/charging while the player watches the reveal.
  p.reloadingUntil = 0;
  p.chargingSince = 0;
  sim.events.push({
    type: "crate-open",
    playerId: p.id, result, blowUp,
    durationMs: CRATE_ANIM_MS,
  });
}

function buyBarricade(sim, p) {
  if (sim.barricadeDown) return;
  if (!p.infMoney && p.cash < BARRICADE_COST) return;
  if (!p.infMoney) p.cash -= BARRICADE_COST;
  sim.barricadeDown = true;
  rebuildNav(sim);
  sim.events.push({ type: "barricade", playerId: p.id });
}

function packCurrentWeapon(sim, p) {
  if (sim.wave < PAP_MIN_WAVE) return;
  if (!p.infMoney && p.cash < PAP_COST) return;
  const id = p.slots[p.activeSlot];
  if (!id) return;
  if (p.slotPacked[p.activeSlot]) return;
  if (!p.infMoney) p.cash -= PAP_COST;
  p.slotPacked[p.activeSlot] = true;
  // Top off ammo so the buff is immediately felt.
  const w = weaponEff(p);
  if (w) {
    p.ammo = w.mag;
    p.slotAmmo[p.activeSlot] = p.ammo;
  }
  sim.events.push({ type: "pap", playerId: p.id, weapon: id });
}

function updateInteractions(sim) {
  for (const [, p] of sim.players) {
    if (p.state !== "alive") continue;
    if (p.crateOpenedAt) continue;
    const input = sim.inputs.get(p.id);
    if (!input?.interact) continue;
    const target = pickInteractTarget(sim, p);
    if (target === "crate") {
      if (p.crateResultPending) acceptCrateResult(sim, p);
      else openCrate(sim, p);
    }
    else if (target === "barricade") buyBarricade(sim, p);
    else if (target === "pap") packCurrentWeapon(sim, p);
    // Consume the edge so subsequent ticks (which may still see the same
    // input snapshot before a new one arrives from the network) don't keep
    // re-triggering interactions.
    input.interact = false;
  }
}

function updateCrateAnims(sim) {
  for (const [, p] of sim.players) {
    if (!p.crateOpenedAt) continue;
    if (sim.timeMs - p.crateOpenedAt < CRATE_ANIM_MS) continue;
    // Apply result.
    if (p.crateBlowUp) {
      // Start a 3-second countdown on the crate. The crate detonates when
      // the timer expires (handled in updateCrateBoom) and relocates — the
      // player is NOT teleported or damaged.
      const cc = rectCenter(sim.crateRect);
      sim.crateBoom = { x: cc.x, y: cc.y, endsAt: sim.timeMs + CRATE_BOOM_COUNTDOWN_MS };
      sim.events.push({
        type: "crate-boom-start",
        playerId: p.id,
        x: cc.x, y: cc.y,
        endsAt: sim.crateBoom.endsAt,
      });
    } else if (p.crateResult) {
      p.crateResultPending = p.crateResult;
      p.crateResultPendingSince = sim.timeMs;
      sim.events.push({ type: "crate-ready", playerId: p.id, weapon: p.crateResult });
    }
    p.crateOpenedAt = 0;
    p.crateResult = null;
    p.crateBlowUp = false;
  }
  // Expire pending pickups: if the player doesn't claim the gun within
  // CRATE_PENDING_EXPIRE_MS of it floating up, they lose it.
  for (const [, p] of sim.players) {
    if (!p.crateResultPending) continue;
    if (sim.timeMs - p.crateResultPendingSince < CRATE_PENDING_EXPIRE_MS) continue;
    const wid = p.crateResultPending;
    p.crateResultPending = null;
    p.crateResultPendingSince = 0;
    sim.events.push({ type: "crate-expire", playerId: p.id, weapon: wid });
  }
}

function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function pickRandomCrateLocation(sim) {
  const w = sim.crateRect.w, h = sim.crateRect.h;
  // Keep the crate inside room 1, away from the perimeter walls, the doorway,
  // and the PaP. Treat the crate as a circle for the wall collision query so
  // we re-use the existing solver.
  const r = Math.hypot(w / 2, h / 2) + 20;
  const minX = 60, maxX = ROOM1_W - 60 - w;
  const minY = 60, maxY = MAP_H - 60 - h;
  for (let tries = 0; tries < 80; tries++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    const cx = x + w / 2, cy = y + h / 2;
    if (collideCircleWalls(sim, cx, cy, r)) continue;
    if (pointInRect(cx, cy, DOORWAY)) continue;
    // Don't drop on a player either — would be obnoxious.
    let onPlayer = false;
    for (const [, p] of sim.players) {
      if (Math.hypot(p.x - cx, p.y - cy) < r + PLAYER_R) { onPlayer = true; break; }
    }
    if (onPlayer) continue;
    return { x, y, w, h };
  }
  // Fallback to the original spot if we somehow can't place it.
  return { x: CRATE.x, y: CRATE.y, w, h };
}

function updateCrateBoom(sim) {
  if (!sim.crateBoom) return;
  if (sim.timeMs < sim.crateBoom.endsAt) return;
  const { x, y } = sim.crateBoom;
  // Detonate at the current crate location.
  sim.explosions.push({ x, y, r: CRATE_BOOM_RADIUS, t: sim.timeMs });
  sim.events.push({ type: "explosion", x, y, r: CRATE_BOOM_RADIUS });
  // Catch zombies in the blast (players are spared — the blowup is a crate
  // mechanic, not a player punishment).
  for (const z of [...sim.zombies]) {
    if (Math.hypot(z.x - x, z.y - y) <= CRATE_BOOM_RADIUS) {
      damageZombie(sim, z, CRATE_BLOW_UP_DMG, null);
    }
  }
  // Move the crate to a new random valid spot.
  sim.crateRect = pickRandomCrateLocation(sim);
  sim.events.push({ type: "crate-moved", x: sim.crateRect.x, y: sim.crateRect.y });
  sim.crateBoom = null;
}

// ───────────────────────────────────────────────────────────────────

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
  updateInteractions(sim);
  updateCrateAnims(sim);
  updateCrateBoom(sim);
  updatePlayers(sim, dt);
  updateCharges(sim);
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
  if (!p.infMoney && p.cash < cost) return false;
  if (!item.canBuy(p, sim)) return false;
  if (!p.infMoney) p.cash -= cost;
  item.apply(p, sim);
  sim.events.push({ type: "buy", playerId: p.id, itemId, itemName: item.name, cost });
  return true;
}

export function setReady(sim, playerId, value) {
  const p = sim.players.get(playerId);
  if (!p || !sim.shopOpen) return;
  p.ready = !!value;
}

function hasWeaponInSlots(p, weaponId) {
  return p.slots.some((s) => s === weaponId);
}

export const SHOP_ITEMS = [
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

// Switch to one of the player's two slots by index (0 or 1). If the slot is
// empty, no-op. Ammo for the new slot resumes from where it was left off.
export function switchWeaponSlot(sim, playerId, slot) {
  const p = sim.players.get(playerId);
  if (!p) return;
  if (slot !== 0 && slot !== 1) return;
  if (p.activeSlot === slot) return;
  if (!p.slots[slot]) return;
  // Persist current slot's ammo before switching.
  p.slotAmmo[p.activeSlot] = p.ammo;
  p.activeSlot = slot;
  syncActiveWeapon(p);
  p.reloadingUntil = 0;
  p.reloadDuration = 0;
  p.chargingSince = 0;
}

// Backwards-compatible entry point taking a weapon id. If the weapon is in
// one of the player's slots, switch to that slot.
export function switchWeapon(sim, playerId, weaponId) {
  const p = sim.players.get(playerId);
  if (!p) return;
  const slot = p.slots.findIndex((s) => s === weaponId);
  if (slot < 0) return;
  switchWeaponSlot(sim, playerId, slot);
}

export function reloadPlayer(sim, playerId) {
  const p = sim.players.get(playerId);
  if (p) startReload(sim, p);
}

export const CONSTANTS = { PLAYER_R, ZOMBIE_R, BULLET_R, MAP_W, MAP_H };
