import { SHOP_ITEMS } from "./sim.js";
import { WEAPONS, ARSENAL_ORDER } from "./weapons.js";

export const WEAPON_SVG = {
  pistol: `<svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">
<path d="M 38 30 L 110 30 L 110 40 L 100 42 L 96 46 L 38 46 Z" />
<rect x="108" y="34" width="8" height="6" fill="var(--cyan)" stroke="var(--cyan)" />
<path d="M 60 46 L 74 70 L 84 70 L 88 46 Z" />
<path d="M 70 46 C 70 56, 78 56, 80 46" />
</svg>`,
  shotgun: `<svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">
<rect x="14" y="32" width="96" height="9" />
<rect x="106" y="33" width="6" height="7" fill="var(--cyan)" stroke="var(--cyan)" />
<rect x="44" y="41" width="22" height="6" />
<path d="M 110 32 L 130 32 L 132 50 L 110 50 Z" />
<path d="M 132 36 L 152 32 L 152 50 L 132 50 Z" />
</svg>`,
  smg: `<svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">
<rect x="32" y="28" width="76" height="11" />
<rect x="104" y="31" width="22" height="5" />
<rect x="124" y="30" width="6" height="7" fill="var(--cyan)" stroke="var(--cyan)" />
<path d="M 60 39 L 64 64 L 80 64 L 84 39 Z" />
<path d="M 84 39 L 88 56 L 96 56 L 96 39 Z" />
</svg>`,
  sniper: `<svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">
<rect x="6" y="35" width="106" height="6" />
<rect x="108" y="33" width="6" height="10" fill="var(--cyan)" stroke="var(--cyan)" />
<rect x="56" y="20" width="44" height="9" rx="2" />
<path d="M 110 41 L 130 41 L 130 49 L 112 49 Z" />
<path d="M 130 38 L 152 36 L 152 52 L 130 52 Z" />
<path d="M 28 41 L 22 56 M 28 41 L 34 56" />
</svg>`,
  rocket: `<svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">
<rect x="18" y="30" width="100" height="14" rx="2" />
<path d="M 118 30 L 132 30 L 140 37 L 132 44 L 118 44 Z" fill="var(--cyan)" stroke="var(--cyan)" />
<path d="M 18 30 L 8 26 L 8 48 L 18 44 Z" />
<path d="M 56 44 L 56 60 L 72 60 L 72 44" />
<rect x="82" y="22" width="14" height="8" />
</svg>`,
  knife: `<svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">
<path d="M 14 38 L 90 32 L 100 38 L 90 44 L 14 42 Z" />
<path d="M 90 32 L 100 38 L 90 44" fill="var(--cyan)" stroke="var(--cyan)" />
<rect x="100" y="32" width="6" height="14" />
<path d="M 106 33 L 146 35 L 146 45 L 106 47 Z" />
</svg>`,
  voltspike: `<svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">
<rect x="14" y="34" width="20" height="10" />
<rect x="34" y="32" width="60" height="14" />
<path d="M 38 30 L 42 26 L 46 30 L 50 26 L 54 30 L 58 26 L 62 30 L 66 26 L 70 30 L 74 26 L 78 30 L 82 26 L 86 30 L 90 26" stroke="var(--cyan)" stroke-width="1.6" />
<path d="M 72 30 L 80 39 L 72 48 L 64 39 Z" fill="var(--cyan)" stroke="var(--cyan)" />
<path d="M 94 32 L 110 26" stroke="var(--cyan)" stroke-width="1.8" />
<path d="M 94 46 L 110 52" stroke="var(--cyan)" stroke-width="1.8" />
<circle cx="112" cy="39" r="3" fill="var(--cyan)" stroke="var(--cyan)" />
<path d="M 114 39 L 122 34 L 118 42 L 130 38 L 124 46 L 138 42" stroke="var(--cyan)" stroke-width="1.2" opacity="0.9" />
<path d="M 64 46 L 68 70 L 78 70 L 82 46 Z" />
<path d="M 76 46 C 76 56, 82 56, 84 46" />
</svg>`,
  ripple: `<svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">
<rect x="22" y="34" width="20" height="10" />
<rect x="42" y="32" width="56" height="14" />
<path d="M 50 38 L 60 38 M 64 38 L 74 38 M 78 38 L 88 38" stroke="var(--acid)" opacity="0.5" />
<rect x="72" y="26" width="8" height="6" />
<circle cx="118" cy="39" r="20" />
<circle cx="118" cy="39" r="14" stroke="var(--acid)" opacity="0.7" />
<circle cx="118" cy="39" r="8" stroke="var(--acid)" />
<circle cx="118" cy="39" r="3" fill="var(--acid)" stroke="var(--acid)" />
<path d="M 140 26 Q 148 30, 148 39 Q 148 48, 140 52" stroke="var(--acid)" opacity="0.45" />
<path d="M 146 22 Q 156 28, 156 39 Q 156 50, 146 56" stroke="var(--acid)" opacity="0.25" />
<path d="M 60 46 L 64 70 L 74 70 L 78 46 Z" />
<path d="M 76 46 C 76 56, 82 56, 84 46" />
</svg>`,
};

