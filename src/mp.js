// WebSocket multiplayer client. Talks to server/index.js (authoritative sim).
// Same external API as the old P2P Mp class so main.js doesn't have to change.

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
  // normalize: accept https:// → wss://, http:// → ws://, strip trailing slash
  let u = url.trim().replace(/\/+$/, "");
  if (/^https:\/\//i.test(u)) u = "wss://" + u.slice(8);
  else if (/^http:\/\//i.test(u)) u = "ws://" + u.slice(7);
  else if (!/^wss?:\/\//i.test(u)) u = (location.protocol === "https:" ? "wss://" : "ws://") + u;
  try { localStorage.setItem("deadmag.server", u); } catch {}
  return u;
}

const DEBUG = true;
const log = (...a) => { if (DEBUG) console.log("[mp]", ...a); };

// Kept for back-compat with main.js imports. We don't actually use it as an ID anymore;
// the server assigns the canonical playerId.
export const SELF_ID = "self";

export class Mp {
  constructor() {
    this.ws = null;
    this.code = null;
    this.isHost = false;
    this.myName = "PLAYER";
    this.lobbyMode = "horde";
    this.localPlayerId = null;
    this.hostPlayerId = null;
    this.serverPlayers = [];        // [{ id, name }]
    this.handlers = {};
    this._opened = false;
    this._welcomed = false;
    this._welcomeWaiters = [];
    this._firstPeerResolvers = [];
  }

  on(ev, fn) { this.handlers[ev] = fn; }

  _emit(ev, ...args) {
    const fn = this.handlers[ev];
    if (fn) try { fn(...args); } catch (e) { console.error("[mp] handler error", ev, e); }
  }

  async _connect() {
    if (this.ws) return;
    const url = getSavedServerUrl();
    if (!url) {
      throw new Error("No DeadMag server configured. Click SERVER on the menu and paste your server URL (e.g. wss://your-server.onrender.com).");
    }
    log("connecting to", url);
    this._emit("connecting", url);
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
      this.ws = ws;
      const tm = setTimeout(() => {
        if (this._opened) return;
        try { ws.close(); } catch {}
        reject(new Error("Couldn't reach DeadMag server at " + url + " (free hosts can cold-start; try again)"));
      }, 60000);
      ws.onopen = () => {
        clearTimeout(tm);
        this._opened = true;
        log("ws open");
        resolve();
      };
      ws.onerror = (e) => {
        log("ws error", e?.message || "");
        if (!this._opened) {
          clearTimeout(tm);
          reject(new Error("Couldn't reach DeadMag server at " + url));
        }
      };
      ws.onclose = () => {
        log("ws close");
        this._opened = false;
        this._emit("peerLeft", "host");
      };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        this._onMessage(m);
      };
    });
  }

  _send(type, extra = {}) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ type, ...extra }));
  }

  _onMessage(m) {
    if (m.type === "welcome") {
      this._welcomed = true;
      this.code = m.code;
      this.localPlayerId = m.playerId;
      this.hostPlayerId = m.hostId;
      if (typeof window !== "undefined") window.__mpLocalId = m.playerId;
      this.lobbyMode = m.mode || this.lobbyMode;
      this.serverPlayers = m.players || [];
      this.isHost = this.localPlayerId === this.hostPlayerId;
      const ws = this._welcomeWaiters.splice(0);
      for (const w of ws) w.resolve();
      this._emit("peers");
      if (this.serverPlayers.length > 1) this._resolveFirstPeer();
    } else if (m.type === "lobby") {
      this.lobbyMode = m.mode || this.lobbyMode;
      this.hostPlayerId = m.hostId;
      this.serverPlayers = m.players || [];
      this.isHost = this.localPlayerId === this.hostPlayerId;
      this._emit("peers");
      this._emit("modeChanged");
      if (this.serverPlayers.length > 1) this._resolveFirstPeer();
    } else if (m.type === "error") {
      log("server error:", m.message);
      const ws = this._welcomeWaiters.splice(0);
      for (const w of ws) w.reject(new Error(m.message || "ROOM NOT FOUND"));
    } else if (m.type === "start") {
      // server tells us the game is starting; player IDs are already established.
      this._emit("start", { mode: m.mode, mapping: this._identityMapping() });
    } else if (m.type === "state") {
      if (typeof window !== "undefined") {
        try { window.__lastState = structuredClone(m.state); } catch { window.__lastState = JSON.parse(JSON.stringify(m.state)); }
      }
      this._emit("state", m.state);
    }
  }

  _identityMapping() {
    // main.js expects `mapping[SELF_ID] -> localId`. With the server model,
    // both sides know their own localPlayerId directly. Build a mapping
    // that lets main.js's existing code still resolve our local id.
    const map = {};
    map[SELF_ID] = this.localPlayerId;
    for (const p of this.serverPlayers) map[String(p.id)] = p.id;
    return map;
  }

  _resolveFirstPeer() {
    const rs = this._firstPeerResolvers.splice(0);
    for (const r of rs) r();
  }

  async create(name) {
    this.myName = name;
    await this._connect();
    return new Promise((resolve, reject) => {
      this._welcomeWaiters.push({
        resolve: () => resolve(this.code),
        reject,
      });
      this._send("create", { name });
      setTimeout(() => {
        if (this._welcomed) return;
        reject(new Error("Server didn't reply"));
      }, 6000);
    });
  }

  async join(code, name) {
    this.myName = name;
    this.code = (code || "").toUpperCase();
    await this._connect();
    return new Promise((resolve, reject) => {
      this._welcomeWaiters.push({
        resolve: () => resolve(),
        reject: (e) => reject(new Error(e.message === "Room not found" ? "ROOM NOT FOUND" : e.message)),
      });
      this._send("join", { code: this.code, name });
      setTimeout(() => {
        if (this._welcomed) return;
        reject(new Error("ROOM NOT FOUND"));
      }, 8000);
    });
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
        // For host, no peers may join — that's not an error. Resolve so lobby stays open.
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

  // Used by main.js iteration over mp.peers — return a Map-like that
  // contains everyone other than self, keyed by playerId.
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

  startGame(mode /*, mapping */) {
    if (!this.isHost) return;
    this._send("start", { mode: mode || this.lobbyMode });
  }

  sendInput(input)  { this._send("input", { input }); }
  sendBuy(itemId)   { this._send("buy", { itemId }); }
  sendEquip(weapon) { this._send("equip", { weapon }); }
  sendReady(ready)  { this._send("ready", { ready: !!ready }); }

  // Old API stubs — server is authoritative, so these are no-ops on the host side.
  broadcastState(_state) { /* no-op: server broadcasts */ }

  leave() {
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this._welcomed = false;
    this._opened = false;
    this.serverPlayers = [];
    this.localPlayerId = null;
    this.hostPlayerId = null;
  }
}
