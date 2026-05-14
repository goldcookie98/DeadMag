import { Input } from "./input.js";
import { Camera } from "./camera.js";
import { createSim, addPlayer, setInput, step, shopBuy, switchWeapon, setReady } from "./sim.js";
import { render, recordMuzzleFlash } from "./render.js";
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
// Per-frame pull rates (compound across ~2 frames per server snapshot at 60fps).
// Idle: pull toward server briskly so any drift settles when player stops.
// Driving: don't pull at all — the server's "current" position is intrinsically
// RTT-behind our predict, and reconciling against it while moving creates
// visible jitter when changing direction. Drift only matters when stopped.
const PREDICT_IDLE_PULL    = 0.18;
const PREDICT_DRIVE_PULL   = 0.0;
const PREDICT_DEADZONE_PX  = 6;          // below this, snap exactly to predict
const PREDICT_BIG_DRIFT_PX = 90;         // above this, pull strongly even mid-move
const PREDICT_BIG_PULL     = 0.12;
const PREDICT_HARD_SNAP_PX = 280;        // explosion knockback / desync floor

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

// Snapshot interpolation: keep recent server states + wall-clock receive times.
// We render the world at (now - RENDER_DELAY_MS), lerping between the bracketing pair,
// so the 30Hz server tick stops feeling like 30Hz.
const RENDER_DELAY_MS = 100;
const STATE_BUFFER_MAX_MS = 600;
let stateBuffer = [];
let predictMe = null;          // { x, y, angle } — local player's predicted pose
let _lastInputSendAt = 0;
let _lastSentShoot = false;
let _lastSentReload = false;
let _lastLocalFireAt = 0;      // gates client-side muzzle flash to weapon rate

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
    "Paste your DeadMag server URL (e.g. wss://deadmag-server.onrender.com).\nLeave blank to clear.",
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
    sim = createSim(mode);
    stateBuffer = [];
    predictMe = null;
    _lastSentShoot = false;
    _lastSentReload = false;
    _lastLocalFireAt = 0;
    ui.showOnly();
  });
  mp.on("state", (data) => {
    const inflated = inflateState(data);
    const nowMs = performance.now();
    stateBuffer.push({ receivedAt: nowMs, state: inflated });
    while (stateBuffer.length > 2 && nowMs - stateBuffer[0].receivedAt > STATE_BUFFER_MAX_MS) {
      stateBuffer.shift();
    }
    sim = inflated;
    if (sim.events?.length) processEvents(sim);
  });
  mp.on("disconnected", (reason) => {
    ui.setNetStatus("DISCONNECTED");
    const wasInGame = state === "playing" || state === "lobby";
    if (!wasInGame) return;
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
  s.players = new Map(s.players.map((p) => [p.id, { ...p, arsenalKills: new Set(p.arsenalKills || []) }]));
  s.inputs = new Map();
  return s;
}

function buildRenderSim() {
  if (!stateBuffer.length) return sim;
  if (stateBuffer.length === 1) return stateBuffer[0].state;
  const target = performance.now() - RENDER_DELAY_MS;
  let prevIdx = -1;
  for (let i = stateBuffer.length - 1; i >= 0; i--) {
    if (stateBuffer[i].receivedAt <= target) { prevIdx = i; break; }
  }
  if (prevIdx < 0) return stateBuffer[0].state;
  if (prevIdx >= stateBuffer.length - 1) return stateBuffer[stateBuffer.length - 1].state;
  const a = stateBuffer[prevIdx], b = stateBuffer[prevIdx + 1];
  const span = Math.max(1, b.receivedAt - a.receivedAt);
  const t = Math.max(0, Math.min(1, (target - a.receivedAt) / span));
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
  if (mp) mp.leave();
  mp = null; sim = null; roomCode = null;
  predictMe = null;
  stateBuffer = [];
  state = "menu";
  ui.showOnly("menu");
  ui.setNetStatus("");
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

// Per-frame reconciliation that doesn't fight the player's input. While an axis
// is being driven, the server's authoritative position is intrinsically lagged
// by ~RTT/2; pulling toward it would yank the predicted character backward on
// direction changes (the "jitter" symptom). So we hold steady while moving and
// only converge when stopped, with a strong override for very large drift
// (knockback, explosion, teleport, etc).
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
  const rateX = big ? PREDICT_BIG_PULL : (drivingX ? PREDICT_DRIVE_PULL : PREDICT_IDLE_PULL);
  const rateY = big ? PREDICT_BIG_PULL : (drivingY ? PREDICT_DRIVE_PULL : PREDICT_IDLE_PULL);
  predictMe.x += dx * rateX;
  predictMe.y += dy * rateY;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(33, now - last) / 1000;
  last = now;

  if (state === "playing" && sim) {
    const snap = input.snapshot(camera);
    if (!mp) {
      if (sim.players.get(localId)) setInput(sim, localId, snap);
      step(sim, dt);
      processEvents(sim);
    } else {
      const nowSend = performance.now();
      // Bypass the 30Hz throttle on the FIRST frame an action becomes true
      // (click, reload tap) — otherwise the server can wait up to a full
      // tick before even seeing the input. Held actions keep the throttle.
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
        // Client-side muzzle flash for instant click feedback. The actual hit
        // is still server-authoritative; this just hides the round-trip floor.
        if (shootEdge && predictMe && meAuth.state === "alive") {
          const w = WEAPONS[meAuth.weapon];
          const cooldownMs = w?.rate ?? 100;
          const ready = nowSend - _lastLocalFireAt >= cooldownMs * 0.9
            && meAuth.ammo > 0
            && (sim.timeMs ?? 0) >= (meAuth.reloadingUntil ?? 0);
          if (ready) {
            recordMuzzleFlash(predictMe.x, predictMe.y, predictMe.angle, meAuth.weapon, nowSend);
            _lastLocalFireAt = nowSend;
          }
        }
      }
    }

    let renderSim = mp ? buildRenderSim() : sim;
    // Override the local player with the predicted pose so movement is
    // responsive to input instead of waiting on the server round-trip.
    if (mp && predictMe) {
      const me = renderSim.players.get(localId);
      if (me) {
        const players = new Map(renderSim.players);
        players.set(localId, { ...me, x: predictMe.x, y: predictMe.y, angle: predictMe.angle });
        renderSim = { ...renderSim, players };
      }
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
