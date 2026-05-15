// Multiplayer client. The signaling server (server/index.js) only does
// matchmaking + WebRTC SDP/ICE relay. All gameplay traffic — inputs from
// guests, snapshots from host, shop/equip/ready — rides DataChannels.
//
// Topology: star, host-centred. The first joiner is host and runs the
// authoritative sim in main.js. Guests connect only to the host. Host
// connects to every guest. If the host disappears, the next-in-line
// becomes host (server re-elects), but for v1 we just disconnect — the
// game ends cleanly rather than trying to migrate live state.
//
// External API (preserved from the WS-only version so main.js doesn't
// have to know which transport is which):
//   create(name), join(code, name), leave()
//   setMode(mode), startGame(mode)
//   sendInput(input), sendBuy(itemId), sendEquip(weapon), sendReady(ready)
//   broadcastState(state)   ← host calls each tick with serialized sim
//   roster(), peers, waitForPeer(timeoutMs)
// Events emitted: connecting, peers, modeChanged, start, state, input,
//   peerAction, disconnected, serverError.
// New events vs the old version: `input` and `peerAction` fire on the host
// when a guest's DC delivers one — main.js wires those into the sim.

import { PeerLink } from "./p2p.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", ""]);
function isLocalHost() { return LOCAL_HOSTS.has(location.hostname); }

const DEFAULT_REMOTE_SERVER = "wss://deadmag-server.onrender.com";

export function getSavedServerUrl() {
  const q = new URLSearchParams(location.search).get("server");
  if (q) {
    try { localStorage.setItem("deadmag.server", q); } catch {}
    return q;
  }
  try {
    const saved = localStorage.getItem("deadmag.server");
    if (saved) return saved;
  } catch {}
  if (isLocalHost()) return "ws://" + (location.hostname || "localhost") + ":8080";
  return DEFAULT_REMOTE_SERVER;
}

