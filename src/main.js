import { Input } from "./input.js";
import { Camera } from "./camera.js";
import { createSim, addPlayer, setInput, step, shopBuy, switchWeapon, setReady } from "./sim.js";
import { render } from "./render.js";
import { UI } from "./ui.js";
import { Mp, getSavedServerUrl, setServerUrl } from "./mp.js";
import { WEAPONS, ARSENAL_ORDER } from "./weapons.js";
import { mountVersion } from "./version-display.js";
import { mountCheats, applyCheat } from "./cheats.js";

const COLORS = ["#ff2e6c", "#00ffd1", "#ffd400", "#8a5cff", "#5eff5e", "#ff8c2e", "#2eaaff", "#ff5edc"];

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
const RENDER_DELAY_MS = 80;
const STATE_BUFFER_MAX_MS = 600;
let stateBuffer = [];

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
  mp.on("peerLeft", () => {
    ui.setNetStatus("DISCONNECTED");
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
  state = "menu";
  ui.showOnly("menu");
  ui.setNetStatus("");
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
      mp.sendInput(snap);
    }

    const renderSim = mp ? buildRenderSim() : sim;
    const meRender = renderSim.players.get(localId);
    if (meRender) camera.follow(meRender.x, meRender.y);

    render(ctx, renderSim, camera, localId, input.mouse);

    if (sim.shopOpen) {
      if (ui.el.shop.classList.contains("hidden")) ui.showOnly("shop");
      const me = sim.players.get(localId);
      if (me) ui.renderShop(me, sim.shopOpenUntil - sim.timeMs, sim);
    } else if (!ui.el.shop.classList.contains("hidden")) {
      ui.showOnly();
    }

    if (sim.gameOver && state === "playing") {
      state = "ended";
      const me = sim.players.get(localId);
      let title, stats, win = false;
      if (sim.mode === "horde") {
        title = "DEAD";
        stats = [`survived ${sim.wave} waves`, `kills: ${me?.score ?? 0}`, `cash earned: $${me?.cash ?? 0}`];
      } else {
        win = sim.winnerId === localId;
        title = win ? "WINNER" : "ELIMINATED";
        const w = sim.players.get(sim.winnerId);
        stats = [`winner: ${w?.name ?? "—"}`, `kills: ${me?.score ?? 0}`];
      }
      ui.showGameOver({ title, win, stats });
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
      ui.pushKillFeed(`${k?.name ?? "—"} [${WEAPONS[e.weapon]?.name ?? "?"}] ${v ?? "—"}`);
    } else if (e.type === "down") {
      const p = sim.players.get(e.id);
      ui.pushKillFeed(`${p?.name ?? "—"} DOWNED · HOLD F TO REVIVE`);
    } else if (e.type === "death") {
      const p = sim.players.get(e.id);
      ui.pushKillFeed(`${p?.name ?? "—"} BLED OUT`);
    } else if (e.type === "revive") {
      const p = sim.players.get(e.id);
      ui.pushKillFeed(`${p?.name ?? "—"} REVIVED`);
    } else if (e.type === "buy") {
      const p = sim.players.get(e.playerId);
      ui.pushKillFeed(`${p?.name ?? "—"} bought ${e.itemName} · -$${e.cost}`);
      ui.flashShopBuy?.(p?.name ?? "—", e.itemName);
    } else if (e.type === "wave-start") {
      ui.pushKillFeed(`WAVE ${e.wave} INCOMING`);
    } else if (e.type === "wave-end") {
      ui.pushKillFeed(`WAVE ${e.wave} CLEARED · SHOP OPEN`);
    }
  }
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
  });
}
