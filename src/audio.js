// Tiny synth — no audio assets, everything generated on demand via WebAudio.
// Sounds are short and cheap; we don't pool/voice-limit since the game is
// turn-of-a-second SFX, not music.

let ctx = null;
let master = null;
const _buffers = new Map(); // url → AudioBuffer (loaded) or Promise

function getCtx() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  return ctx;
}

function loadBuffer(url) {
  const c = getCtx(); if (!c) return Promise.resolve(null);
  const cached = _buffers.get(url);
  if (cached) return Promise.resolve(cached);
  const p = fetch(url)
    .then((r) => r.arrayBuffer())
    .then((ab) => new Promise((res, rej) => c.decodeAudioData(ab, res, rej)))
    .then((buf) => { _buffers.set(url, buf); return buf; })
    .catch((e) => { console.warn("[audio] failed to load", url, e); return null; });
  _buffers.set(url, p);
  return p;
}

function playBuffer(url, gainMul = 1, opts = {}) {
  const c = getCtx(); if (!c) return;
  const cached = _buffers.get(url);
  // Synchronous fast-path: we already have the decoded buffer.
  if (cached && cached.numberOfChannels) {
    const src = c.createBufferSource();
    src.buffer = cached;
    if (opts.detune) src.detune.value = opts.detune;
    const g = c.createGain();
    g.gain.value = (opts.peak ?? 0.7) * gainMul;
    src.connect(g); g.connect(master);
    src.start();
    return;
  }
  // First call (or still loading): kick off the fetch but skip this hit so
  // we don't queue a backlog of identical sounds while the user is firing.
  loadBuffer(url);
}

export function primeAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume();
  // Preload sample assets so the first shot doesn't drop while we fetch.
  loadBuffer("./assets/sfx/gunshot.mp3");
}

const GUNSHOT_URL = "./assets/sfx/gunshot.mp3";

export function setMasterVolume(v) {
  getCtx();
  if (master) master.gain.value = Math.max(0, Math.min(1, v));
}

function env(node, c, attack, hold, decay, peak) {
  const t = c.currentTime;
  const g = node.gain;
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + attack);
  g.setValueAtTime(peak, t + attack + hold);
  g.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
}

function tone(freq, type, dur, peak = 0.5, gainMul = 1) {
  const c = getCtx(); if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g); g.connect(master);
  env(g, c, 0.004, 0.005, dur, peak * gainMul);
  o.start();
  o.stop(c.currentTime + dur + 0.05);
}

function noiseBurst(dur, filterFreq, q, peak = 0.5, gainMul = 1) {
  const c = getCtx(); if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = q;
  const g = c.createGain();
  src.connect(filter); filter.connect(g); g.connect(master);
  env(g, c, 0.004, 0.005, dur, peak * gainMul);
  src.start();
  src.stop(c.currentTime + dur + 0.05);
}

export function playShoot(weaponId, gainMul = 1) {
  switch (weaponId) {
    case "pistol":   playBuffer(GUNSHOT_URL, gainMul, { detune: 0,    peak: 0.55 }); break;
    case "shotgun":  playBuffer(GUNSHOT_URL, gainMul, { detune: -400, peak: 0.95 }); break;
    case "smg":      playBuffer(GUNSHOT_URL, gainMul, { detune: 250,  peak: 0.45 }); break;
    case "sniper":   playBuffer(GUNSHOT_URL, gainMul, { detune: -600, peak: 0.95 }); break;
    case "rocket":   playRocketLaunch(gainMul); break;
    case "voltspike": /* sound on voltspike-chain event */ break;
    case "ripple":   /* charge weapon — sound on sonic-ring event */ break;
    case "knife":    tone(220, "triangle", 0.08, 0.3, gainMul); break;
    default:         playBuffer(GUNSHOT_URL, gainMul, { detune: 0, peak: 0.55 });
  }
}

export function playRocketLaunch(gainMul = 1) {
  const c = getCtx(); if (!c) return;
  const dur = 0.42;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass"; f.Q.value = 1.6;
  f.frequency.setValueAtTime(200, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(2200, c.currentTime + dur * 0.85);
  const g = c.createGain();
  src.connect(f); f.connect(g); g.connect(master);
  env(g, c, 0.01, 0.04, dur, 0.7 * gainMul);
  src.start();
  src.stop(c.currentTime + dur + 0.05);
}

export function playExplosion(gainMul = 1) {
  const c = getCtx(); if (!c) return;
  // Deep sub boom — pitch drop.
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(110, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(34, c.currentTime + 0.5);
  o.connect(og); og.connect(master);
  env(og, c, 0.005, 0.05, 0.55, 0.95 * gainMul);
  o.start();
  o.stop(c.currentTime + 0.7);
  // Mid-band crackle.
  noiseBurst(0.45, 750, 0.5, 0.75, gainMul);
  // High snap on the attack.
  noiseBurst(0.06, 5000, 1.2, 0.4, gainMul);
}

export function playSonic(gainMul = 1) {
  const c = getCtx(); if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(180, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(1400, c.currentTime + 0.28);
  o.connect(g); g.connect(master);
  env(g, c, 0.005, 0.05, 0.3, 0.7 * gainMul);
  o.start();
  o.stop(c.currentTime + 0.4);
  noiseBurst(0.18, 2200, 1, 0.35, gainMul);
}

export function playVoltspike(gainMul = 1) {
  const c = getCtx(); if (!c) return;
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(1500, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(400, c.currentTime + 0.2);
  o.connect(og); og.connect(master);
  env(og, c, 0.005, 0.02, 0.2, 0.5 * gainMul);
  o.start();
  o.stop(c.currentTime + 0.3);
  noiseBurst(0.14, 3500, 4, 0.4 * gainMul);
}

export function playVoltFuseBoom(gainMul = 1) {
  playExplosion(gainMul);
  // Bright electric overlay.
  const c = getCtx(); if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "square"; o.frequency.value = 260;
  o.connect(g); g.connect(master);
  env(g, c, 0.005, 0.02, 0.28, 0.4 * gainMul);
  o.start();
  o.stop(c.currentTime + 0.4);
}

export function playZombieDie(kind, gainMul = 1) {
  const c = getCtx(); if (!c) return;
  const base = kind === "brute" ? 60 : kind === "sprinter" ? 140 : kind === "volt-fuse" ? 100 : 110;
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(base * 2, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(base * 0.7, c.currentTime + 0.3);
  o.connect(og); og.connect(master);
  env(og, c, 0.01, 0.05, 0.35, 0.55 * gainMul);
  o.start();
  o.stop(c.currentTime + 0.45);
  noiseBurst(0.16, 240, 0.4, 0.35 * gainMul);
}
