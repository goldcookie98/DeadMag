import { Input } from "./input.js";
import { Camera } from "./camera.js";
import { createSim, addPlayer, setInput, step, shopBuy, switchWeapon, setReady } from "./sim.js";
import { render, recordMuzzleFlash, recordHit } from "./render.js";
import { UI } from "./ui.js";
import { Mp, getSavedServerUrl, setServerUrl } from "./mp.js";
import { WEAPONS, ARSENAL_ORDER } from "./weapons.js";
import { WALLS, MAP_W, MAP_H } from "./map.js";
import { mountVersion } from "./version-display.js";
import { mountCheats, applyCheat } from "./cheats.js";

const COLORS = ["#FF1F6E", "#2EFFE5", "#B6FF2E", "#FFE03E", "#5eff5e", "#ff8c2e", "#2eaaff", "#ff5edc"];

// MP tuning. The server ticks at 30Hz (33ms), so spamming inputs every browser
// frame (60-144Hz) just wastes uplink; cap to the server's tick rate. The local
// player is rendered via dead-reckoning from the current input so movement
// doesn't have to wait for a full server round-trip — server snapshots softly
// reel us back toward the authoritative position.
const INPUT_SEND_INTERVAL_MS = 33;
const PREDICT_BASE_SPEED = 220;
const PREDICT_PLAYER_R = 14;
// Reconciliation uses a fixed correction *speed* (px/frame) rather than a
// rate proportional to drift. Rate-based pull yanks proportionally to drift:
// release the keys after holding a direction for a second and you get a
// 7px jump on the next frame — which feels jerky even though it's "smooth"
// math. Velocity-clamped correction trickles at a constant speed regardless
// of how far we are, so the user just sees the camera glide back into sync.
// On the driven axis the speed is 0 (don't fight the player). On idle axes
// it converges in ~250ms. On large drift (knockback) it converges fast.
const PREDICT_RECONCILE_DRIVE_PX = 0.0;
const PREDICT_RECONCILE_IDLE_PX  = 1.4;
const PREDICT_RECONCILE_BIG_PX   = 4.0;
const PREDICT_BIG_DRIFT_PX       = 160;
const PREDICT_DEADZONE_PX        = 3;
const PREDICT_HARD_SNAP_PX       = 320;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const input = new Input(canvas);
const camera = new Camera();
const ui = new UI();

let state = "menu";
let mode = "horde";
let sim = null;
let localId = null;
let mp = null;
let roomCode = null;
let isHost = false;
let lobby = { players: [], mode: "horde" };
let myName = "P_" + Math.floor(Math.random() * 899 + 100);

// Snapshot interpolation. The timeline is the server's authoritative timeMs
// (not the client's wall clock) — that way TCP bursts and dyno hiccups don't
// freeze the lerp and cause remote players to teleport. renderClock chases
// (latest server timeMs − RENDER_DELAY_MS) and advances by dt each frame.
const RENDER_DELAY_MS = 150;
const EXTRAPOLATE_MAX_MS = 120;
const STATE_BUFFER_MAX_MS = 800;
const RENDER_CLOCK_SNAP_MS = 400;   // if we're this far off, snap instead of drift
const RENDER_CLOCK_CHASE = 0.08;    // per-frame drift correction toward target
let stateBuffer = [];
let renderClock = 0;
let renderClockReady = false;
let predictMe = null;          // { x, y, angle } — local player's predicted pose
let _lastInputSendAt = 0;
let _lastSentShoot = false;
let _lastSentReload = false;
let _lastLocalFireAt = 0;      // gates client-side muzzle flash + ghost bullets to weapon rate

// Client-side predicted bullets. Spawned at our predicted muzzle on every
// local fire-cycle. Cosmetic only — server is authoritative for actual hits.
// Ghosts live until they hit a wall, leave the map, or reach the weapon's
// range, mirroring server bullet life. The server's copy of *our own*
// bullets is filtered from the rendered snapshot so we only ever see one.
let ghostBullets = [];

