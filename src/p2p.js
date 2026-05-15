// PeerLink — one WebRTC connection to one other peer, with a reliable
// ordered DataChannel for game traffic. The signaling server only relays
// SDP/ICE between us; nothing else flows through it once the channel opens.
//
// Topology: star, host-centred. The host runs `new PeerLink({ isOfferer: true })`
// per guest, creates the offer and SetLocalDescription, and forwards the
// resulting SDP through the signaling server. Guests run a single PeerLink
// against the host with `isOfferer: false` and answer.
//
// Outbound signals: `onSignal({ to, kind:"offer"|"answer"|"ice", data })`.
// The caller is responsible for routing this through the signaling WS.
// Inbound signals: `handleSignal({ kind, data })`.
//
// Lifecycle: connecting → open → closed. `close()` is idempotent.

// STUN alone gets us through cone NAT (most home routers). For symmetric NAT
// or restrictive corporate firewalls we need TURN as a relay fallback —
// without it those peers see "connection failed" and the DC never opens.
//
// The default uses openrelay's public free TURN, which is heavily oversubscribed
// and frequently unreachable. If TURN doesn't gather relay candidates (the
// connecting overlay shows relay:0) the user should bring their own: free
// metered.ca account gives 50 GB/mo with personal credentials, signup at
// https://www.metered.ca/tools/openrelay/ — paste them via the TURN button
// on the menu. Override is stored in localStorage as deadmag.ice (JSON).
const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80",                   username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443",                  username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp",    username: "openrelayproject", credential: "openrelayproject" },
];

