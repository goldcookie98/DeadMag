// DeadMag authoritative server.
//
// The server now runs the simulation. Clients connect over a single
// WebSocket, send their input/buy/equip/ready messages, and receive
// state snapshots at 30Hz. No P2P, no WebRTC, no TURN — every connection
// is just wss://. Same model as diep.io / agar.io.
//
// Wire protocol (client ↔ server):
//   c→s: { type:"create"|"join", code?, name }
//   c→s: { type:"mode", mode }          (host only — pre-game)
//   c→s: { type:"start", mode }         (host only — kicks off the sim)
//   c→s: { type:"input", input }
//   c→s: { type:"buy", itemId }
//   c→s: { type:"equip", weapon }
//   c→s: { type:"ready", ready }
//   c→s: { type:"ping" }
//   s→c: { type:"welcome", code, playerId, hostId, mode, players }
//   s→c: { type:"lobby",   code, mode, hostId, players }
//   s→c: { type:"start",   mode }
//   s→c: { type:"state",   state }      (30Hz once a game is running)
//   s→c: { type:"error",   message }
//   s→c: { type:"pong" }

import http from "http";
import { WebSocketServer } from "ws";
import {
  createSim, addPlayer, removePlayer, setInput, step, serializeSim,
  shopBuy, switchWeapon, setReady,
} from "../src/sim.js";

const PORT = Number(process.env.PORT) || 8080;
const ROOM_TTL_MS = 1000 * 60 * 30;
const TICK_HZ = 30;
const TICK_MS = 1000 / TICK_HZ;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COLORS = ["#FF1F6E", "#2EFFE5", "#B6FF2E", "#FFE03E", "#5eff5e", "#ff8c2e", "#2eaaff", "#ff5edc"];

const rooms = new Map();

function newCode() {
  let c;
  do {
    c = "";
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  } while (rooms.has(c));
  return c;
}

function createRoom() {
  const code = newCode();
  const room = {
    code,
    mode: "horde",
    players: [],          // [{ id, name, ws }]
    hostId: null,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    sim: null,
    tickInterval: null,
    lastTickAt: 0,
  };
  rooms.set(code, room);
  return room;
}

function destroyRoom(room) {
  stopTick(room);
  rooms.delete(room.code);
}

let _id = 1000;
function nextId() { return _id++; }

function addClient(room, ws, name) {
  const playerId = nextId();
  const client = { id: playerId, ws, name: name || ("P_" + playerId) };
  room.players.push(client);
  if (room.hostId == null) room.hostId = playerId;
  // If the sim is already running, splice the new client in as a live player.
  if (room.sim) {
    const colorIdx = room.players.length - 1;
    addPlayer(room.sim, client.name, COLORS[colorIdx % COLORS.length], false, client.id);
  }
  return client;
}

function removeClient(room, ws) {
  const idx = room.players.findIndex((p) => p.ws === ws);
  if (idx < 0) return null;
  const [client] = room.players.splice(idx, 1);
  if (room.sim) removePlayer(room.sim, client.id);
  if (room.hostId === client.id) {
    room.hostId = room.players[0]?.id ?? null;
  }
  if (room.players.length === 0) {
    destroyRoom(room);
    return client;
  }
  return client;
}

function lobbyPayload(room) {
  return {
    type: "lobby",
    code: room.code,
    mode: room.mode,
    hostId: room.hostId,
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
  };
}

function broadcast(room, msg, exceptWs = null) {
  const s = JSON.stringify(msg);
  for (const p of room.players) {
    if (p.ws === exceptWs) continue;
    try { p.ws.send(s); } catch {}
  }
}

function sendTo(ws, msg) {
  try { ws.send(JSON.stringify(msg)); } catch {}
}

function startTick(room) {
  stopTick(room);
  room.lastTickAt = Date.now();
  room.tickInterval = setInterval(() => tick(room), TICK_MS);
}

function stopTick(room) {
  if (room.tickInterval) { clearInterval(room.tickInterval); room.tickInterval = null; }
}

function tick(room) {
  if (!room.sim) return;
  const now = Date.now();
  const dt = Math.min(0.05, (now - room.lastTickAt) / 1000);
  room.lastTickAt = now;
  step(room.sim, dt);
  const snapshot = serializeSim(room.sim);
  broadcast(room, { type: "state", state: snapshot });
}

function startGame(room, mode) {
  room.mode = (mode === "arsenal" || mode === "horde") ? mode : "horde";
  room.sim = createSim(room.mode);
  room.players.forEach((p, i) => {
    addPlayer(room.sim, p.name, COLORS[i % COLORS.length], false, p.id);
  });
  broadcast(room, { type: "start", mode: room.mode });
  startTick(room);
}

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`DeadMag server ok · rooms=${rooms.size}\n`);
    return;
  }
  res.writeHead(404);
  res.end();
});
const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT, () => console.log(`[DeadMag] listening on :${PORT}`));

wss.on("connection", (ws) => {
  let room = null;
  let client = null;

  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }

    if (m.type === "ping") {
      try { ws.send(JSON.stringify({ type: "pong" })); } catch {}
      if (room) room.lastActiveAt = Date.now();
      return;
    }

    if (m.type === "create") {
      room = createRoom();
      client = addClient(room, ws, m.name);
      sendTo(ws, {
        type: "welcome",
        code: room.code,
        playerId: client.id,
        mode: room.mode,
        hostId: room.hostId,
        players: room.players.map((p) => ({ id: p.id, name: p.name })),
      });
    } else if (m.type === "join") {
      room = rooms.get((m.code || "").toUpperCase());
      if (!room) { sendTo(ws, { type: "error", message: "Room not found" }); return; }
      if (room.players.length >= 8) { sendTo(ws, { type: "error", message: "Room full" }); return; }
      client = addClient(room, ws, m.name);
      sendTo(ws, {
        type: "welcome",
        code: room.code,
        playerId: client.id,
        mode: room.mode,
        hostId: room.hostId,
        players: room.players.map((p) => ({ id: p.id, name: p.name })),
      });
      broadcast(room, lobbyPayload(room), ws);
    } else if (m.type === "mode" && room && client && client.id === room.hostId && !room.sim) {
      if (m.mode === "horde" || m.mode === "arsenal") {
        room.mode = m.mode;
        broadcast(room, lobbyPayload(room));
      }
    } else if (m.type === "start" && room && client && client.id === room.hostId && !room.sim) {
      startGame(room, m.mode || room.mode);
    } else if (m.type === "input" && room && client && room.sim) {
      // Apply immediately so the next tick reflects this input.
      if (room.sim.players.get(client.id)) setInput(room.sim, client.id, m.input || {});
    } else if (m.type === "buy" && room && client && room.sim) {
      shopBuy(room.sim, client.id, m.itemId);
    } else if (m.type === "equip" && room && client && room.sim) {
      switchWeapon(room.sim, client.id, m.weapon);
    } else if (m.type === "ready" && room && client && room.sim) {
      setReady(room.sim, client.id, !!m.ready);
    }
    if (room) room.lastActiveAt = Date.now();
  });

  ws.on("close", () => {
    if (!room) return;
    const removed = removeClient(room, ws);
    if (!removed) return;
    if (rooms.has(room.code)) {
      broadcast(room, lobbyPayload(room));
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [, room] of rooms) {
    if (now - room.lastActiveAt > ROOM_TTL_MS) destroyRoom(room);
  }
}, 60_000);