const CONNECTING_TIMEOUT_MS = 30_000;
let _connectingDeadline = null;
let _connectingStatusInterval = null;
let _connectingStartedAt = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.setViewport(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", resize);
resize();
mountVersion();
mountCheats({
  isSolo: () => !mp && !!sim,
  run: (code) => applyCheat(code, { sim, localId }),
});
ui.showOnly("menu");
ui.setNetStatus("");

ui.on("action", onMenuAction);
ui.on("setMode", (m) => {
  if (mp && !mp.isHost) return;
  lobby.mode = m;
  if (mp?.isHost) mp.setMode(m);
  renderLobby();
});
ui.on("startGame", () => {
  if (mp?.isHost) hostStartGame();
});
ui.on("leave", leaveToMenu);
ui.on("joinSubmit", joinSubmit);
ui.on("shopReady", () => {
  if (!sim || !sim.shopOpen) return;
  const me = sim.players.get(localId);
  if (!me || me.state !== "alive") return;
  const next = !me.ready;
  if (mp) mp.sendReady(next);
  else setReady(sim, localId, next);
});
ui.on("buy", (id) => {
  if (mp) mp.sendBuy(id);
  else if (sim) shopBuy(sim, localId, id);
});
ui.on("equip", (wid) => {
  if (mp) mp.sendEquip(wid);
  else if (sim) switchWeapon(sim, localId, wid);
});

function onMenuAction(action) {
  if (action === "solo-horde") startSolo("horde");
  else if (action === "solo-arsenal") startSolo("arsenal");
  else if (action === "mp-create") createLobby();
  else if (action === "mp-join") openJoin();
  else if (action === "set-server") promptServerUrl();
}

function refreshServerLabel() {
  const el = document.getElementById("set-server-current");
  if (!el) return;
  const u = getSavedServerUrl();
  el.textContent = u || "not set";
}

function promptServerUrl() {
  const current = getSavedServerUrl() || "";
  const next = window.prompt(
    "Paste your DeadMag server URL (e.g. wss://deadmag-server-eu.onrender.com).\nLeave blank to clear.",
    current
  );
  if (next === null) return;
  setServerUrl(next.trim() || null);
  refreshServerLabel();
}

refreshServerLabel();

function startSolo(m) {
  mode = m;
  sim = createSim(m);
  const me = addPlayer(sim, "YOU", COLORS[0], false);
  localId = me.id;
  if (m === "arsenal") {
    for (let i = 0; i < 3; i++) addPlayer(sim, `BOT_${i + 1}`, COLORS[i + 1], true);
  }
  state = "playing";
  ui.showOnly();
}

async function createLobby() {
  ui.showOnly("lobby");
  ui.setNetStatus("CONNECTING…");
  ui.setLobby({ code: "----", title: "LOBBY · HOST", players: [{ name: myName, host: true }], mode: "horde", canStart: false });
  try {
    mp = new Mp();
    setupMpHandlers();
    startConnectTimer();
    const code = await mp.create(myName);
    stopConnectTimer();
    roomCode = code;
    isHost = true;
    localId = mp.localPlayerId;
    state = "lobby";
    lobby = { players: mp.roster(), mode: mp.lobbyMode, hostId: mp.hostPlayerId };
    renderLobby();
    ui.setNetStatus("ONLINE");
  } catch (e) {
    stopConnectTimer();
    alert("Couldn't open room: " + (e?.message ?? e));
    leaveToMenu();
  }
}

let _connectTimer = null;
function startConnectTimer() {
  const start = performance.now();
  stopConnectTimer();
  _connectTimer = setInterval(() => {
    const s = Math.floor((performance.now() - start) / 1000);
    ui.setNetStatus(`CONNECTING TO SERVER… ${s}s ${s > 8 ? "(free hosts cold-start)" : ""}`);
  }, 250);
}
function stopConnectTimer() { if (_connectTimer) { clearInterval(_connectTimer); _connectTimer = null; } }

function openJoin() {
  ui.showOnly("join");
  setTimeout(() => document.getElementById("join-code")?.focus(), 50);
}

async function joinSubmit(code) {
  code = (code || "").toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) { alert("Code must be 4 chars."); return; }
  ui.showOnly("lobby");
  ui.setNetStatus("CONNECTING…");
  ui.setLobby({ code, title: "LOBBY · SEARCHING", players: [], mode: "horde", canStart: false });
  try {
    mp = new Mp();
    setupMpHandlers();
    startConnectTimer();
    await mp.join(code, myName);
    stopConnectTimer();
    roomCode = code;
    isHost = false;
    localId = mp.localPlayerId;
    state = "lobby";
    lobby = { players: mp.roster(), mode: mp.lobbyMode, hostId: mp.hostPlayerId };
    renderLobby();
    ui.setNetStatus("ONLINE");
  } catch (e) {
    stopConnectTimer();
    const msg = (e?.message === "ROOM NOT FOUND")
      ? `No room with code ${code}. Check the code (host must have the lobby open).`
      : "Couldn't join: " + (e?.message ?? e);
    alert(msg);
    leaveToMenu();
  }
}

