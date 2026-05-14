import { SHOP_ITEMS, switchWeapon } from "./sim.js";
import { WEAPONS, ARSENAL_ORDER } from "./weapons.js";

export class UI {
  constructor() {
    this.el = {
      menu: document.getElementById("menu"),
      lobby: document.getElementById("lobby"),
      join: document.getElementById("join"),
      shop: document.getElementById("shop"),
      gameover: document.getElementById("gameover"),
      hud: document.getElementById("hud"),
      mode: document.getElementById("hud-mode"),
      wave: document.getElementById("hud-wave"),
      cash: document.getElementById("hud-cash"),
      weapon: document.getElementById("hud-weapon"),
      ammo: document.getElementById("hud-ammo"),
      reload: document.getElementById("hud-reload"),
      reloadBar: document.getElementById("hud-reload-bar"),
      lives: document.getElementById("hud-lives"),
      killfeed: document.getElementById("hud-killfeed"),
      lobbyCode: document.getElementById("lobby-code"),
      lobbyTitle: document.getElementById("lobby-title"),
      lobbyPlayers: document.getElementById("lobby-players"),
      lobbyStart: document.getElementById("lobby-start"),
      lobbyLeave: document.getElementById("lobby-leave"),
      joinCode: document.getElementById("join-code"),
      joinGo: document.getElementById("join-go"),
      joinBack: document.getElementById("join-back"),
      shopGrid: document.getElementById("shop-grid"),
      shopCash: document.getElementById("shop-cash"),
      shopTimer: document.getElementById("shop-timer"),
      shopReady: document.getElementById("shop-ready"),
      goTitle: document.getElementById("gameover-title"),
      goStats: document.getElementById("gameover-stats"),
      goBack: document.getElementById("gameover-back"),
      netStatus: document.getElementById("net-status"),
    };
    this.handlers = {};
    this._wire();
  }

  on(name, fn) { this.handlers[name] = fn; }

