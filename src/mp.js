import { joinRoom, selfId } from "https://esm.sh/trystero@0.21.5/nostr";

const APP_ID = "deadmag-v1";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode() {
  let c = "";
  for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

export const SELF_ID = selfId;

export class Mp {
  constructor() {
    this.room = null;
    this.code = null;
    this.isHost = false;
    this.myName = "PLAYER";
    this.peers = new Map();
    this.lobbyMode = "horde";
    this.handlers = {};
    this._actions = {};
    this._helloRetry = null;
    this._firstPeerResolvers = [];
  }

  on(ev, fn) { this.handlers[ev] = fn; }

  async create(name) {
    this.code = generateCode();
    this.isHost = true;
    this.myName = name;
    await this._connect();
    return this.code;
  }

  async join(code, name) {
    this.code = (code || "").toUpperCase();
    this.isHost = false;
    this.myName = name;
    await this._connect();
  }

  async _connect() {
    this.room = joinRoom({ appId: APP_ID }, this.code);

    const mk = (n) => {
      const [send, recv] = this.room.makeAction(n);
      this._actions[n] = send;
      return recv;
    };
    const rHello   = mk("hello");
    const rLobby   = mk("lobby");
    const rStart   = mk("start");
    const rInput   = mk("input");
    const rState   = mk("state");
    const rBuy     = mk("buy");
    const rEquip   = mk("equip");
    const rMode    = mk("mode");
    const rReady   = mk("ready");

    rHello((data, peerId) => {
      this.peers.set(peerId, { name: data?.name || ("P_" + peerId.slice(0, 4)) });
      this.handlers.peers?.();
      if (this.isHost) {
        this._actions.lobby({ players: this.roster(), mode: this.lobbyMode });
      }
    });

    rLobby((data) => {
      if (!this.isHost && data) {
        this._remoteRoster = data.players || [];
        this.lobbyMode = data.mode || this.lobbyMode;
        this.handlers.peers?.();
      }
    });

    rMode((data) => {
      if (!this.isHost) this.lobbyMode = data.mode;
      this.handlers.modeChanged?.();
    });

    rStart((data) => {
      if (!this.isHost) this.handlers.start?.(data);
    });

    rInput((data, peerId) => {
      if (this.isHost) this.handlers.peerInput?.(peerId, data);
    });

    rState((data) => {
      if (!this.isHost) this.handlers.state?.(data);
    });

    rBuy((data, peerId) => {
      if (this.isHost) this.handlers.peerBuy?.(peerId, data);
    });

    rEquip((data, peerId) => {
      if (this.isHost) this.handlers.peerEquip?.(peerId, data);
    });

    rReady((data, peerId) => {
      if (this.isHost) this.handlers.peerReady?.(peerId, !!data?.ready);
    });

    this.room.onPeerJoin((peerId) => {
      this._sayHello(peerId);
      const rs = this._firstPeerResolvers.splice(0);
      for (const r of rs) r();
    });
    this.room.onPeerLeave((peerId) => {
      this.peers.delete(peerId);
      this.handlers.peerLeft?.(peerId);
      this.handlers.peers?.();
      if (this.isHost) this._actions.lobby({ players: this.roster(), mode: this.lobbyMode });
    });
  }

  _sayHello(peerId) {
    const send = () => {
      try {
        if (peerId) this._actions.hello?.({ name: this.myName }, peerId);
        else this._actions.hello?.({ name: this.myName });
      } catch {}
    };
    send();
    setTimeout(send, 250);
    setTimeout(send, 800);
    setTimeout(() => { try { this._actions.hello?.({ name: this.myName }); } catch {} }, 1800);
  }

  waitForPeer(timeoutMs) {
    if (this.peers.size > 0) return Promise.resolve();
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
        { id: selfId, name: this.myName, host: true },
        ...[...this.peers].map(([id, p]) => ({ id, name: p.name, host: false })),
      ];
    }
    return this._remoteRoster || [{ id: selfId, name: this.myName, host: false }];
  }

  setMode(mode) {
    this.lobbyMode = mode;
    if (this.isHost) {
      this._actions.mode({ mode });
      this._actions.lobby({ players: this.roster(), mode });
    }
  }

  startGame(mode, mapping) {
    if (!this.isHost) return;
    this._actions.start({ mode, mapping });
  }

  sendInput(input)        { if (!this.isHost) this._actions.input(input); }
  broadcastState(state)   { if (this.isHost) this._actions.state(state); }
  sendBuy(itemId)         { if (!this.isHost) this._actions.buy({ itemId }); }
  sendEquip(weapon)       { if (!this.isHost) this._actions.equip({ weapon }); }
  sendReady(ready)        { if (!this.isHost) this._actions.ready({ ready: !!ready }); }

  leave() {
    try { this.room?.leave(); } catch {}
    this.room = null;
    this.peers.clear();
    this._actions = {};
  }
}