function setupMpHandlers() {
  mp.on("peers", () => {
    isHost = mp.isHost;
    localId = mp.localPlayerId;
    if (mp.code) roomCode = mp.code;
    lobby = { players: mp.roster(), mode: mp.lobbyMode, hostId: mp.hostPlayerId };
    renderLobby();
  });
  mp.on("modeChanged", () => {
    lobby.mode = mp.lobbyMode;
    renderLobby();
  });
  mp.on("start", (data) => {
    mode = data.mode;
    localId = mp.localPlayerId;
    state = "playing";
    sim = null;
    stateBuffer = [];
    renderClockReady = false;
    predictMe = null;
    _lastSentShoot = false;
    _lastSentReload = false;
    _lastLocalFireAt = 0;
    ghostBullets = [];
    // Hold the connecting overlay up until the first state snapshot
    // lands, so the player doesn't see an empty map.
    startConnectingWatch();
    ui.showOnly("connecting");
  });
  mp.on("state", (data) => {
    if (typeof window !== "undefined") window.__lastState = data;
    const inflated = inflateState(data);
    const serverMs = data.timeMs ?? 0;
    stateBuffer.push({ serverMs, state: inflated });
    while (stateBuffer.length > 2 && serverMs - stateBuffer[0].serverMs > STATE_BUFFER_MAX_MS) {
      stateBuffer.shift();
    }
    sim = inflated;
    if (sim.events?.length) processEvents(sim);
    if (state === "playing" && _connectingDeadline) {
      endConnectingWatch();
      ui.setNetStatus("ONLINE");
      ui.showOnly();
    }
  });
  mp.on("disconnected", (reason) => {
    ui.setNetStatus("DISCONNECTED");
    const wasInGame = state === "playing" || state === "lobby";
    if (!wasInGame) return;
    endConnectingWatch();
    alert("Disconnected from server" + (reason ? ` — ${reason}` : "") + ".");
    leaveToMenu();
  });
  mp.on("serverError", (msg) => {
    ui.setNetStatus("SERVER ERROR");
    console.warn("[mp] server error:", msg);
  });
}

function hostStartGame() {
  if (!mp?.isHost) return;
  mp.startGame(lobby.mode || "horde");
}

function inflateState(s) {
  return {
    ...s,
    players: new Map(s.players.map((p) => [p.id, { ...p, arsenalKills: new Set(p.arsenalKills || []) }])),
    inputs: new Map(),
  };
}

function advanceRenderClock(dtMs) {
  if (!stateBuffer.length) return;
  const latest = stateBuffer[stateBuffer.length - 1].serverMs;
  const target = latest - RENDER_DELAY_MS;
  if (!renderClockReady || Math.abs(renderClock - target) > RENDER_CLOCK_SNAP_MS) {
    renderClock = target;
    renderClockReady = true;
    return;
  }
  renderClock += dtMs;
  // Gentle pull toward target so we don't drift forever if frame timer skews.
  renderClock += (target - renderClock) * RENDER_CLOCK_CHASE;
}

