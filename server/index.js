// DeadMag signaling server.
//
// As of v1.x the server no longer runs the sim. Players connect peer-to-peer
// via WebRTC DataChannels and the host runs the authoritative simulation in
// the browser. The server's job is now narrow:
//
//   - issue 4-char room codes
//   - track who's in each room (id + name + ws)
//   - elect a host (first joiner; promoted to next-in-line if host leaves)
//   - relay WebRTC SDP/ICE messages between peers in the same room
//   - broadcast lobby state changes (mode, roster) for pre-game UI
//
// All gameplay traffic (state, input, buy, equip, ready) skips the server
// entirely and rides the DataChannel.
//
// Wire protocol (client ↔ server):
//   c→s: { type:"create"|"join", code?, name }
//   c→s: { type:"mode", mode }                    (host only)
//   c→s: { type:"start", mode }                   (host only, broadcast)
//   c→s: { type:"signal", to:peerId, data }       (relay to that peer)
//   c→s: { type:"ping" }
//   s→c: { type:"welcome", code, playerId, hostId, mode, players }
//   s→c: { type:"lobby",   code, mode, hostId, players }
//   s→c: { type:"peerJoined", peer:{id,name} }    (host gets this when a guest joins)
//   s→c: { type:"peerLeft",   peerId }
//   s→c: { type:"start", mode }
//   s→c: { type:"signal", from:peerId, data }
//   s→c: { type:"error", message }
//   s→c: { type:"pong" }

import http from "http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT) || 8080;
const ROOM_TTL_MS = 1000 * 60 * 30;
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

function createRoom() {
  const code = newCode();
  const room = {
    code,
    mode: "horde",
    players: [],          // [{ id, name, ws }]
    hostId: null,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function destroyRoom(room) {
  rooms.delete(room.code);
}

let _id = 1000;
function nextId() { return _id++; }

function addClient(room, ws, name) {
  const playerId = nextId();
  const client = { id: playerId, ws, name: name || ("P_" + playerId) };
  room.players.push(client);
  if (room.hostId == null) room.hostId = playerId;
  return client;
}

function removeClient(room, ws) {
  const idx = room.players.findIndex((p) => p.ws === ws);
  if (idx < 0) return null;
  const [client] = room.players.splice(idx, 1);
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

function sendToId(room, peerId, msg) {
  const target = room.players.find((p) => p.id === peerId);
  if (!target) return false;
  try { target.ws.send(JSON.stringify(msg)); return true; } catch { return false; }
}

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`DeadMag signaling ok · rooms=${rooms.size}\n`);
    return;
  }
  res.writeHead(404);
  res.end();
});
const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT, () => console.log(`[DeadMag signaling] listening on :${PORT}`));

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
      // Tell the host (and any existing peers) that a new peer joined so the
      // host can initiate WebRTC. Send before the lobby broadcast so the host
      // can start negotiation as soon as possible.
      broadcast(room, { type: "peerJoined", peer: { id: client.id, name: client.name } }, ws);
      broadcast(room, lobbyPayload(room));
    } else if (m.type === "mode" && room && client && client.id === room.hostId) {
      if (m.mode === "horde" || m.mode === "arsenal") {
        room.mode = m.mode;
        broadcast(room, lobbyPayload(room));
      }
    } else if (m.type === "start" && room && client && client.id === room.hostId) {
      broadcast(room, { type: "start", mode: m.mode || room.mode });
    } else if (m.type === "signal" && room && client && typeof m.to === "number") {
      // Forward an SDP offer/answer or ICE candidate to a peer in the same room.
      sendToId(room, m.to, { type: "signal", from: client.id, data: m.data });
    }
    if (room) room.lastActiveAt = Date.now();
  });

  ws.on("close", () => {
    if (!room) return;
    const removed = removeClient(room, ws);
    if (!removed) return;
    if (rooms.has(room.code)) {
      broadcast(room, { type: "peerLeft", peerId: removed.id });
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