  _wire() {
    document.querySelectorAll("#menu .menu-buttons button").forEach((b) => {
      b.addEventListener("click", () => this.handlers.action?.(b.dataset.action));
    });
    document.querySelectorAll("#lobby [data-mode]").forEach((b) => {
      b.addEventListener("click", () => this.handlers.setMode?.(b.dataset.mode));
    });
    this.el.lobbyStart.addEventListener("click", () => this.handlers.startGame?.());
    this.el.lobbyLeave.addEventListener("click", () => this.handlers.leave?.());
    this.el.joinGo.addEventListener("click", () => this.handlers.joinSubmit?.(this.el.joinCode.value.trim().toUpperCase()));
    this.el.joinCode.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handlers.joinSubmit?.(this.el.joinCode.value.trim().toUpperCase());
    });
    this.el.joinBack.addEventListener("click", () => this.handlers.leave?.());
    this.el.shopReady.addEventListener("click", () => this.handlers.shopReady?.());
    this.el.goBack.addEventListener("click", () => this.handlers.leave?.());
  }

  showOnly(...names) {
    for (const k of ["menu", "lobby", "join", "shop", "gameover"]) {
      this.el[k].classList.toggle("hidden", !names.includes(k));
    }
    this.el.hud.classList.toggle("hidden", names.includes("menu") || names.includes("join") || names.includes("gameover"));
  }

  setLobby({ code, title, players, mode, canStart }) {
    if (code) this.el.lobbyCode.textContent = code;
    if (title) this.el.lobbyTitle.textContent = title;
    this.el.lobbyPlayers.innerHTML = players
      .map((p) => `<div class="row">▸ ${escape(p.name)}${p.host ? " · HOST" : ""}</div>`)
      .join("") || `<div class="row" style="color:var(--dim)">waiting…</div>`;
    document.querySelectorAll("#lobby .mode-btn").forEach((b) => {
      b.classList.toggle("selected", b.dataset.mode === mode);
    });
    this.el.lobbyStart.disabled = !canStart;
    this.el.lobbyStart.style.opacity = canStart ? "1" : "0.4";
  }

  setHUD({ mode, wave, cash, weapon, ammo, mag, reloading, reloadProgress, lives, arsenalProgress, autoFire, playerState, bleedLeftMs, reviveProgressMs }) {
    this._setStatusOverlay(playerState, bleedLeftMs, reviveProgressMs);
    this.el.mode.textContent = mode ? `MODE · ${mode.toUpperCase()}` : "";
    if (mode === "horde") {
      this.el.wave.textContent = wave > 0 ? `WAVE ${wave}` : "STANDBY";
      this.el.cash.textContent = `$${cash}`;
    } else {
      this.el.wave.textContent = arsenalProgress ? `${arsenalProgress.done}/${arsenalProgress.total}` : "";
      this.el.cash.textContent = "";
    }
    const auto = autoFire ? " · AUTO" : "";
    this.el.weapon.textContent = weapon ? `[${WEAPONS[weapon].name}]${auto}` : "";

    if (ammo === Infinity) {
      this.el.ammo.textContent = "∞";
      this.el.ammo.className = "";
    } else if (reloading) {
      this.el.ammo.textContent = "RELOAD";
      this.el.ammo.className = "reloading";
    } else {
      this.el.ammo.textContent = `${ammo} / ${mag}`;
      this.el.ammo.className = ammo / mag <= 0.25 ? "low" : "";
    }

    if (reloading) {
      this.el.reload.classList.add("active");
      const pct = Math.max(0, Math.min(100, (reloadProgress ?? 0) * 100));
      this.el.reloadBar.style.width = `${pct}%`;
    } else {
      this.el.reload.classList.remove("active");
      this.el.reloadBar.style.width = "0%";
    }

    this.el.lives.textContent = lives != null ? `LIVES · ${lives}` : "";
  }

  pushKillFeed(text) {
    const row = document.createElement("div");
    row.className = "feed-row";
    row.textContent = text;
    this.el.killfeed.prepend(row);
    setTimeout(() => row.remove(), 4500);
    while (this.el.killfeed.childElementCount > 6) this.el.killfeed.lastChild.remove();
  }

  setNetStatus(text) { this.el.netStatus.textContent = text; }

  _setStatusOverlay(state, bleedLeftMs, reviveProgressMs) {
    let el = document.getElementById("hud-status");
    if (!el) {
      el = document.createElement("div");
      el.id = "hud-status";
      el.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;z-index:10;font-family:ui-monospace,monospace;";
      document.body.appendChild(el);
    }
    if (state === "down") {
      const secs = Math.max(0, Math.ceil((bleedLeftMs ?? 0) / 1000));
      const rev = Math.max(0, Math.min(100, ((reviveProgressMs ?? 0) / 5000) * 100));
      el.innerHTML = `<div style="color:#ff2e6c;font-size:42px;letter-spacing:0.3em;text-shadow:0 0 12px #ff2e6c">DOWNED</div>
        <div style="color:#ffd400;font-size:13px;letter-spacing:0.2em;margin-top:6px">BLEED OUT IN ${secs}s · HOLD F NEAR TEAMMATE</div>
        <div style="margin-top:10px;width:240px;height:6px;background:#1a1a26;border:1px solid #00ffd1">
          <div style="width:${rev}%;height:100%;background:#00ffd1"></div>
        </div>`;
      el.style.display = "block";
    } else if (state === "dead") {
      el.innerHTML = `<div style="color:#ff2e6c;font-size:42px;letter-spacing:0.3em;text-shadow:0 0 12px #ff2e6c">DEAD</div>
        <div style="color:#ffd400;font-size:13px;letter-spacing:0.2em;margin-top:6px">WAIT FOR TEAMMATE TO BUY REVIVE FROM SHOP</div>`;
      el.style.display = "block";
    } else {
      el.style.display = "none";
    }
  }

  renderShop(player, timeLeftMs, sim) {
    this.el.shopCash.textContent = `$${player.cash}`;
    this.el.shopTimer.textContent = Math.max(0, Math.ceil(timeLeftMs / 1000));
    const ownedWeapons = Object.keys(player.inventory);
    const arsenal = ARSENAL_ORDER.filter((w) => ownedWeapons.includes(w));

    this.el.shopGrid.innerHTML = "";
    for (const it of SHOP_ITEMS) {
      const can = it.canBuy(player, sim);
      const cost = it.cost(player, sim);
      const afford = player.cash >= cost && can;
      const card = document.createElement("div");
      card.className = "shop-card" + (afford ? "" : " disabled");
      card.innerHTML = `<div class="name">${it.name}</div><div class="cost">$${cost}</div><div class="desc">${it.desc}</div>`;
      if (afford) card.addEventListener("click", () => this.handlers.buy?.(it.id));
      this.el.shopGrid.appendChild(card);
    }
    const switchHeader = document.createElement("div");
    switchHeader.style.gridColumn = "1 / -1";
    switchHeader.style.color = "var(--dim)";
    switchHeader.style.fontSize = "11px";
    switchHeader.style.letterSpacing = "0.15em";
    switchHeader.style.marginTop = "10px";
    switchHeader.textContent = "EQUIP · click to switch";
    this.el.shopGrid.appendChild(switchHeader);
    for (const wid of arsenal) {
      const card = document.createElement("div");
      card.className = "shop-card";
      card.style.gridColumn = "span 1";
      card.innerHTML = `<div class="name">${WEAPONS[wid].name}</div><div class="desc">${player.weapon === wid ? "EQUIPPED" : "click to equip"}</div>`;
      card.addEventListener("click", () => this.handlers.equip?.(wid));
      this.el.shopGrid.appendChild(card);
    }
  }

  showGameOver({ title, win, stats }) {
    this.el.goTitle.textContent = title;
    this.el.goTitle.classList.toggle("win", !!win);
    this.el.goStats.innerHTML = stats.map((s) => `<div>${escape(s)}</div>`).join("");
  }
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