export function setServerUrl(url) {
  if (!url) {
    try { localStorage.removeItem("deadmag.server"); } catch {}
    return;
  }
  let u = url.trim().replace(/\/+$/, "");
  if (/^https:\/\//i.test(u)) u = "wss://" + u.slice(8);
  else if (/^http:\/\//i.test(u)) u = "ws://" + u.slice(7);
  else if (!/^wss?:\/\//i.test(u)) u = (location.protocol === "https:" ? "wss://" : "ws://") + u;
  try { localStorage.setItem("deadmag.server", u); } catch {}
  return u;
}

const DEBUG = true;
const log = (...a) => { if (DEBUG) console.log("[mp]", ...a); };

export const SELF_ID = "self";

const ST = Object.freeze({
  IDLE: "idle",
  CONNECTING: "connecting",
  HANDSHAKING: "handshaking",
  READY: "ready",
  CLOSED: "closed",
});

const HANDSHAKE_TOTAL_MS = 90_000;
const PING_INTERVAL_MS = 10_000;
// Pong timeout is only used to decide when the SIGNALING channel is dead.
// Once DataChannels are up, signaling doesn't carry gameplay, so a stale
// pong shouldn't end the match — but we still want to surface "server
// went away" while sitting in the lobby. 60s is forgiving of flaky links.
const PONG_TIMEOUT_MS = 60_000;

export class Mp {
  constructor() {
    this.ws = null;
    this.state = ST.IDLE;
    this.code = null;
    this.isHost = false;
    this.myName = "PLAYER";
    this.lobbyMode = "horde";
    this.localPlayerId = null;
    this.hostPlayerId = null;
    this.serverPlayers = [];          // [{ id, name }] from signaling lobby
    this.handlers = {};
    this._handshakeResolve = null;
    this._handshakeReject = null;
    this._handshakeDeadline = null;
    this._pingInterval = null;
    this._lastPongAt = 0;
    this._firstPeerResolvers = [];
    // WebRTC links keyed by remote peerId. Host has one per guest; guest has
    // exactly one (against the host).
    this.peerLinks = new Map();
  }

  on(ev, fn) { this.handlers[ev] = fn; }
  _emit(ev, ...args) {
    const fn = this.handlers[ev];
    if (fn) try { fn(...args); } catch (e) { console.error("[mp] handler error", ev, e); }
  }

  _send(type, extra = {}) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ type, ...extra }));
  }

  async create(name) {
    this.myName = name;
    return this._connectAndHandshake({ type: "create", name });
  }

  async join(code, name) {
    this.myName = name;
    const upper = (code || "").toUpperCase();
    this.code = upper;
    return this._connectAndHandshake({ type: "join", code: upper, name });
  }

  _connectAndHandshake(intent) {
    if (this.state !== ST.IDLE && this.state !== ST.CLOSED) {
      return Promise.reject(new Error("Already connecting"));
    }
    const url = getSavedServerUrl();
    if (!url) {
      return Promise.reject(new Error(
        "No DeadMag server configured. Click SERVER on the menu and paste a URL."
      ));
    }
    this._teardown();
    this.state = ST.CONNECTING;
    this._emit("connecting", url);
    log("connecting to", url);

    return new Promise((resolve, reject) => {
      this._handshakeResolve = resolve;
      this._handshakeReject = reject;

      this._handshakeDeadline = setTimeout(() => {
        if (this.state === ST.READY) return;
        const stage = this.state === ST.CONNECTING ? "open" : "handshake";
        this._fail(stage === "open"
          ? "couldn't reach server at " + url + " (free hosts can cold-start; try again)"
          : "server didn't reply in time — try again");
      }, HANDSHAKE_TOTAL_MS);

      let ws;
      try { ws = new WebSocket(url); }
      catch { this._fail("invalid server URL: " + url); return; }
      this.ws = ws;

      ws.onopen = () => {
        if (this.state !== ST.CONNECTING) return;
        this.state = ST.HANDSHAKING;
        if (intent.type === "create") this._send("create", { name: intent.name });
        else this._send("join", { code: intent.code, name: intent.name });
      };

      ws.onerror = () => {
        if (this.state === ST.READY) return;
        this._fail("couldn't reach server at " + url);
      };

      ws.onclose = () => {
        const wasReady = this.state === ST.READY;
        const wasMidHandshake = this.state === ST.CONNECTING || this.state === ST.HANDSHAKING;
        // Don't kill DCs just because signaling died — once WebRTC links are
        // up they don't need the WS to keep flowing. Only fail/disconnect if
        // we were mid-handshake (no fallback) or no peer link survived.
        this._teardownSignaling();
        if (wasMidHandshake) {
          this.state = ST.CLOSED;
          this._fail("connection closed before server replied");
          return;
        }
        if (wasReady) {
          let anyOpen = false;
          for (const [, l] of this.peerLinks) if (l.isOpen()) { anyOpen = true; break; }
          if (anyOpen) {
            log("WS closed mid-game; DCs alive, game continues");
          } else {
            this.state = ST.CLOSED;
            this._emit("disconnected", "signaling lost (no peers)");
          }
        }
      };

      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        this._onSignalingMessage(m);
      };
    });
  }

  _onSignalingMessage(m) {
    if (m.type === "welcome") {
      this.code = m.code;
      this.localPlayerId = m.playerId;
      this.hostPlayerId = m.hostId;
      if (typeof window !== "undefined") window.__mpLocalId = m.playerId;
      this.lobbyMode = m.mode || this.lobbyMode;
      this.serverPlayers = m.players || [];
      this.isHost = this.localPlayerId === this.hostPlayerId;
      this.state = ST.READY;
      this._startHeartbeat();
      if (this._handshakeDeadline) { clearTimeout(this._handshakeDeadline); this._handshakeDeadline = null; }
      const resolve = this._handshakeResolve;
      this._handshakeResolve = null;
      this._handshakeReject = null;
      if (resolve) resolve(this.code);
      // Guests open a PeerLink to the host immediately so the data channel
      // is ready by the time the host hits "start".
      if (!this.isHost && this.hostPlayerId != null) this._ensureLinkToHost();
      this._emit("peers");
      if (this.serverPlayers.length > 1) this._resolveFirstPeer();
    } else if (m.type === "pong") {
      this._lastPongAt = performance.now();
    } else if (m.type === "lobby") {
      if (m.code) this.code = m.code;
      this.lobbyMode = m.mode || this.lobbyMode;
      this.hostPlayerId = m.hostId;
      this.serverPlayers = m.players || [];
      this.isHost = this.localPlayerId === this.hostPlayerId;
      // Drop links for peers that have left.
      const currentIds = new Set(this.serverPlayers.map((p) => p.id));
      for (const [pid, link] of [...this.peerLinks]) {
        if (!currentIds.has(pid) || pid === this.localPlayerId) {
          link.close();
          this.peerLinks.delete(pid);
        }
      }
      // Guests: if host changed, dial the new host.
      if (!this.isHost && this.hostPlayerId != null && !this.peerLinks.has(this.hostPlayerId)) {
        this._ensureLinkToHost();
      }
      this._emit("peers");
      this._emit("modeChanged");
      if (this.serverPlayers.length > 1) this._resolveFirstPeer();
    } else if (m.type === "peerJoined") {
      // Host receives this when a new guest joins. Host is the offerer.
      if (this.isHost && m.peer && m.peer.id !== this.localPlayerId) {
        this._openLink(m.peer.id, /*isOfferer*/ true);
      }
    } else if (m.type === "peerLeft") {
      const link = this.peerLinks.get(m.peerId);
      if (link) { link.close(); this.peerLinks.delete(m.peerId); }
      // If the host left and we're a guest, the game can't continue.
      if (!this.isHost && m.peerId === this.hostPlayerId) {
        this._emit("disconnected", "host left");
      }
    } else if (m.type === "signal") {
      const fromId = m.from;
      let link = this.peerLinks.get(fromId);
      // If we have no link yet, the other side is offering; we answer.
      if (!link) link = this._openLink(fromId, /*isOfferer*/ false);
      link.handleSignal(m.data);
    } else if (m.type === "error") {
      const msg = m.message || "server error";
      if (this.state === ST.HANDSHAKING || this.state === ST.CONNECTING) {
        const userMsg = /room not found/i.test(msg) ? "ROOM NOT FOUND" : msg;
        this._fail(userMsg);
      } else {
        this._emit("serverError", msg);
      }
    } else if (m.type === "start") {
      this._emit("start", { mode: m.mode, mapping: this._identityMapping() });
    }
  }

  _ensureLinkToHost() {
    if (this.isHost || this.hostPlayerId == null) return;
    if (this.peerLinks.has(this.hostPlayerId)) return;
    // Guest is the answerer; the host will send the offer once it knows we exist.
    this._openLink(this.hostPlayerId, /*isOfferer*/ false);
  }

  _openLink(peerId, isOfferer) {
    if (this.peerLinks.has(peerId)) return this.peerLinks.get(peerId);
    const link = new PeerLink({
      peerId,
      isOfferer,
      onSignal: ({ to, kind, data }) => {
        this._send("signal", { to, data: { kind, data } });
      },
      onOpen: () => {
        log("DC open <-> peer", peerId);
        this._emit("peers");
      },
      onMessage: (msg) => this._onDcMessage(peerId, msg),
      onClose: (reason) => {
        log("DC closed <-> peer", peerId, reason);
        this.peerLinks.delete(peerId);
        if (!this.isHost && peerId === this.hostPlayerId && this.state === ST.READY) {
          this._emit("disconnected", "host disconnected");
        }
      },
    });
    this.peerLinks.set(peerId, link);
    return link;
  }

  _onDcMessage(fromId, msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "state") {
      // Guests render-by-snapshot. Host shouldn't normally receive these.
      this._emit("state", msg.state);
    } else if (msg.type === "input") {
      // Host receives a guest's per-frame input.
      this._emit("input", { fromId, input: msg.input });
    } else if (msg.type === "buy" || msg.type === "equip" || msg.type === "ready") {
      // Host receives a guest's lobby/shop action.
      this._emit("peerAction", { fromId, action: msg });
    }
  }

  _identityMapping() {
    const map = {};
    map[SELF_ID] = this.localPlayerId;
    for (const p of this.serverPlayers) map[String(p.id)] = p.id;
    return map;
  }

  _startHeartbeat() {
    this._lastPongAt = performance.now();
    if (this._pingInterval) clearInterval(this._pingInterval);
    this._pingInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== 1) return;
      if (performance.now() - this._lastPongAt > PONG_TIMEOUT_MS) {
        log("signaling heartbeat lost — closing");
        try { this.ws.close(); } catch {}
        return;
      }
      this._send("ping");
    }, PING_INTERVAL_MS);
  }

  _resolveFirstPeer() {
    const rs = this._firstPeerResolvers.splice(0);
    for (const r of rs) r();
  }

  _fail(reason) {
    const reject = this._handshakeReject;
    this._handshakeResolve = null;
    this._handshakeReject = null;
    this._teardown();
    this.state = ST.CLOSED;
    if (reject) reject(new Error(reason));
  }

  // Tear down WS only. Leaves peer links alone so gameplay over DCs can
  // continue even after signaling drops. Called on heartbeat loss and on
  // mid-game WS close.
  _teardownSignaling() {
    if (this._handshakeDeadline) { clearTimeout(this._handshakeDeadline); this._handshakeDeadline = null; }
    if (this._pingInterval) { clearInterval(this._pingInterval); this._pingInterval = null; }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      const w = this.ws;
      this.ws = null;
      try { w.close(); } catch {}
    }
  }

  // Full teardown: WS + every peer link. Used on `leave()` and on hard fail.
  _teardown() {
    this._teardownSignaling();
    for (const [, link] of this.peerLinks) { try { link.close(); } catch {} }
    this.peerLinks.clear();
  }

  waitForPeer(timeoutMs) {
    if (this.serverPlayers.length > 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let done = false;
      const ok = () => { if (done) return; done = true; resolve(); };
      this._firstPeerResolvers.push(ok);
      setTimeout(() => {
        if (done) return;
        done = true;
        const i = this._firstPeerResolvers.indexOf(ok);
        if (i >= 0) this._firstPeerResolvers.splice(i, 1);
        if (this.isHost) resolve();
        else reject(new Error("ROOM NOT FOUND"));
      }, timeoutMs);
    });
  }

  roster() {
    return this.serverPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      host: p.id === this.hostPlayerId,
    }));
  }

  get peers() {
    const m = new Map();
    for (const p of this.serverPlayers) {
      if (p.id === this.localPlayerId) continue;
      m.set(String(p.id), { name: p.name });
    }
    return m;
  }

  setMode(mode) {
    this.lobbyMode = mode;
    if (this.isHost) this._send("mode", { mode });
  }

  startGame(mode) {
    if (!this.isHost) return;
    this._send("start", { mode: mode || this.lobbyMode });
  }

  // Guest → host over DC. Host calls these too but they no-op (host inputs
  // its sim directly via setInput in main.js).
  sendInput(input) {
    if (this.isHost) return;
    const host = this.peerLinks.get(this.hostPlayerId);
    if (host) host.send({ type: "input", input });
  }
  sendBuy(itemId) {
    if (this.isHost) return;
    const host = this.peerLinks.get(this.hostPlayerId);
    if (host) host.send({ type: "buy", itemId });
  }
  sendEquip(weapon) {
    if (this.isHost) return;
    const host = this.peerLinks.get(this.hostPlayerId);
    if (host) host.send({ type: "equip", weapon });
  }
  sendReady(ready) {
    if (this.isHost) return;
    const host = this.peerLinks.get(this.hostPlayerId);
    if (host) host.send({ type: "ready", ready: !!ready });
  }

  // Host → all guests. Called by main.js's frame loop at ~30Hz.
  broadcastState(state) {
    if (!this.isHost) return;
    const msg = { type: "state", state };
    for (const [, link] of this.peerLinks) {
      if (link.isOpen()) link.send(msg);
    }
  }

  leave() {
    this._teardown();
    this.state = ST.CLOSED;
    this.code = null;
    this.serverPlayers = [];
    this.localPlayerId = null;
    this.hostPlayerId = null;
    this.isHost = false;
    const rs = this._firstPeerResolvers.splice(0);
    for (const r of rs) r();
  }
}