export function getSavedIceServers() {
  // URL param: ?ice=<urlencoded JSON array>. Falls back to localStorage.
  try {
    const q = new URLSearchParams(location.search).get("ice");
    if (q) {
      const parsed = JSON.parse(q);
      if (Array.isArray(parsed) && parsed.length) {
        try { localStorage.setItem("deadmag.ice", JSON.stringify(parsed)); } catch {}
        return parsed;
      }
    }
  } catch {}
  try {
    const saved = localStorage.getItem("deadmag.ice");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {}
  return DEFAULT_ICE_SERVERS;
}

export function setSavedIceServers(servers) {
  if (!servers || !Array.isArray(servers) || servers.length === 0) {
    try { localStorage.removeItem("deadmag.ice"); } catch {}
    return;
  }
  try { localStorage.setItem("deadmag.ice", JSON.stringify(servers)); } catch {}
}

export function summarizeIceServers(servers) {
  const list = servers || getSavedIceServers();
  const turns = list.filter((s) => /^turn[s]?:/i.test(Array.isArray(s.urls) ? s.urls[0] : s.urls));
  if (!turns.length) return "no TURN";
  const first = turns[0];
  const url = Array.isArray(first.urls) ? first.urls[0] : first.urls;
  return `${turns.length} TURN · ${url.replace(/^turn[s]?:/i, "")}`;
}

function buildIceConfig() {
  return { iceServers: getSavedIceServers(), iceCandidatePoolSize: 4 };
}

const CHANNEL_LABEL = "game";

export class PeerLink {
  constructor({ peerId, isOfferer, onSignal, onOpen, onMessage, onClose, onDiag }) {
    this.peerId = peerId;
    this.isOfferer = !!isOfferer;
    this.onSignal = onSignal || (() => {});
    this.onOpen = onOpen || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onClose = onClose || (() => {});
    this.onDiag = onDiag || (() => {});
    this.state = "connecting";
    this.dc = null;
    this._closed = false;
    this._pendingIce = [];
    this._iceRestartTried = false;
    // Diagnostic counters surfaced via onDiag so the UI can show what's
    // actually happening during the handshake (host candidates alone mean
    // STUN never reached; zero relay means TURN is unreachable).
    this._diag = { iceState: "new", pcState: "new", gathering: "new",
      localHost: 0, localSrflx: 0, localRelay: 0, remoteHost: 0, remoteSrflx: 0, remoteRelay: 0 };

    this.pc = new RTCPeerConnection(buildIceConfig());
    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      this._countCandidate("local", ev.candidate);
      this.onSignal({ to: this.peerId, kind: "ice", data: ev.candidate.toJSON() });
    };
    this.pc.onicegatheringstatechange = () => {
      this._diag.gathering = this.pc.iceGatheringState;
      console.log("[p2p] peer", this.peerId, "ice-gathering:", this.pc.iceGatheringState);
      this._emitDiag();
    };
    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc.iceConnectionState;
      this._diag.iceState = s;
      console.log("[p2p] peer", this.peerId, "ice:", s);
      this._emitDiag();
      // ICE can fail once and recover via ICE restart — give it one chance
      // before the PC tears down. Only the offerer can initiate.
      if (s === "failed" && this.isOfferer && !this._iceRestartTried && !this._closed) {
        this._iceRestartTried = true;
        console.log("[p2p] peer", this.peerId, "ICE failed; restarting…");
        this._negotiate({ iceRestart: true });
      }
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      this._diag.pcState = s;
      console.log("[p2p] peer", this.peerId, "pc:", s);
      this._emitDiag();
      // "disconnected" is transient — ICE can drop and recover. Only tear
      // down on terminal states; let "disconnected" linger and either heal
      // back to "connected" or escalate to "failed".
      if (s === "failed" || s === "closed") this._handleClose("pc-" + s);
    };
    this.pc.ondatachannel = (ev) => {
      // Answerer path: host's offer created the channel; we just adopt it.
      if (ev.channel.label === CHANNEL_LABEL) this._wireDC(ev.channel);
    };

    if (this.isOfferer) {
      this._wireDC(this.pc.createDataChannel(CHANNEL_LABEL, { ordered: true }));
      this._negotiate();
    }
  }

  _countCandidate(side, c) {
    // Sometimes the candidate object has .type; sometimes (with toJSON) we
    // only have the .candidate string with "typ host"/"typ srflx"/"typ relay".
    let t = c?.type;
    if (!t && typeof c?.candidate === "string") {
      const m = c.candidate.match(/ typ (host|srflx|relay)/);
      if (m) t = m[1];
    }
    if (!t) return;
    const key = side + (t === "host" ? "Host" : t === "srflx" ? "Srflx" : t === "relay" ? "Relay" : null);
    if (key && this._diag[key] != null) this._diag[key] += 1;
    this._emitDiag();
  }

  _emitDiag() {
    try { this.onDiag({ ...this._diag }); } catch {}
  }

  getDiag() { return { ...this._diag }; }

  async _negotiate(opts = {}) {
    try {
      const offer = await this.pc.createOffer(opts.iceRestart ? { iceRestart: true } : undefined);
      await this.pc.setLocalDescription(offer);
      this.onSignal({ to: this.peerId, kind: "offer", data: { type: offer.type, sdp: offer.sdp } });
    } catch (e) {
      console.warn("[p2p] negotiate failed", e);
      this._handleClose("negotiate-failed");
    }
  }

  _wireDC(dc) {
    this.dc = dc;
    dc.onopen = () => {
      if (this._closed) return;
      this.state = "open";
      this.onOpen();
    };
    dc.onmessage = (ev) => {
      if (this._closed) return;
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      this.onMessage(m);
    };
    dc.onclose = () => this._handleClose("dc-close");
    dc.onerror = () => { /* surfaced via onclose */ };
  }

  async handleSignal(msg) {
    try {
      if (msg.kind === "offer") {
        await this.pc.setRemoteDescription(new RTCSessionDescription(msg.data));
        await this._flushIce();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.onSignal({ to: this.peerId, kind: "answer", data: { type: answer.type, sdp: answer.sdp } });
      } else if (msg.kind === "answer") {
        await this.pc.setRemoteDescription(new RTCSessionDescription(msg.data));
        await this._flushIce();
      } else if (msg.kind === "ice") {
        // ICE may arrive before SDP if the network is fast or signal order is
        // unstable. Queue until the remote description is set.
        if (!this.pc.remoteDescription || !this.pc.remoteDescription.type) {
          this._pendingIce.push(msg.data);
        } else {
          this._countCandidate("remote", msg.data);
          try { await this.pc.addIceCandidate(msg.data); } catch {}
        }
      }
    } catch (e) {
      console.warn("[p2p] handleSignal", msg?.kind, e);
    }
  }

  async _flushIce() {
    const pending = this._pendingIce.splice(0);
    for (const c of pending) {
      this._countCandidate("remote", c);
      try { await this.pc.addIceCandidate(c); } catch {}
    }
  }

  send(obj) {
    if (this._closed || !this.dc || this.dc.readyState !== "open") return false;
    try { this.dc.send(JSON.stringify(obj)); return true; }
    catch { return false; }
  }

  isOpen() { return !this._closed && this.dc && this.dc.readyState === "open"; }

  close() { this._handleClose("manual"); }

  _handleClose(reason) {
    if (this._closed) return;
    this._closed = true;
    this.state = "closed";
    try { if (this.dc) this.dc.close(); } catch {}
    try { this.pc.close(); } catch {}
    this.dc = null;
    this.onClose(reason);
  }
}