function buildRenderSim() {
  if (!stateBuffer.length) return sim;
  if (stateBuffer.length === 1) return stateBuffer[0].state;
  let prevIdx = -1;
  for (let i = stateBuffer.length - 1; i >= 0; i--) {
    if (stateBuffer[i].serverMs <= renderClock) { prevIdx = i; break; }
  }
  if (prevIdx < 0) return stateBuffer[0].state;
  if (prevIdx >= stateBuffer.length - 1) {
    // renderClock outran the newest snapshot — extrapolate briefly.
    const last = stateBuffer[stateBuffer.length - 1];
    const prev = stateBuffer[stateBuffer.length - 2];
    const span = Math.max(1, last.serverMs - prev.serverMs);
    const over = Math.min(EXTRAPOLATE_MAX_MS, renderClock - last.serverMs);
    const t = 1 + over / span;
    return interpolateStates(prev.state, last.state, t);
  }
  const a = stateBuffer[prevIdx], b = stateBuffer[prevIdx + 1];
  const span = Math.max(1, b.serverMs - a.serverMs);
  const t = Math.max(0, Math.min(1, (renderClock - a.serverMs) / span));
  return interpolateStates(a.state, b.state, t);
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function interpolateStates(a, b, t) {
  const lerpedPlayers = new Map();
  for (const [id, pb] of b.players) {
    const pa = a.players.get(id);
    if (pa) {
      lerpedPlayers.set(id, {
        ...pb,
        x: pa.x + (pb.x - pa.x) * t,
        y: pa.y + (pb.y - pa.y) * t,
        angle: lerpAngle(pa.angle, pb.angle, t),
      });
    } else {
      lerpedPlayers.set(id, pb);
    }
  }
  const aZom = new Map(a.zombies.map((z) => [z.id, z]));
  const zombies = b.zombies.map((z) => {
    const za = aZom.get(z.id);
    return za ? { ...z, x: za.x + (z.x - za.x) * t, y: za.y + (z.y - za.y) * t } : z;
  });
  const aBul = new Map(a.bullets.map((bu) => [bu.id, bu]));
  const bullets = b.bullets.map((bu) => {
    const ba = aBul.get(bu.id);
    return ba ? { ...bu, x: ba.x + (bu.x - ba.x) * t, y: ba.y + (bu.y - ba.y) * t } : bu;
  });
  return { ...b, players: lerpedPlayers, zombies, bullets };
}

function renderLobby() {
  ui.setLobby({
    code: roomCode || "----",
    title: isHost ? "LOBBY · HOST" : "LOBBY",
    players: (lobby.players || []).map((p) => ({ name: p.name, host: p.host || p.id === lobby.hostId })),
    mode: lobby.mode,
    canStart: isHost && (lobby.players?.length ?? 0) >= 1,
  });
}

function leaveToMenu() {
  endConnectingWatch();
  if (mp) mp.leave();
  mp = null; sim = null; roomCode = null;
  predictMe = null;
  stateBuffer = [];
  renderClockReady = false;
  ghostBullets = [];
  state = "menu";
  ui.showOnly("menu");
  ui.setNetStatus("");
}

function startConnectingWatch() {
  endConnectingWatch();
  _connectingStartedAt = performance.now();
  ui.setConnectingStatus("WAITING FOR FIRST SNAPSHOT", "Server is spinning up the sim.");
  refreshConnectingStatus();
  _connectingStatusInterval = setInterval(refreshConnectingStatus, 500);
  _connectingDeadline = setTimeout(() => {
    _connectingDeadline = null;
    endConnectingWatch();
    alert("Server didn't send game state in time. Try again.");
    leaveToMenu();
  }, CONNECTING_TIMEOUT_MS);
}

function refreshConnectingStatus() {
  if (!_connectingDeadline) return;
  const elapsed = Math.floor((performance.now() - _connectingStartedAt) / 1000);
  ui.setConnectingStatus(`WAITING FOR FIRST SNAPSHOT · ${elapsed}s`, "Server is spinning up the sim.");
}

function endConnectingWatch() {
  if (_connectingStatusInterval) { clearInterval(_connectingStatusInterval); _connectingStatusInterval = null; }
  if (_connectingDeadline) { clearTimeout(_connectingDeadline); _connectingDeadline = null; }
}

// Mirrors sim.js's circle-vs-AABB wall collision so prediction respects walls
// instead of letting the player visibly clip until reconciliation snaps them out.
function predictCollideWalls(x, y, r) {
  for (const w of WALLS) {
    const nx = Math.max(w.x, Math.min(x, w.x + w.w));
    const ny = Math.max(w.y, Math.min(y, w.y + w.h));
    const dx = x - nx, dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.01;
      return { nx: dx / d, ny: dy / d, depth: r - d };
    }
  }
  return null;
}

