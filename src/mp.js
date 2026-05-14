const APP_ID = "deadmag-v1";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEBUG = true;
const log = (...a) => { if (DEBUG) console.log("[mp]", ...a); };

function randomId(len = 12) {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function generateCode() {
  let c = "";
  for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

export const SELF_ID = `${APP_ID}-self-${randomId(10)}`;
const roomIdFor = (code) => `${APP_ID}-room-${code}`;

function getPeerCtor() {
  const P = typeof window !== "undefined" ? window.Peer : null;
  if (!P) throw new Error("PeerJS not loaded (window.Peer missing). Check the <script> tag in index.html.");
  return P;
}

export class Mp {
  constructor() {
    this.peer = null;
    this.code = null;
    this.isHost = false;
    this.myName = "PLAYER";
    this.peers = new Map();
    this.lobbyMode = "horde";
    this.handlers = {};
    this._firstPeerResolvers = [];
    this.hostConn = null;
    this._destroyed = false;
  }

  on(ev, fn) { this.handlers[ev] = fn; }

  async create(name) {
    this.code = generateCode();
    this.isHost = true;
    this.myName = name;
    await this._initPeer(roomIdFor(this.code));
    this.peer.on("connection", (conn) => this._setupHostConn(conn));
    log("hosting room", this.code);
    return this.code;
  }

  async join(code, name) {
    this.code = (code || "").toUpperCase();
    this.isHost = false;
    this.myName = name;
    await this._initPeer(SELF_ID);
    const hostId = roomIdFor(this.code);
    log("connecting to host", hostId);
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(hostId, { reliable: true });
      if (!conn) { reject(new Error("ROOM NOT FOUND")); return; }
      this.hostConn = conn;
      let resolved = false;
      const fail = (why) => {
        if (resolved) return;
        resolved = true;
        log("join failed:", why);
        try { conn.close(); } catch {}
        reject(new Error("ROOM NOT FOUND"));
      };
      const win = () => {
        if (resolved) return;
        resolved = true;
        log("guest→host conn open");
        this._setupGuestConn(conn);
        resolve();
      };
      conn.on("open", win);
      conn.on("error", (e) => fail(e?.type || e?.message || "conn-error"));
      this.peer.on("error", (err) => {
        if (err?.type === "peer-unavailable") fail("peer-unavailable");
      });
      setTimeout(() => fail("timeout"), 20000);
    });
  }

  _initPeer(id) {
    return new Promise((resolve, reject) => {
      let Peer;
      try { Peer = getPeerCtor(); } catch (e) { reject(e); return; }
      try {
        this.peer = new Peer(id, { debug: 1 });
      } catch (e) {
        reject(e);
        return;
      }
      let settled = false;
      this.peer.on("open", (pid) => {
        if (settled) return;
        settled = true;
        log("peer open", pid);
        resolve();
      });
      this.peer.on("error", (err) => {
        log("peer error", err?.type, err?.message);
        if (settled) return;
        if (err?.type === "unavailable-id") {
          settled = true;
          reject(new Error("ROOM CODE TAKEN — try another"));
        } else if (err?.type === "network" || err?.type === "server-error" || err?.type === "socket-error" || err?.type === "browser-incompatible") {
          settled = true;
          reject(new Error("Peer broker unreachable: " + err.type));
        }
      });
      setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Peer broker timeout"));
      }, 15000);
    });
  }

  _setupHostConn(conn) {
    log("guest connecting", conn.peer.slice(-6));
    conn.on("open", () => {
      log("host conn open with", conn.peer.slice(-6));
      if (!this.peers.has(conn.peer)) {
        this.peers.set(conn.peer, { name: "P_" + conn.peer.slice(-4), conn });
        this.handlers.peers?.();
      }
    });
    conn.on("data", (msg) => this._onMessage(msg, conn));
    conn.on("close", () => {
      log("host conn closed:", conn.peer.slice(-6));
      this.peers.delete(conn.peer);
      this.handlers.peerLeft?.(conn.peer);
      this.handlers.peers?.();
      this._broadcast("lobby", { players: this.roster(), mode: this.lobbyMode });
    });
    conn.on("error", (e) => log("host conn error:", e?.message || e));
  }

  _setupGuestConn(conn) {
    conn.on("data", (msg) => this._onMessage(msg, conn));
    conn.on("close", () => {
      log("guest→host conn closed");
      this.handlers.peerLeft?.("host");
    });
    conn.on("error", (e) => log("guest conn error:", e?.message || e));
    const hi = () => this._send(conn, "hello", { name: this.myName });
    hi();
    setTimeout(hi, 300);
    setTimeout(hi, 1200);
  }

  _onMessage(msg, conn) {
    if (!msg || typeof msg !== "object") return;
    const { type, data } = msg;
    if (type === "hello") {
      this.peers.set(conn.peer, { name: data?.name || ("P_" + conn.peer.slice(-4)), conn });
      this.handlers.peers?.();
      this._resolveFirstPeer();
      if (this.isHost) this._broadcast("lobby", { players: this.roster(), mode: this.lobbyMode });
    } else if (type === "lobby") {
      if (!this.isHost && data) {
        this._remoteRoster = data.players || [];
        this.lobbyMode = data.mode || this.lobbyMode;
        this.handlers.peers?.();
        this._resolveFirstPeer();
      }
    } else if (type === "mode") {
      if (!this.isHost) { this.lobbyMode = data.mode; this.handlers.modeChanged?.(); }
    } else if (type === "start") {
      if (!this.isHost) this.handlers.start?.(data);
    } else if (type === "input") {
      if (this.isHost) this.handlers.peerInput?.(conn.peer, data);
    } else if (type === "state") {
      if (!this.isHost) this.handlers.state?.(data);
    } else if (type === "buy") {
      if (this.isHost) this.handlers.peerBuy?.(conn.peer, data);
    } else if (type === "equip") {
      if (this.isHost) this.handlers.peerEquip?.(conn.peer, data);
    } else if (type === "ready") {
      if (this.isHost) this.handlers.peerReady?.(conn.peer, !!data?.ready);
    }
  }

  _send(conn, type, data) {
    try { if (conn?.open) conn.send({ type, data }); } catch (e) { log("send fail", type, e?.message); }
  }

  _broadcast(type, data) {
    for (const [, p] of this.peers) this._send(p.conn, type, data);
  }

  _resolveFirstPeer() {
    const rs = this._firstPeerResolvers.splice(0);
    for (const r of rs) r();
  }

  waitForPeer(timeoutMs) {
    if (this.peers.size > 0 || this._remoteRoster) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let done = false;
      const ok = () => { if (done) return; done = true; resolve(); };
      this._firstPeerResolvers.push(ok);
      setTimeout(() => {
        if (done) return;
        done = true;
        const idx = this._firstPeerResolvers.indexOf(ok);
        if (idx >= 0) this._firstPeerResolvers.splice(idx, 1);
        reject(new Error("ROOM NOT FOUND"));
      }, timeoutMs);
    });
  }

  roster() {
    if (this.isHost) {
      return [
        { id: SELF_ID, name: this.myName, host: true },
        ...[...this.peers].map(([id, p]) => ({ id, name: p.name, host: false })),
      ];
    }
    return this._remoteRoster || [{ id: SELF_ID, name: this.myName, host: false }];
  }

  setMode(mode) {
    this.lobbyMode = mode;
    if (this.isHost) {
      this._broadcast("mode", { mode });
      this._broadcast("lobby", { players: this.roster(), mode });
    }
  }

  startGame(mode, mapping) {
    if (!this.isHost) return;
    this._broadcast("start", { mode, mapping });
  }

  sendInput(input)        { if (!this.isHost) this._send(this.hostConn, "input", input); }
  broadcastState(state)   { if (this.isHost) this._broadcast("state", state); }
  sendBuy(itemId)         { if (!this.isHost) this._send(this.hostConn, "buy", { itemId }); }
  sendEquip(weapon)       { if (!this.isHost) this._send(this.hostConn, "equip", { weapon }); }
  sendReady(ready)        { if (!this.isHost) this._send(this.hostConn, "ready", { ready: !!ready }); }

  leave() {
    this._destroyed = true;
    try { this.peer?.destroy(); } catch {}
    this.peer = null;
    this.peers.clear();
    this.hostConn = null;
  }
}
