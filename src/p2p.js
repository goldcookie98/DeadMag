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

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const CHANNEL_LABEL = "game";

export class PeerLink {
  constructor({ peerId, isOfferer, onSignal, onOpen, onMessage, onClose }) {
    this.peerId = peerId;
    this.isOfferer = !!isOfferer;
    this.onSignal = onSignal || (() => {});
    this.onOpen = onOpen || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onClose = onClose || (() => {});
    this.state = "connecting";
    this.dc = null;
    this._closed = false;
    this._pendingIce = [];

    this.pc = new RTCPeerConnection(ICE_CONFIG);
    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      this.onSignal({ to: this.peerId, kind: "ice", data: ev.candidate.toJSON() });
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === "failed" || s === "closed" || s === "disconnected") this._handleClose("pc-" + s);
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

  async _negotiate() {
    try {
      const offer = await this.pc.createOffer();
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