function advancePredict(dt, snap, me) {
  if (!predictMe) {
    predictMe = { x: me.x, y: me.y, angle: me.angle };
    return;
  }
  let speed = PREDICT_BASE_SPEED + (me.upgrades?.speed ?? 0) * 35;
  if (me.weapon === "knife") speed *= 1.5;
  let nx = predictMe.x + snap.mx * speed * dt;
  let ny = predictMe.y;
  let h = predictCollideWalls(nx, ny, PREDICT_PLAYER_R);
  if (h) nx += h.nx * h.depth;
  ny += snap.my * speed * dt;
  h = predictCollideWalls(nx, ny, PREDICT_PLAYER_R);
  if (h) { nx += h.nx * h.depth; ny += h.ny * h.depth; }
  predictMe.x = Math.max(PREDICT_PLAYER_R, Math.min(MAP_W - PREDICT_PLAYER_R, nx));
  predictMe.y = Math.max(PREDICT_PLAYER_R, Math.min(MAP_H - PREDICT_PLAYER_R, ny));
  predictMe.angle = Math.atan2(snap.aimY - predictMe.y, snap.aimX - predictMe.x);
}

// Fire a client-side muzzle flash + predicted bullets if our local cooldown
// is ready. Called every frame `snap.shoot` is true so autofire feels
// continuous instead of only flashing on the click-edge. Returns true if
// we fired this frame (used by the caller to update bookkeeping).
function tryLocalFire(snap, meAuth, nowSend) {
  if (!predictMe || meAuth.state !== "alive") return false;
  const w = WEAPONS[meAuth.weapon];
  if (!w || w.kind === "melee") return false;
  const cooldownMs = w.rate ?? 100;
  const ready = nowSend - _lastLocalFireAt >= cooldownMs * 0.9
    && meAuth.ammo > 0
    && (sim.timeMs ?? 0) >= (meAuth.reloadingUntil ?? 0);
  if (!ready) return false;
  const baseAng = Math.atan2(snap.aimY - predictMe.y, snap.aimX - predictMe.x);
  recordMuzzleFlash(predictMe.x, predictMe.y, baseAng, meAuth.weapon, nowSend);
  const pellets = w.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    const angle = baseAng + (Math.random() - 0.5) * w.spread * 2;
    ghostBullets.push({
      x: predictMe.x + Math.cos(angle) * 18,
      y: predictMe.y + Math.sin(angle) * 18,
      vx: Math.cos(angle) * w.proj,
      vy: Math.sin(angle) * w.proj,
      weapon: meAuth.weapon,
      range: w.range,
      traveled: 0,
    });
  }
  _lastLocalFireAt = nowSend;
  return true;
}

const GHOST_ZOMBIE_R = 13;
const GHOST_PLAYER_R = 14;
const GHOST_BULLET_R = 3;

