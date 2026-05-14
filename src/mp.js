// WebSocket multiplayer client. Talks to server/index.js (authoritative sim).
// Same external API as the old P2P Mp class so main.js doesn't have to change much.
//
// Structural notes (2026-05): the previous design had two racing timeouts —
// a 60s ws.open timer plus a 6/8s welcome-reply timer — which interacted badly
// with Render free-tier cold starts. It also never nulled `this.ws` on close,
// so retries silently no-op'd, and it had no heartbeat so dead connections
// went unnoticed. This is a single state machine: idle → connecting →
// handshaking → ready → closed, with one unified budget covering the whole
// connect-and-handshake flow, a ping/pong keepalive, and a clean shutdown
// path that surfaces a `disconnected` event so the UI can recover.

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

// Single budget covering "open TCP/WS" + "server replies with welcome".
// Render free-tier cold starts can take 30–60s; give the whole flow 90s.
const HANDSHAKE_TOTAL_MS = 90_000;
// Heartbeat: send a ping every 10s, treat the connection as dead if we
// haven't seen a pong in 30s. Catches silent half-open connections that
// browsers don't always surface as `onclose`.
const PING_INTERVAL_MS = 10_000;
const PONG_TIMEOUT_MS = 30_000;

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
    this.serverPlayers = [];        // [{ id, name }]
    this.handlers = {};
    this._handshakeResolve = null;
    this._handshakeReject = null;
    this._handshakeDeadline = null;
    this._pingInterval = null;
    this._lastPongAt = 0;
    this._firstPeerResolvers = [];
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

  // Single flow: open WS, send create/join, wait for welcome, all under one budget.
  // Resolves with the room code on welcome; rejects with a human-readable reason
  // on any failure mode (cold-start timeout, server-side error, mid-handshake drop).
  _connectAndHandshake(intent) {
    if (this.state !== ST.IDLE && this.state !== ST.CLOSED) {
      return Promise.reject(new Error("Already connecting"));
    }
    const url = getSavedServerUrl();
    if (!url) {
      return Promise.reject(new Error(
        "No DeadMag server configured. Click SERVER on the menu and paste a URL " +
        "(e.g. wss://deadmag-server.onrender.com)."
      ));
    }
    // Reset any leftover state from a previous attempt.
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
        this._fail(
          stage === "open"
            ? "couldn't reach server at " + url + " (free hosts can cold-start; try again)"
            : "server didn't reply in time — try again"
        );
      }, HANDSHAKE_TOTAL_MS);

      let ws;
      try { ws = new WebSocket(url); }
      catch (e) {
        this._fail("invalid server URL: " + url);
        return;
      }
      this.ws = ws;

      ws.onopen = () => {
        if (this.state !== ST.CONNECTING) return;
        this.state = ST.HANDSHAKING;
        log("ws open, sending", intent.type);
        if (intent.type === "create") this._send("create", { name: intent.name });
        else this._send("join", { code: intent.code, name: intent.name });
      };

      ws.onerror = (e) => {
        log("ws error", e?.message || "");
        if (this.state === ST.READY) return;
        this._fail("couldn't reach server at " + url);
      };

      ws.onclose = () => {
        log("ws close (state=" + this.state + ")");
        const wasReady = this.state === ST.READY;
        const wasMidHandshake = this.state === ST.CONNECTING || this.state === ST.HANDSHAKING;
        this._teardown();
        this.state = ST.CLOSED;
        if (wasMidHandshake) {
          this._fail("connection closed before server replied");
        }
        if (wasReady) {
          this._emit("disconnected", "connection lost");
        }
      };

      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        this._onMessage(m);
      };
    });
  }

  _onMessage(m) {
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
      // Resolve handshake BEFORE emitting peers, so any synchronous lobby
      // render reads from a fully-populated mp.
      if (this._handshakeDeadline) { clearTimeout(this._handshakeDeadline); this._handshakeDeadline = null; }
      const resolve = this._handshakeResolve;
      this._handshakeResolve = null;
      this._handshakeReject = null;
      if (resolve) resolve(this.code);
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
      this._emit("peers");
      this._emit("modeChanged");
      if (this.serverPlayers.length > 1) this._resolveFirstPeer();
    } else if (m.type === "error") {
      const msg = m.message || "server error";
      log("server error:", msg);
      if (this.state === ST.HANDSHAKING || this.state === ST.CONNECTING) {
        const userMsg = /room not found/i.test(msg) ? "ROOM NOT FOUND" : msg;
        this._fail(userMsg);
      } else {
        this._emit("serverError", msg);
      }
    } else if (m.type === "start") {
      this._emit("start", { mode: m.mode, mapping: this._identityMapping() });
    } else if (m.type === "state") {
      if (typeof window !== "undefined") {
        try { window.__lastState = structuredClone(m.state); }
        catch { window.__lastState = JSON.parse(JSON.stringify(m.state)); }
      }
      this._emit("state", m.state);
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
        log("heartbeat lost — closing");
        // Don't emit disconnected here; the onclose handler will do it,
        // and we want a single source of truth.
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

  // Reject the pending handshake (if any) and tear down. Safe to call repeatedly.
  _fail(reason) {
    const reject = this._handshakeReject;
    this._handshakeResolve = null;
    this._handshakeReject = null;
    this._teardown();
    this.state = ST.CLOSED;
    if (reject) reject(new Error(reason));
  }

  // Stop heartbeat + handshake deadline, close socket, but DON'T touch
  // identity state (code/localPlayerId/etc) — callers may still need it
  // briefly for the disconnected event.
  _teardown() {
    if (this._handshakeDeadline) { clearTimeout(this._handshakeDeadline); this._handshakeDeadline = null; }
    if (this._pingInterval) { clearInterval(this._pingInterval); this._pingInterval = null; }
    if (this.ws) {
      // Detach handlers so a late close/error after we've moved on can't fire.
      this.ws.onopen = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      const w = this.ws;
      this.ws = null;
      try { w.close(); } catch {}
    }
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

  sendInput(input)  { this._send("input", { input }); }
  sendBuy(itemId)   { this._send("buy", { itemId }); }
  sendEquip(weapon) { this._send("equip", { weapon }); }
  sendReady(ready)  { this._send("ready", { ready: !!ready }); }

  broadcastState(_state) { /* no-op: server broadcasts */ }

  leave() {
    this._teardown();
    this.state = ST.CLOSED;
    this.code = null;
    this.serverPlayers = [];
    this.localPlayerId = null;
    this.hostPlayerId = null;
    this.isHost = false;
    // Drop any pending peer-wait so callers don't hang.
    const rs = this._firstPeerResolvers.splice(0);
    for (const r of rs) r();
  }
}
