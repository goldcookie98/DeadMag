import { WebSocketServer } from "ws";
import {
  createSim, addPlayer, removePlayer, setInput, step,
  shopBuy, switchWeapon, setReady,
} from "../src/sim.js";

const PORT = Number(process.env.PORT) || 8080;
const TICK_HZ = 30;
const TICK_MS = 1000 / TICK_HZ;
const ROOM_TTL_MS = 1000 * 60 * 30;
const COLORS = ["#ff2e6c", "#00ffd1", "#ffd400", "#8a5cff", "#5eff5e", "#ff8c2e", "#2eaaff", "#ff5edc"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const rooms = new Map();

function newCode() {
  let c;
  do {
    c = "";
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  } while (rooms.has(c));
  return c;
}

function createRoom(hostName) {
  const code = newCode();
  const room = {
    code,
    mode: "horde",
    players: [],
    sim: null,
    started: false,
    hostId: null,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    interval: null,
  };
  rooms.set(code, room);
  return room;
}

function addClient(room, ws, name) {
  const playerId = nextId();
  const colorIdx = room.players.length % COLORS.length;
  const client = { id: playerId, ws, name: name || ("P_" + playerId), color: COLORS[colorIdx] };
  room.players.push(client);
  if (room.hostId == null) room.hostId = playerId;
  if (room.started && room.sim) {
    const p = addPlayer(room.sim, client.name, client.color, false);
    rebindSimPlayerId(room.sim, p.id, client.id);
    client.playerId = client.id;
  }
  return client;
}

// Force the sim player's id to match the lobby client id so the wire protocol
// uses a single id-space (lobby == sim).
function rebindSimPlayerId(sim, oldId, newId) {
  if (oldId === newId) return;
  const p = sim.players.get(oldId);
  if (!p) return;
  sim.players.delete(oldId);
  p.id = newId;
  sim.players.set(newId, p);
  const inp = sim.inputs?.get(oldId);
  if (inp) { sim.inputs.delete(oldId); sim.inputs.set(newId, inp); }
}

function removeClient(room, ws) {
  const idx = room.players.findIndex((p) => p.ws === ws);
  if (idx < 0) return;
  const [client] = room.players.splice(idx, 1);
  if (room.sim && client.playerId) removePlayer(room.sim, client.playerId);
  if (room.hostId === client.id) room.hostId = room.players[0]?.id ?? null;
  if (room.players.length === 0) destroyRoom(room);
}

function destroyRoom(room) {
  if (room.interval) clearInterval(room.interval);
  rooms.delete(room.code);
}

function lobbyPayload(room) {
  return {
    type: "lobby",
    mode: room.mode,
    hostId: room.hostId,
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
  };
}

function broadcast(room, msg) {
  const s = JSON.stringify(msg);
  for (const p of room.players) {
    try { p.ws.send(s); } catch {}
  }
}

function sendTo(client, msg) {
  try { client.ws.send(JSON.stringify(msg)); } catch {}
}

function startGame(room, mode) {
  room.mode = mode;
  room.started = true;
  room.sim = createSim(mode);
  for (const c of room.players) {
    const p = addPlayer(room.sim, c.name, c.color, false);
    rebindSimPlayerId(room.sim, p.id, c.id);
    c.playerId = c.id;
  }
  broadcast(room, { type: "start", mode });
  room.interval = setInterval(() => {
    step(room.sim, TICK_MS / 1000);
    broadcast(room, { type: "state", state: serializeSim(room.sim) });
  }, TICK_MS);
}

function serializeSim(sim) {
  return {
    mode: sim.mode,
    tick: sim.tick,
    timeMs: sim.timeMs,
    wave: sim.wave,
    waveActive: sim.waveActive,
    shopOpen: sim.shopOpen,
    shopOpenUntil: sim.shopOpenUntil,
    gameOver: sim.gameOver,
    winnerId: sim.winnerId,
    events: sim.events,
    players: [...sim.players.values()].map((p) => ({
      id: p.id, name: p.name, color: p.color,
      x: p.x, y: p.y, angle: p.angle,
      hp: p.hp, maxHp: p.maxHp, armor: p.armor,
      weapon: p.weapon, inventory: p.inventory, ammo: p.ammo,
      reloadingUntil: p.reloadingUntil,
      reloadDuration: p.reloadDuration,
      cash: p.cash, lives: p.lives, alive: p.alive,
      upgrades: p.upgrades,
      arsenalKills: [...p.arsenalKills],
      score: p.score,
    })),
    zombies: sim.zombies.map((z) => ({ id: z.id, x: z.x, y: z.y, hp: z.hp, maxHp: z.maxHp })),
    bullets: sim.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, weapon: b.weapon })),
    explosions: sim.explosions.map((e) => ({ x: e.x, y: e.y, r: e.r, t: e.t })),
  };
}

let _id = 1000;
function nextId() { return _id++; }

const wss = new WebSocketServer({ port: PORT });
console.log(`[DeadMag] ws listening on :${PORT}`);

wss.on("connection", (ws) => {
  let room = null;
  let client = null;

  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }

    if (m.type === "create") {
      room = createRoom(m.name);
      client = addClient(room, ws, m.name);
      sendTo(client, { type: "welcome", code: room.code, playerId: client.id, mode: room.mode, hostId: room.hostId, players: room.players.map(p => ({ id: p.id, name: p.name })) });
      broadcast(room, lobbyPayload(room));
    } else if (m.type === "join") {
      room = rooms.get((m.code || "").toUpperCase());
      if (!room) { sendTo({ ws }, { type: "error", message: "Room not found" }); return; }
      if (room.players.length >= 8) { sendTo({ ws }, { type: "error", message: "Room full" }); return; }
      client = addClient(room, ws, m.name);
      sendTo(client, { type: "welcome", code: room.code, playerId: client.id, mode: room.mode, hostId: room.hostId, players: room.players.map(p => ({ id: p.id, name: p.name })) });
      broadcast(room, lobbyPayload(room));
    } else if (m.type === "start" && room && client && client.id === room.hostId && !room.started) {
      startGame(room, m.mode || room.mode);
    } else if (m.type === "mode" && room && client && client.id === room.hostId && !room.started) {
      if (m.mode === "horde" || m.mode === "arsenal") {
        room.mode = m.mode;
        broadcast(room, lobbyPayload(room));
      }
    } else if (m.type === "input" && room && client && room.started) {
      if (client.playerId) setInput(room.sim, client.playerId, m.input);
    } else if (m.type === "buy" && room && client && room.started) {
      shopBuy(room.sim, client.playerId, m.itemId);
    } else if (m.type === "equip" && room && client && room.started) {
      switchWeapon(room.sim, client.playerId, m.weapon);
    } else if (m.type === "ready" && room && client && room.started) {
      setReady(room.sim, client.playerId, !!m.ready);
    }
    if (room) room.lastActiveAt = Date.now();
  });

  ws.on("close", () => {
    if (room) {
      removeClient(room, ws);
      if (rooms.has(room.code)) broadcast(room, lobbyPayload(room));
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActiveAt > ROOM_TTL_MS) destroyRoom(room);
  }
}, 60_000);