function ghostBulletHit(nx, ny, snapSim) {
  if (!snapSim) return null;
  for (const z of snapSim.zombies) {
    const dx = z.x - nx, dy = z.y - ny;
    if (dx * dx + dy * dy <= (GHOST_ZOMBIE_R + GHOST_BULLET_R) ** 2) {
      return { x: nx, y: ny };
    }
  }
  for (const [, p] of snapSim.players) {
    if (p.id === localId) continue;
    if (p.state !== "alive") continue;
    const dx = p.x - nx, dy = p.y - ny;
    if (dx * dx + dy * dy <= (GHOST_PLAYER_R + GHOST_BULLET_R) ** 2) {
      return { x: nx, y: ny };
    }
  }
  return null;
}

function advanceGhostBullets(dt, snapSim) {
  if (ghostBullets.length === 0) return;
  const next = [];
  for (const b of ghostBullets) {
    const stepX = b.vx * dt;
    const stepY = b.vy * dt;
    const nx = b.x + stepX;
    const ny = b.y + stepY;
    if (nx < 0 || nx > MAP_W || ny < 0 || ny > MAP_H) continue;
    if (predictCollideWalls(nx, ny, 3)) continue;
    const hit = ghostBulletHit(nx, ny, snapSim);
    if (hit) { recordHit(hit.x, hit.y); continue; }
    b.traveled += Math.hypot(stepX, stepY);
    if (b.range && b.traveled >= b.range) continue;
    b.x = nx; b.y = ny;
    next.push(b);
  }
  ghostBullets = next;
}

// Per-frame reconciliation that doesn't fight the player's input. While an
// axis is being driven, we don't pull at all (the server is intrinsically
// RTT/2 behind us; pulling backwards = visible yank). Off-axis or idle, we
// converge at a fixed px/frame so the correction is invisible regardless of
// how much drift accumulated. Big-drift override kicks in for knockback.
function reconcilePerFrame(snap, serverMe) {
  if (!serverMe) return;
  if (serverMe.state !== "alive") {
    predictMe = { x: serverMe.x, y: serverMe.y, angle: serverMe.angle };
    return;
  }
  if (!predictMe) {
    predictMe = { x: serverMe.x, y: serverMe.y, angle: serverMe.angle };
    return;
  }
  const dx = serverMe.x - predictMe.x;
  const dy = serverMe.y - predictMe.y;
  const d2 = dx * dx + dy * dy;
  if (d2 > PREDICT_HARD_SNAP_PX * PREDICT_HARD_SNAP_PX) {
    predictMe.x = serverMe.x;
    predictMe.y = serverMe.y;
    return;
  }
  if (d2 < PREDICT_DEADZONE_PX * PREDICT_DEADZONE_PX) return;
  const drivingX = (snap?.mx ?? 0) !== 0;
  const drivingY = (snap?.my ?? 0) !== 0;
  const big = d2 > PREDICT_BIG_DRIFT_PX * PREDICT_BIG_DRIFT_PX;
  const stepX = big ? PREDICT_RECONCILE_BIG_PX : (drivingX ? PREDICT_RECONCILE_DRIVE_PX : PREDICT_RECONCILE_IDLE_PX);
  const stepY = big ? PREDICT_RECONCILE_BIG_PX : (drivingY ? PREDICT_RECONCILE_DRIVE_PX : PREDICT_RECONCILE_IDLE_PX);
  if (stepX > 0 && dx !== 0) predictMe.x += Math.sign(dx) * Math.min(Math.abs(dx), stepX);
  if (stepY > 0 && dy !== 0) predictMe.y += Math.sign(dy) * Math.min(Math.abs(dy), stepY);
}

