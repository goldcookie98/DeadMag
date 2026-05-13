import { Input } from "./input.js";
import { Camera } from "./camera.js";
import { createSim, addPlayer, removePlayer, setInput, step, shopBuy, switchWeapon, CONSTANTS } from "./sim.js";
import { render } from "./render.js";
import { UI } from "./ui.js";
import { Net } from "./net.js";
import { WEAPONS, ARSENAL_ORDER } from "./weapons.js";
import { mountVersion } from "./version-display.js";

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
let net = null;
let roomCode = null;
let isHost = false;
let lobby = { players: [], mode: "horde" };
let killfeedSeen = new Set();

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
ui.showOnly("menu");
ui.setNetStatus("");

ui.on("action", onMenuAction);
ui.on("setMode", (m) => { lobby.mode = m; renderLobby(); });
ui.on("startGame", () => {
  if (net) net.send("start", { mode: lobby.mode });
});
ui.on("leave", leaveToMenu);
ui.on("joinSubmit", joinSubmit);
ui.on("shopReady", () => { if (net) net.send("shop-ready"); });
ui.on("buy", (id) => {
  if (net) net.send("buy", { itemId: id });
  else if (sim) shopBuy(sim, localId, id);
});
ui.on("equip", (wid) => {
  if (net) net.send("equip", { weapon: wid });
  else if (sim) switchWeapon(sim, localId, wid);
});

function onMenuAction(action) {
  if (action === "solo-horde") startSolo("horde");
  else if (action === "solo-arsenal") startSolo("arsenal");
  else if (action === "mp-create") createLobby();
  else if (action === "mp-join") openJoin();
}

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
  const url = await promptServerUrl("ws://localhost:8080");
  if (!url) return;
  try {
    net = await connectNet(url);
    net.send("create", { name: "P_" + Math.floor(Math.random() * 999) });
    isHost = true;
    state = "lobby";
    ui.showOnly("lobby");
  } catch (e) {
    alert("Couldn't connect: " + (e?.message ?? e));
  }
}

function openJoin() {
  ui.showOnly("join");
}

async function joinSubmit(code, urlInput) {
  if (!/^[A-Z0-9]{4}$/.test(code)) { alert("Code must be 4 chars."); return; }
  const url = urlInput || "ws://localhost:8080";
  try {
    net = await connectNet(url);
    net.send("join", { code, name: "P_" + Math.floor(Math.random() * 999) });
    isHost = false;
    state = "lobby";
    ui.showOnly("lobby");
  } catch (e) {
    alert("Couldn't connect: " + (e?.message ?? e));
  }
}

async function promptServerUrl(def) {
  const v = prompt("Server URL (or leave blank for default):", def);
  if (v === null) return null;
  return v.trim() || def;
}

function connectNet(url) {
  const handlers = {
    onMessage: onNetMessage,
    onClose: () => { ui.setNetStatus("DISCONNECTED"); },
  };
  const n = new Net(url, handlers);
  ui.setNetStatus("CONNECTING…");
  return n.connect().then(() => { ui.setNetStatus("ONLINE"); return n; });
}

function onNetMessage(m) {
  if (m.type === "welcome") {
    roomCode = m.code;
    localId = m.playerId;
    lobby = { players: m.players, mode: m.mode, hostId: m.hostId };
    renderLobby();
  } else if (m.type === "lobby") {
    lobby = { players: m.players, mode: m.mode, hostId: m.hostId };
    renderLobby();
  } else if (m.type === "start") {
    mode = m.mode;
    state = "playing";
    ui.showOnly();
  } else if (m.type === "state") {
    sim = inflateState(m.state);
    if (sim.events?.length) processEvents(sim);
  } else if (m.type === "error") {
    alert("Server: " + m.message);
    leaveToMenu();
  }
}

function inflateState(s) {
  s.players = new Map(s.players.map((p) => [p.id, { ...p, arsenalKills: new Set(p.arsenalKills || []) }]));
  s.inputs = new Map();
  return s;
}

function renderLobby() {
  ui.setLobby({
    code: roomCode || "----",
    title: isHost ? "LOBBY · HOST" : "LOBBY",
    players: lobby.players.map((p) => ({ name: p.name, host: p.id === lobby.hostId })),
    mode: lobby.mode,
    canStart: isHost && lobby.players.length >= 1,
  });
}

function leaveToMenu() {
  if (net) net.close();
  net = null; sim = null; roomCode = null;
  state = "menu";
  ui.showOnly("menu");
  ui.setNetStatus("");
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(33, now - last) / 1000;
  last = now;

  if (state === "playing" && sim) {
    if (!net) {
      const me = sim.players.get(localId);
      if (me) {
        const snap = input.snapshot(camera);
        setInput(sim, localId, snap);
      }
      step(sim, dt);
      processEvents(sim);
    } else {
      const snap = input.snapshot(camera);
      net.send("input", { input: snap });
    }

    const me = sim.players.get(localId);
    if (me) camera.follow(me.x, me.y);

    render(ctx, sim, camera, localId, input.mouse);

    if (sim.shopOpen) {
      if (ui.el.shop.classList.contains("hidden")) ui.showOnly("shop");
      const me = sim.players.get(localId);
      if (me) ui.renderShop(me, sim.shopOpenUntil - sim.timeMs);
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
  ui.setHUD({
    mode: sim.mode,
    wave: sim.wave,
    cash: me.cash,
    weapon: me.weapon,
    ammo: w.kind === "melee" ? Infinity : me.ammo,
    reloading: sim.timeMs < me.reloadingUntil,
    lives: me.lives,
    arsenalProgress,
  });
}