const UPGRADE_META = {
  "upg-dmg":    { color: "var(--magenta)", short: "+DMG",    max: 5, field: "dmg"    },
  "upg-rate":   { color: "var(--cyan)",    short: "+RATE",   max: 5, field: "rate"   },
  "upg-reload": { color: "var(--yellow)",  short: "+RLOAD",  max: 5, field: "reload" },
  "upg-speed":  { color: "var(--acid)",    short: "+SPEED",  max: 3, field: "speed"  },
};

const SUPPLY_GLYPHS = {
  heal:   { glyph: "⊕", color: "var(--acid)"    },
  armor:  { glyph: "◇", color: "var(--yellow)"  },
  life:   { glyph: "✚", color: "var(--cyan)"    },
  revive: { glyph: "↺", color: "var(--magenta)" },
};

const TINT_PALETTE = ["var(--magenta)", "var(--cyan)", "var(--acid)", "var(--yellow)"];

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
      waveSub: document.getElementById("hud-wave-sub"),
      ping: document.getElementById("hud-ping"),
      alive: document.getElementById("hud-alive"),
      cash: document.getElementById("hud-cash"),
      weapon: document.getElementById("hud-weapon"),
      auto: document.getElementById("hud-auto"),
      ammo: document.getElementById("hud-ammo"),
      mag: document.getElementById("hud-mag"),
      reload: document.getElementById("hud-reload"),
      reloadBar: document.getElementById("hud-reload-bar"),
      hpBig: document.getElementById("hud-hp-big"),
      hpWarn: document.getElementById("hud-hp-warn"),
      hpFill: document.getElementById("hud-hp-fill"),
      hpText: document.getElementById("hud-hp-text"),
      armorRow: document.getElementById("hud-armor-row"),
      armorBig: document.getElementById("hud-armor-big"),
      armorBar: document.getElementById("hud-armor-bar"),
      armorFill: document.getElementById("hud-armor-fill"),
      armorText: document.getElementById("hud-armor-text"),
      lives: document.getElementById("hud-lives"),
      killfeed: document.getElementById("hud-killfeed"),
      squad: document.getElementById("hud-squad"),
      invGrid: document.getElementById("hud-inv-grid"),
      lobbyCode: document.getElementById("lobby-code"),
      lobbyTitle: document.getElementById("lobby-title"),
      lobbyPlayers: document.getElementById("lobby-players"),
      lobbyOpsCount: document.getElementById("lobby-ops-count"),
      lobbyStart: document.getElementById("lobby-start"),
      lobbyLeave: document.getElementById("lobby-leave"),
      joinCode: document.getElementById("join-code"),
      joinGo: document.getElementById("join-go"),
      joinBack: document.getElementById("join-back"),
      shopItems: document.getElementById("shop-items"),
      shopEquip: document.getElementById("shop-equip-grid"),
      shopSquad: document.getElementById("shop-squad"),
      shopNextTitle: document.getElementById("shop-next-wave-title"),
      shopNextDesc: document.getElementById("shop-next-wave-desc"),
      shopCash: document.getElementById("shop-cash"),
      shopTimer: document.getElementById("shop-timer"),
      shopReady: document.getElementById("shop-ready"),
      goTitle: document.getElementById("gameover-title"),
      goStats: document.getElementById("gameover-stats"),
      goBack: document.getElementById("gameover-back"),
      netStatus: document.getElementById("net-status"),
      connecting: document.getElementById("connecting"),
      connectingStatus: document.getElementById("connecting-status"),
      connectingSub: document.getElementById("connecting-sub"),
      connectingCancel: document.getElementById("connecting-cancel"),
      namePrompt: document.getElementById("name-prompt"),
      namePromptInput: document.getElementById("name-prompt-input"),
      namePromptGo: document.getElementById("name-prompt-go"),
      namePromptBack: document.getElementById("name-prompt-back"),
    };
    this.handlers = {};
    this._wire();
  }

  on(name, fn) { this.handlers[name] = fn; }

  _wire() {
    document.querySelectorAll("#menu .menu-buttons button").forEach((b) => {
      b.addEventListener("click", () => {
        if (b.disabled) return;
        this.handlers.action?.(b.dataset.action);
      });
    });
    const submitName = () => {
      const v = (this.el.namePromptInput?.value || "").trim();
      if (!v) { this.el.namePromptInput?.focus(); return; }
      this.handlers.nameSubmit?.(v);
    };
    this.el.namePromptGo?.addEventListener("click", submitName);
    this.el.namePromptInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitName();
      else if (e.key === "Escape") this.handlers.nameCancel?.();
    });
    this.el.namePromptBack?.addEventListener("click", () => this.handlers.nameCancel?.());
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
    this.el.connectingCancel?.addEventListener("click", () => this.handlers.leave?.());

    this.el.lobbyCode.addEventListener("click", () => {
      const code = this.el.lobbyCode.textContent;
      if (!code || code === "----") return;
      navigator.clipboard?.writeText(code).catch(() => {});
      this.el.lobbyCode.classList.add("flash");
      setTimeout(() => this.el.lobbyCode.classList.remove("flash"), 600);
    });
  }

  showOnly(...names) {
    for (const k of ["menu", "lobby", "join", "shop", "gameover", "connecting"]) {
      if (this.el[k]) this.el[k].classList.toggle("hidden", !names.includes(k));
    }
    this.el.hud.classList.toggle("hidden", names.includes("menu") || names.includes("join") || names.includes("gameover") || names.includes("lobby") || names.includes("connecting"));
  }

  showNamePrompt(initial = "") {
    if (!this.el.namePrompt) return;
    this.el.namePrompt.classList.remove("hidden");
    if (this.el.namePromptInput) {
      this.el.namePromptInput.value = initial;
      setTimeout(() => { this.el.namePromptInput.focus(); this.el.namePromptInput.select?.(); }, 30);
    }
  }
  hideNamePrompt() {
    this.el.namePrompt?.classList.add("hidden");
  }

  setConnectingStatus(text, sub) {
    if (this.el.connectingStatus && text != null) this.el.connectingStatus.textContent = text;
    if (this.el.connectingSub && sub != null) this.el.connectingSub.textContent = sub;
  }

  setLobby({ code, title, players, mode, canStart }) {
    if (code) this.el.lobbyCode.textContent = code;
    if (title) this.el.lobbyTitle.textContent = title;
    const list = players || [];
    const total = 8;
    const rows = list.map((p, i) => {
      const color = TINT_PALETTE[i % TINT_PALETTE.length];
      const initial = (p.name || "?").charAt(0).toUpperCase();
      return `<div class="op-row${i === 0 ? " first" : ""}" style="border-left:3px solid ${color}">
  <div class="op-avatar" style="background:${color};color:var(--bg)">${escape(initial)}</div>
  <span class="op-name">${escape(p.name || "—")}</span>
  ${p.host ? '<span class="op-host">HOST</span>' : ""}
  <span class="op-ready">● READY</span>
</div>`;
    });
    for (let i = list.length; i < total; i++) {
      rows.push(`<div class="op-row empty">
  <div class="op-avatar"></div>
  <span class="op-empty">SLOT OPEN · WAITING…</span>
</div>`);
    }
    this.el.lobbyPlayers.innerHTML = rows.join("");
    if (this.el.lobbyOpsCount) this.el.lobbyOpsCount.textContent = `${list.length}/${total}`;

    document.querySelectorAll("#lobby .mode-card").forEach((b) => {
      b.classList.toggle("selected", b.dataset.mode === mode);
    });
    this.el.lobbyStart.disabled = !canStart;
    this.el.lobbyStart.classList.toggle("disabled", !canStart);
  }

  setHUD({ mode, wave, cash, weapon, ammo, mag, reloading, reloadProgress, lives, arsenalProgress, autoFire, playerState, bleedLeftMs, reviveProgressMs, respawnLeftMs, hasTeammates, hp, maxHp, armor, score, aliveMs, zombiesLeft, slots, activeSlot, slotAmmo, slotPacked, crate, squad, ping }) {
    this._setStatusOverlay(playerState, bleedLeftMs, reviveProgressMs, { mode, respawnLeftMs, hasTeammates });

    this.el.mode.textContent = mode ? mode.toUpperCase() : "—";

    if (mode === "horde") {
      this.el.wave.textContent = wave > 0 ? `WAVE ${pad2(wave)}` : "STANDBY";
      this.el.waveSub.textContent = zombiesLeft != null && wave > 0 ? `${zombiesLeft} LEFT` : "";
      this.el.cash.textContent = `$${(cash ?? 0).toLocaleString()}`;
    } else {
      this.el.wave.textContent = arsenalProgress ? `${arsenalProgress.done}/${arsenalProgress.total}` : "ARSENAL";
      this.el.waveSub.textContent = "";
      this.el.cash.textContent = `KILLS ${score ?? 0}`;
    }

    if (this.el.ping) {
      const p = ping ?? null;
      this.el.ping.classList.remove("warn", "bad");
      if (p == null) { this.el.ping.textContent = "● —"; }
      else {
        this.el.ping.textContent = `● ${p}ms`;
        if (p > 120) this.el.ping.classList.add("bad");
        else if (p > 60) this.el.ping.classList.add("warn");
      }
    }
    if (this.el.alive) this.el.alive.textContent = `${fmtTime(aliveMs ?? 0)} ALIVE`;

    const hpPct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
    if (this.el.hpBig) this.el.hpBig.textContent = Math.max(0, Math.round(hp ?? 0));
    if (this.el.hpFill) this.el.hpFill.style.width = `${hpPct}%`;
    if (this.el.hpText) this.el.hpText.textContent = `${Math.max(0, Math.round(hp ?? 0))}/${maxHp ?? 0}`;
    if (this.el.hpWarn) this.el.hpWarn.textContent = hpPct <= 25 ? "⚠ LOW" : "";

    const a = Math.max(0, armor ?? 0);
    if (this.el.armorRow) this.el.armorRow.classList.toggle("empty", a <= 0);
    if (this.el.armorBig) this.el.armorBig.textContent = a;
    if (this.el.armorFill) this.el.armorFill.style.width = `${Math.min(100, (a / 150) * 100)}%`;
    if (this.el.armorText) this.el.armorText.textContent = `${a}/150`;

    if (this.el.lives) {
      const total = 3;
      const have = Math.max(0, Math.min(total, lives ?? 0));
      const parts = [];
      for (let i = 0; i < total; i++) parts.push(`<span class="life ${i < have ? "on" : ""}"></span>`);
      this.el.lives.innerHTML = parts.join("");
    }

    if (this.el.weapon) this.el.weapon.textContent = weapon ? WEAPONS[weapon].name : "—";
    if (this.el.auto) this.el.auto.classList.toggle("hidden", !autoFire);

    if (ammo === Infinity) {
      if (this.el.ammo) { this.el.ammo.textContent = "∞"; this.el.ammo.className = ""; }
      if (this.el.mag)  { this.el.mag.classList.add("hidden"); }
    } else if (reloading) {
      if (this.el.ammo) { this.el.ammo.textContent = "RELOAD"; this.el.ammo.className = "reloading"; }
      if (this.el.mag)  { this.el.mag.classList.add("hidden"); }
    } else {
      if (this.el.ammo) {
        this.el.ammo.textContent = `${ammo}`;
        this.el.ammo.className = (mag > 0 && ammo / mag <= 0.25) ? "low" : "";
      }
      if (this.el.mag) { this.el.mag.textContent = `/${mag}`; this.el.mag.classList.remove("hidden"); }
    }

    if (this.el.reload) {
      this.el.reload.classList.toggle("hidden", !reloading);
      this.el.reload.classList.toggle("active", !!reloading);
      const pct = Math.max(0, Math.min(100, (reloadProgress ?? 0) * 100));
      if (this.el.reloadBar) this.el.reloadBar.style.width = `${reloading ? pct : 0}%`;
    }

    this._renderInventory(slots || ["pistol", null], activeSlot ?? 0, slotAmmo || [0, 0], slotPacked || [false, false]);
    this._renderSquadHud(squad || []);
    this._renderCrateOverlay(crate || null);
  }

  _renderInventory(slots, activeSlot, slotAmmo, slotPacked) {
    if (!this.el.invGrid) return;
    const sig = JSON.stringify({ s: slots, a: activeSlot, am: slotAmmo, p: slotPacked });
    if (this._invSig === sig) return;
    this._invSig = sig;
    const cells = [0, 1].map((i) => {
      const wid = slots[i];
      const active = i === activeSlot && !!wid;
      const empty = !wid;
      const packed = !!slotPacked[i];
      const cls = "inv-cell" + (active ? " active" : empty ? " empty" : " owned") + (packed ? " packed" : "");
      const art = wid
        ? `<span class="inv-art">${WEAPON_SVG[wid] || ""}</span>`
        : `<span class="inv-empty-mark">EMPTY</span>`;
      const name = wid ? `<span class="inv-name">${WEAPONS[wid]?.name || wid.toUpperCase()}${packed ? "+" : ""}</span>` : "";
      return `<div class="${cls}"><span class="inv-slot">${i + 1}</span>${art}${name}</div>`;
    });
    this.el.invGrid.innerHTML = cells.join("");
  }

  _renderCrateOverlay(_crate) {
    // The CS:GO-style spin is now rendered in the world canvas above the
    // crate (see render.js). Hide the legacy fullscreen overlay if present.
    const legacy = document.getElementById("crate-overlay");
    if (legacy) legacy.style.display = "none";
  }

  _renderSquadHud(squad) {
    if (!this.el.squad) return;
    if (!squad.length) { this.el.squad.innerHTML = ""; this._squadSig = null; return; }
    const sig = JSON.stringify(squad);
    if (this._squadSig === sig) return;
    this._squadSig = sig;
    const head = `<div class="squad-head">// SQUAD</div>`;
    const rows = squad.map((m) => {
      const color = m.color || "var(--magenta)";
      const stateLabel = m.state === "down" ? "DOWN" : m.state === "dead" ? "DEAD" : `${Math.max(0, Math.round(m.hp))}`;
      const pct = m.maxHp > 0 ? Math.max(0, Math.min(100, (m.hp / m.maxHp) * 100)) : 0;
      const barFill = m.state === "down" ? "var(--yellow)" : color;
      return `<div class="squad-row" style="border-left:3px solid ${color}">
  <div class="squad-top"><span>${escape(m.name || "—")}</span><span class="squad-state">${stateLabel}</span></div>
  <div class="squad-bar"><div style="width:${pct}%;background:${barFill};box-shadow:0 0 4px ${barFill}"></div></div>
</div>`;
    }).join("");
    this.el.squad.innerHTML = head + rows;
  }

  pushKillFeed(text, opts = {}) {
    const row = document.createElement("div");
    row.className = "feed-row" + (opts.warn ? " warn" : "");
    row.innerHTML = text;
    this.el.killfeed.prepend(row);
    setTimeout(() => row.remove(), 4500);
    while (this.el.killfeed.childElementCount > 6) this.el.killfeed.lastChild.remove();
  }

  setNetStatus(text) { this.el.netStatus.textContent = text; }

  hideHudStatus() {
    const el = document.getElementById("hud-status");
    if (el) el.style.display = "none";
  }

  _setStatusOverlay(state, bleedLeftMs, reviveProgressMs, opts = {}) {
    let el = document.getElementById("hud-status");
    if (!el) {
      el = document.createElement("div");
      el.id = "hud-status";
      document.body.appendChild(el);
    }
    const mode = opts.mode;
    const hasTeammates = !!opts.hasTeammates;
    if (state === "down") {
      // Down only happens in horde co-op (solo horde skips this state). If
      // we somehow get here without teammates, treat as terminal.
      if (!hasTeammates) { el.style.display = "none"; return; }
      const secs = Math.max(0, Math.ceil((bleedLeftMs ?? 0) / 1000));
      const rev = Math.max(0, Math.min(100, ((reviveProgressMs ?? 0) / 5000) * 100));
      el.innerHTML = `<div class="status-title">DOWNED</div>
        <div class="status-sub">BLEED OUT IN ${secs}s · HOLD F NEAR TEAMMATE</div>
        <div class="status-bar"><div style="width:${rev}%"></div></div>`;
      el.style.display = "block";
    } else if (state === "dead") {
      if (mode === "arsenal") {
        // Arsenal respawns automatically — show a countdown, not a revive plea.
        const secs = Math.max(0, Math.ceil((opts.respawnLeftMs ?? 0) / 1000));
        el.innerHTML = `<div class="status-title">ELIMINATED</div>
          <div class="status-sub">RESPAWN IN ${secs}s</div>`;
        el.style.display = "block";
      } else if (mode === "horde" && hasTeammates) {
        el.innerHTML = `<div class="status-title">DEAD</div>
          <div class="status-sub">WAIT FOR TEAMMATE TO BUY REVIVE FROM SHOP</div>`;
        el.style.display = "block";
      } else {
        // Solo (or last-standing) — game over takes over this frame, nothing to show.
        el.style.display = "none";
      }
    } else {
      el.style.display = "none";
    }
  }

  renderShop(player, timeLeftMs, sim) {
    this.el.shopCash.textContent = `$${(player.cash ?? 0).toLocaleString()}`;
    const secs = Math.max(0, Math.ceil(timeLeftMs / 1000));
    this.el.shopTimer.textContent = secs;
    this.el.shopTimer.classList.toggle("urgent", secs <= 5);

    const ownedWeapons = (player.slots || []).filter(Boolean);
    const arsenal = ownedWeapons.length ? ownedWeapons : ["pistol"];

    if (sim) {
      const alive = [...sim.players.values()].filter((p) => p.state === "alive");
      const readyCount = alive.filter((p) => p.ready).length;
      const isReady = !!player.ready;
      this.el.shopReady.textContent = isReady
        ? `◢ UNREADY · ${readyCount}/${alive.length} ◣`
        : `◢ READY · SKIP (${readyCount}/${alive.length}) ◣`;
      this.el.shopReady.classList.toggle("unready", isReady);
    }

    if (this.el.shopNextTitle) this.el.shopNextTitle.textContent = `WAVE ${pad2((sim?.wave ?? 0) + 1)}`;
    if (this.el.shopNextDesc) {
      const est = Math.round(8 + (sim?.wave ?? 0) * 4.5);
      this.el.shopNextDesc.textContent = `~${est} HOSTILES INBOUND`;
    }

    const itemEntries = SHOP_ITEMS.map((it) => {
      const can = it.canBuy(player, sim);
      const cost = it.cost(player, sim);
      const afford = player.cash >= cost && can;
      return { it, cost, afford, can };
    });
    const reviveAvail = !!sim && [...sim.players.values()].some((o) => o.id !== player.id && o.state === "dead" && o.lives > 0);

    const sig = JSON.stringify({
      cash: player.cash,
      inv: [...ownedWeapons].sort(),
      packed: player.slotPacked || [],
      upg: player.upgrades,
      armor: player.armor,
      hp: player.hp,
      maxHp: player.maxHp,
      weapon: player.weapon,
      revive: reviveAvail,
      items: itemEntries.map((e) => [e.it.id, e.cost, e.afford, e.can]),
      squad: sim ? [...sim.players.values()].map((o) => [o.id, o.name, o.state, !!o.ready]) : [],
    });
    if (this._shopSig === sig) return;
    this._shopSig = sig;

    this.el.shopItems.innerHTML = this._buildShopSections(player, itemEntries);

    this.el.shopItems.querySelectorAll("[data-buy]").forEach((card) => {
      const id = card.dataset.buy;
      if (card.classList.contains("disabled")) return;
      card.addEventListener("click", () => this.handlers.buy?.(id));
    });

    if (this.el.shopEquip) {
      this.el.shopEquip.innerHTML = arsenal.map((wid) => {
        const eq = player.weapon === wid;
        const slotIdx = (player.slots || []).findIndex((s) => s === wid);
        const packed = slotIdx >= 0 && !!(player.slotPacked || [])[slotIdx];
        return `<button class="equip-card ${eq ? "active" : ""}" data-equip="${wid}">
  <span class="equip-card-art">${WEAPON_SVG[wid] || ""}</span>
  <span class="equip-card-name">${WEAPONS[wid].name}${packed ? " +" : ""}</span>
</button>`;
      }).join("");
      this.el.shopEquip.querySelectorAll("[data-equip]").forEach((b) => {
        b.addEventListener("click", () => this.handlers.equip?.(b.dataset.equip));
      });
    }

    if (this.el.shopSquad && sim) {
      const rows = [...sim.players.values()].map((o) => {
        const state = o.state === "dead" ? "DEAD" : o.state === "down" ? "DOWN" : (o.ready ? "READY" : "BROWSING");
        const cls = o.state === "dead" ? "dead" : o.state === "down" ? "down" : (o.ready ? "ready" : "browsing");
        return `<div class="shop-squad-row"><span>${escape(o.name)}</span><span class="${cls}">${state}</span></div>`;
      }).join("");
      this.el.shopSquad.innerHTML = rows || `<div class="shop-squad-row"><span>—</span><span class="browsing">—</span></div>`;
    }
  }

  _buildShopSections(player, items) {
    const upgradeIds = ["upg-dmg", "upg-rate", "upg-reload", "upg-speed"];
    const supplyIds = ["heal", "armor", "life", "revive"];

    const byId = new Map(items.map((e) => [e.it.id, e]));

    const upgradeCards = upgradeIds.map((id) => {
      const e = byId.get(id); if (!e) return "";
      const meta = UPGRADE_META[id];
      const cur = player.upgrades[meta.field] || 0;
      const tiers = [];
      for (let t = 0; t < meta.max; t++) tiers.push(`<span class="shop-upgrade-tier ${t < cur ? "on" : ""}"></span>`);
      const disabled = !e.afford || cur >= meta.max;
      return `<div class="shop-upgrade ${disabled ? "disabled" : ""}" data-buy="${id}" style="color:${meta.color};border-color:${meta.color}">
  <div class="shop-upgrade-head"><div class="shop-upgrade-name">${meta.short}</div><div class="shop-upgrade-cost">$${e.cost.toLocaleString()}</div></div>
  <div class="shop-upgrade-tiers">${tiers.join("")}</div>
  <div class="shop-upgrade-foot">TIER ${cur}/${meta.max}</div>
</div>`;
    }).join("");

    const supplyCards = supplyIds.map((id) => {
      const e = byId.get(id); if (!e) return "";
      const g = SUPPLY_GLYPHS[id];
      const disabled = !e.afford;
      return `<div class="shop-supply ${disabled ? "disabled" : ""}" data-buy="${id}" style="color:${g.color};border-color:${g.color}">
  <div class="shop-supply-head"><div class="shop-supply-name">${e.it.name}</div><div class="shop-supply-cost">$${e.cost.toLocaleString()}</div></div>
  <div class="shop-supply-body">
    <div class="shop-supply-glyph">${g.glyph}</div>
    <div class="shop-supply-desc">${e.it.desc}</div>
  </div>
</div>`;
    }).join("");

    return `<div class="shop-section-head" style="color:var(--magenta)">// PROPS · IN MAP</div>
<div class="shop-props-grid">
  <div class="shop-prop"><div class="shop-prop-name">SUPPLY CRATE</div><div class="shop-prop-cost">$950</div><div class="shop-prop-desc">Random weapon · 10% boom · Walk up & press F.</div></div>
  <div class="shop-prop"><div class="shop-prop-name">BARRICADE</div><div class="shop-prop-cost">$1,000</div><div class="shop-prop-desc">Unlocks room 2. One-time purchase.</div></div>
  <div class="shop-prop"><div class="shop-prop-name">PACK-A-PUNCH</div><div class="shop-prop-cost">$10,000</div><div class="shop-prop-desc">Wave 5+. Doubles damage / mag / range / rate.</div></div>
</div>
<div class="shop-section-head">// UPGRADES</div>
<div class="shop-upgrades-grid">${upgradeCards}</div>
<div class="shop-section-head" style="color:var(--cyan)">// SUPPLIES</div>
<div class="shop-supplies-grid">${supplyCards}</div>`;
  }

  resetShopCache() { this._shopSig = null; }

  flashShopBuy(name, itemName) {
    let host = document.getElementById("shop-buy-feed");
    if (!host) {
      host = document.createElement("div");
      host.id = "shop-buy-feed";
      document.body.appendChild(host);
    }
    const row = document.createElement("div");
    row.textContent = `${name} → ${itemName}`;
    host.prepend(row);
    setTimeout(() => row.remove(), 2500);
    while (host.childElementCount > 4) host.lastChild.remove();
  }

  showGameOver({ title, win, stats, statTiles, weaponKills, zombieKills }) {
    const dot = title.endsWith(".") ? "" : ".";
    this.el.goTitle.innerHTML = `${escape(title.replace(/\.$/, ""))}<span class="go-dot">${dot || "."}</span>`;
    this.el.goTitle.classList.toggle("win", !!win);

    let html = "";
    if (Array.isArray(stats) && stats.length) {
      html += `<div class="go-subline">${stats.map(escape).join(" · ")}</div>`;
    }
    if (Array.isArray(statTiles) && statTiles.length) {
      html += `<div class="go-stats-grid">` + statTiles.map((t) => {
        const color = ({
          magenta: "var(--magenta)", cyan: "var(--cyan)", acid: "var(--acid)", yellow: "var(--yellow)", dim: "var(--dim)",
        })[t.color] || "var(--magenta)";
        return `<div class="go-stat ${t.hi ? "hi" : ""}" style="color:${color};border-color:${color};border-left-color:${color}">
  <div class="go-stat-label">${escape(t.label)}</div>
  <div class="go-stat-value">${escape(t.value)}</div>
</div>`;
      }).join("") + `</div>`;
    }
    if (Array.isArray(weaponKills) && weaponKills.length) {
      html += `<div class="shop-section-head" style="margin-top:18px;color:var(--acid)">// KILLS BY WEAPON</div>
<div class="go-weapons">` + weaponKills.map((k) => {
        const used = k.count > 0;
        return `<div class="go-weapon ${used ? "" : "unused"}">
  <div class="go-weapon-art">${WEAPON_SVG[k.id] || ""}</div>
  <div class="go-weapon-foot"><span>${escape(WEAPONS[k.id]?.name || k.id.toUpperCase())}</span><span class="go-weapon-count">${k.count}</span></div>
</div>`;
      }).join("") + `</div>`;
    }
    if (Array.isArray(zombieKills) && zombieKills.length) {
      const zombieColors = {
        normal: "var(--magenta)",
        sprinter: "var(--cyan)",
        brute: "var(--yellow)",
        "volt-fuse": "var(--acid)",
      };
      html += `<div class="shop-section-head" style="margin-top:18px;color:var(--cyan)">// HOSTILES NEUTRALIZED</div>
<div class="go-zombies">` + zombieKills.map((z) => {
        const used = z.count > 0;
        const color = zombieColors[z.kind] || "var(--magenta)";
        return `<div class="go-zombie ${used ? "" : "unused"}" style="border-color:${color};color:${color}">
  <div class="go-zombie-count">${z.count}</div>
  <div class="go-zombie-label">${escape(z.label)}</div>
</div>`;
      }).join("") + `</div>`;
    }
    this.el.goStats.innerHTML = html;
  }
}

function pad2(n) { return String(n).padStart(2, "0"); }

function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad2(m)}:${pad2(ss)}`;
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