let last = performance.now();
function frame(now) {
  const dtMs = Math.min(33, now - last);
  const dt = dtMs / 1000;
  last = now;

  if (state === "playing" && sim) {
    const snap = input.snapshot(camera);
    const online = !!mp;
    if (online) advanceRenderClock(dtMs);
    if (!online) {
      // Solo: run the sim locally.
      if (sim.players.get(localId)) setInput(sim, localId, snap);
      step(sim, dt);
      processEvents(sim);
    } else {
      const nowSend = performance.now();
      // Bypass throttle on action-edges (click, reload tap) so the server
      // sees the press before the next interval window.
      const shootEdge  = snap.shoot  && !_lastSentShoot;
      const reloadEdge = snap.reload && !_lastSentReload;
      const edge = shootEdge || reloadEdge;
      if (edge || nowSend - _lastInputSendAt >= INPUT_SEND_INTERVAL_MS) {
        mp.sendInput(snap);
        _lastInputSendAt = nowSend;
        _lastSentShoot = snap.shoot;
        _lastSentReload = snap.reload;
      }
      const meAuth = sim.players.get(localId);
      if (meAuth) {
        reconcilePerFrame(snap, meAuth);
        if (meAuth.state === "alive") advancePredict(dt, snap, meAuth);
        if (snap.shoot) tryLocalFire(snap, meAuth, nowSend);
      }
    }

    // Solo renders from the live sim. Online renders from the interpolated
    // state buffer with the local player overridden by the predicted pose.
    let renderSim = online ? buildRenderSim() : sim;
    if (online && predictMe) {
      const me = renderSim.players.get(localId);
      if (me) {
        const players = new Map(renderSim.players);
        players.set(localId, { ...me, x: predictMe.x, y: predictMe.y, angle: predictMe.angle });
        renderSim = { ...renderSim, players };
      }
    }
    if (online) {
      // Advance ghosts AFTER building renderSim so hit checks run against the
      // visible (interpolated) world — hit feedback matches what the user sees.
      advanceGhostBullets(dt, renderSim);
      // Hide the server's copy of our own bullets — the local ghost is doing
      // the visual. The server still applies damage authoritatively.
      const filtered = renderSim.bullets.filter((b) => b.ownerId !== localId);
      renderSim = { ...renderSim, bullets: ghostBullets.length ? [...filtered, ...ghostBullets] : filtered };
    }
    const meRender = renderSim.players.get(localId);
    if (meRender) camera.follow(meRender.x, meRender.y);

    render(ctx, renderSim, camera, localId, input.mouse);

    if (sim.shopOpen) {
      if (ui.el.shop.classList.contains("hidden")) { ui.resetShopCache(); ui.showOnly("shop"); }
      const me = sim.players.get(localId);
      if (me) ui.renderShop(me, sim.shopOpenUntil - sim.timeMs, sim);
    } else if (!ui.el.shop.classList.contains("hidden")) {
      ui.showOnly();
    }

    if (sim.gameOver && state === "playing") {
      state = "ended";
      const me = sim.players.get(localId);
      let title, stats, statTiles, win = false;
      const aliveMs = sim.timeMs ?? 0;
      const aliveStr = fmtTime(aliveMs);
      if (sim.mode === "horde") {
        title = "DEAD";
        stats = [`SQUAD WIPED`, `WAVE ${pad2(sim.wave)}`, `${aliveStr} ALIVE`];
        statTiles = [
          { label: "WAVES",   value: pad2(sim.wave),                color: "magenta" },
          { label: "KILLS",   value: String(me?.score ?? 0),        color: "acid", hi: true },
          { label: "CASH",    value: `$${(me?.cash ?? 0).toLocaleString()}`, color: "yellow" },
          { label: "TIME",    value: aliveStr,                       color: "dim" },
        ];
      } else {
        win = sim.winnerId === localId;
        title = win ? "WINNER" : "ELIMINATED";
        const w = sim.players.get(sim.winnerId);
        stats = [`WINNER: ${w?.name ?? "—"}`, `${aliveStr} ALIVE`];
        statTiles = [
          { label: "KILLS", value: String(me?.score ?? 0), color: "acid", hi: true },
          { label: "WEAPONS CYCLED", value: String(me?.arsenalKills?.size ?? 0), color: "cyan" },
          { label: "TIME", value: aliveStr, color: "dim" },
        ];
      }
      const weaponKills = ARSENAL_ORDER.map((id) => ({ id, count: me?.killsByWeapon?.[id] ?? 0 }));
      ui.showGameOver({ title, win, stats, statTiles, weaponKills });
      ui.showOnly("gameover");
    }

    updateHUD();

    if (input.consumeEscape()) leaveToMenu();
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function processEvents(sim) {
  for (const e of sim.events) {
    if (e.type === "kill") {
      const k = sim.players.get(e.killerId);
      const v = e.victimId === -1 ? "ZOMBIE" : sim.players.get(e.victimId)?.name;
      const kc = k?.color || "var(--magenta)";
      const wn = WEAPONS[e.weapon]?.name ?? "?";
      ui.pushKillFeed(`<span class="pname" style="color:${kc}">${escapeHtml(k?.name ?? "—")}</span> ▸ <span class="wchip">${escapeHtml(wn)}</span> ${escapeHtml(v ?? "—")}`);
    } else if (e.type === "down") {
      const p = sim.players.get(e.id);
      ui.pushKillFeed(`⚠ <span class="pname" style="color:${p?.color || "var(--magenta)"}">${escapeHtml(p?.name ?? "—")}</span> DOWNED · HOLD F`, { warn: true });
    } else if (e.type === "death") {
      const p = sim.players.get(e.id);
      ui.pushKillFeed(`☠ <span class="pname" style="color:${p?.color || "var(--magenta)"}">${escapeHtml(p?.name ?? "—")}</span> BLED OUT`, { warn: true });
    } else if (e.type === "revive") {
      const p = sim.players.get(e.id);
      ui.pushKillFeed(`✚ <span class="pname" style="color:${p?.color || "var(--acid)"}">${escapeHtml(p?.name ?? "—")}</span> REVIVED`);
    } else if (e.type === "buy") {
      const p = sim.players.get(e.playerId);
      ui.pushKillFeed(`<span class="pname" style="color:${p?.color || "var(--cyan)"}">${escapeHtml(p?.name ?? "—")}</span> bought ${escapeHtml(e.itemName)} · -$${e.cost}`);
      ui.flashShopBuy?.(p?.name ?? "—", e.itemName);
    } else if (e.type === "wave-start") {
      ui.pushKillFeed(`<span class="wchip">WAVE ${e.wave}</span> INCOMING`);
    } else if (e.type === "wave-end") {
      ui.pushKillFeed(`<span class="wchip">WAVE ${e.wave}</span> CLEARED · SHOP OPEN`);
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function updateHUD() {
  if (!sim) return;
  const me = sim.players.get(localId);
  if (!me) return;
  const w = WEAPONS[me.weapon];
  const arsenalProgress = sim.mode === "arsenal" ? { done: me.arsenalKills.size, total: ARSENAL_ORDER.length } : null;
  const reloading = sim.timeMs < me.reloadingUntil;
  const reloadProgress = reloading && me.reloadDuration > 0
    ? 1 - (me.reloadingUntil - sim.timeMs) / me.reloadDuration
    : 0;
  const squad = [];
  for (const [, o] of sim.players) {
    if (o.id === localId) continue;
    squad.push({ id: o.id, name: o.name, color: o.color, state: o.state, hp: o.hp, maxHp: o.maxHp });
  }
  ui.setHUD({
    mode: sim.mode,
    wave: sim.wave,
    cash: me.cash,
    weapon: me.weapon,
    ammo: w.kind === "melee" ? Infinity : me.ammo,
    mag: w.mag,
    reloading,
    reloadProgress,
    lives: me.lives,
    arsenalProgress,
    autoFire: input.autoFire,
    playerState: me.state,
    bleedLeftMs: me.state === "down" ? Math.max(0, me.bleedOutAt - sim.timeMs) : 0,
    reviveProgressMs: me.reviveProgress || 0,
    hp: me.hp,
    maxHp: me.maxHp,
    armor: me.armor,
    score: me.score,
    aliveMs: sim.timeMs ?? 0,
    zombiesLeft: sim.zombies?.length ?? 0,
    inventory: me.inventory || {},
    squad,
    ping: null,
  });
}

function pad2(n) { return String(n).padStart(2, "0"); }
function fmtTime(ms) {
  const s = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const m = Math.floor(s / 60);
  return `${pad2(m)}:${pad2(s % 60)}`;
}
