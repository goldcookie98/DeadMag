// DeadMag — Skin / Crate Shop overlay.
// Six screens: hub, opening spinner, reveal, inventory, catalog. State lives
// in localStorage so the player keeps coins/keys/inventory across sessions.

import { SKIN_PAL, RARITY, SKINS, SKINS_BY_ID, renderSkin, renderCrate, buildSpinnerStrip } from "./skins.js";

const STATE_KEY = "deadmag.skins.v1";
const STARTING_COINS = 4820;
const STARTING_KEYS = 2;
const KEY_COST = 1200;

const ID_POOL = SKINS.map(s => s.id);

let state = load();
let onCloseCb = null;
let root, screenWrap;

function load() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return {
        coins: typeof v.coins === "number" ? v.coins : STARTING_COINS,
        keys: typeof v.keys === "number" ? v.keys : STARTING_KEYS,
        inventory: Array.isArray(v.inventory) ? v.inventory.filter(id => SKINS_BY_ID[id]) : ["steel"],
        equipped: SKINS_BY_ID[v.equipped] ? v.equipped : "steel",
        lastObtained: v.lastObtained || {},
      };
    }
  } catch {}
  return { coins: STARTING_COINS, keys: STARTING_KEYS, inventory: ["steel"], equipped: "steel", lastObtained: {} };
}

function save() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
}

export function getEquippedSkin() { return state.equipped; }
export function hasUnopenedCrate() { return state.keys > 0; }
export function getSkinCount() { return state.inventory.length; }

// ─── public mount ─────────────────────────────────────────────────────────
export function mountSkinShop(rootEl, { onClose } = {}) {
  root = rootEl;
  onCloseCb = onClose;
  root.classList.add("skin-shop");
  root.innerHTML = "";
  screenWrap = document.createElement("div");
  screenWrap.className = "ss-screen-wrap";
  root.appendChild(screenWrap);
  showHub();
}

export function openSkinShop() { if (root) { root.classList.remove("hidden"); showHub(); } }
export function closeSkinShop() { if (root) root.classList.add("hidden"); }

// ─── shared chrome ────────────────────────────────────────────────────────
function setScreen(name, builder) {
  screenWrap.innerHTML = "";
  const screen = document.createElement("div");
  screen.className = `ss-screen ss-screen-${name}`;
  screenWrap.appendChild(screen);
  builder(screen);
}

function header(screen, title, sub, { showTabs = true } = {}) {
  const hdr = document.createElement("div");
  hdr.className = "ss-header";
  hdr.innerHTML = `
    <div class="ss-header-bar">
      <div class="ss-header-title">${title}</div>
      <div class="ss-header-sub">${sub}</div>
      <div class="ss-header-right">
        <span class="ss-chip ss-chip-acid"><span class="ss-chip-dot"></span>COINS <b>${state.coins.toLocaleString()}</b></span>
        <span class="ss-chip ss-chip-yellow"><span class="ss-chip-dot"></span>KEYS <b>${state.keys}</b></span>
        <button class="ss-close" data-act="close" title="back to menu">✕ MENU</button>
      </div>
    </div>`;
  screen.appendChild(hdr);

  if (showTabs) {
    const tabs = document.createElement("div");
    tabs.className = "ss-tabs";
    tabs.innerHTML = `
      <button class="ss-tab" data-tab="hub">CRATES</button>
      <button class="ss-tab" data-tab="inventory">INVENTORY <span class="ss-tab-count">${state.inventory.length}/12</span></button>
      <button class="ss-tab" data-tab="catalog">CATALOG</button>`;
    screen.appendChild(tabs);
    tabs.querySelectorAll("[data-tab]").forEach(b => {
      b.addEventListener("click", () => {
        if (b.dataset.tab === "hub") showHub();
        else if (b.dataset.tab === "inventory") showInventory();
        else if (b.dataset.tab === "catalog") showCatalog();
      });
    });
  }

  hdr.querySelector("[data-act=close]").addEventListener("click", () => {
    onCloseCb?.();
  });
}

function scanlineOverlay() {
  const d = document.createElement("div");
  d.className = "ss-scan";
  return d;
}

// ─── 01 · Hub / Crate shop ────────────────────────────────────────────────
function showHub() {
  setScreen("hub", screen => {
    header(screen, "ARMORY · CRATES", "// COSMETIC ITEMS ONLY · NO PAY-TO-WIN");

    const body = document.createElement("div");
    body.className = "ss-hub-body";
    screen.appendChild(body);

    // LEFT — featured crate
    const left = document.createElement("div");
    left.className = "ss-hub-left";
    left.innerHTML = `<div class="ss-hub-spotlight"></div>`;
    const crateWrap = document.createElement("div");
    crateWrap.className = "ss-hub-crate";
    crateWrap.appendChild(renderCrate(340));
    left.appendChild(crateWrap);
    left.insertAdjacentHTML("beforeend", `
      <div class="ss-hub-crate-meta">
        <div class="ss-hub-crate-title">TIER-7 SUPPLY CRATE</div>
        <div class="ss-hub-crate-sub">GUARANTEED 1 OF 12 SKINS · 3% LEGENDARY</div>
      </div>`);
    body.appendChild(left);

    // RIGHT — drop rates + contents + buy buttons
    const right = document.createElement("div");
    right.className = "ss-hub-right";

    // drop rates
    const drops = document.createElement("div");
    drops.className = "ss-panel ss-panel-magenta";
    let rows = "";
    for (const [k, r] of Object.entries(RARITY)) {
      rows += `
        <div class="ss-drop-row">
          <div class="ss-drop-label"><span class="ss-drop-dot" style="background:${r.color};box-shadow:0 0 8px ${r.color}"></span><span style="color:${r.color}">${r.name}</span></div>
          <div class="ss-drop-bar"><div style="width:${r.drop};background:${r.color};box-shadow:0 0 12px ${r.color}"></div></div>
          <div class="ss-drop-pct">${r.drop}</div>
        </div>`;
    }
    drops.innerHTML = `
      <div class="ss-panel-head">
        <div class="ss-panel-title">DROP RATES</div>
        <div class="ss-panel-sub">// CLIENT-SIDE PROVABLY-FAIR</div>
      </div>
      ${rows}`;
    right.appendChild(drops);

    // contents
    const contents = document.createElement("div");
    contents.className = "ss-panel ss-panel-cyan";
    contents.innerHTML = `
      <div class="ss-panel-head">
        <div class="ss-panel-title">CONTAINS</div>
        <div class="ss-panel-sub">12 SKINS</div>
      </div>
      <div class="ss-contents-grid"></div>`;
    const grid = contents.querySelector(".ss-contents-grid");
    for (const s of SKINS) {
      const r = RARITY[s.tier];
      const cell = document.createElement("div");
      cell.className = "ss-contents-cell";
      cell.style.borderColor = `${r.color}66`;
      cell.style.background = `${r.color}11`;
      cell.appendChild(renderSkin(s.id, 50));
      grid.appendChild(cell);
    }
    right.appendChild(contents);

    // buy buttons
    const actions = document.createElement("div");
    actions.className = "ss-hub-actions";
    const openBtn = document.createElement("button");
    openBtn.className = "ss-btn ss-btn-primary";
    openBtn.disabled = state.keys < 1;
    openBtn.innerHTML = `
      <div><div class="ss-btn-label">OPEN × 1</div><div class="ss-btn-sub">USE 1 KEY</div></div>
      <div class="ss-btn-arrow">▶</div>`;
    openBtn.addEventListener("click", () => {
      if (state.keys < 1) return;
      state.keys -= 1; save();
      runOpening();
    });

    const buyBtn = document.createElement("button");
    buyBtn.className = "ss-btn ss-btn-acid";
    buyBtn.disabled = state.coins < KEY_COST;
    buyBtn.innerHTML = `
      <div><div class="ss-btn-label">BUY KEY</div><div class="ss-btn-sub">⬢ ${KEY_COST.toLocaleString()} COINS</div></div>
      <div class="ss-btn-arrow">+</div>`;
    buyBtn.addEventListener("click", () => {
      if (state.coins < KEY_COST) return;
      state.coins -= KEY_COST; state.keys += 1; save();
      showHub();
    });

    actions.appendChild(openBtn);
    actions.appendChild(buyBtn);
    right.appendChild(actions);

    body.appendChild(right);
    screen.appendChild(scanlineOverlay());
  });
}

// ─── 02 · Opening spinner ─────────────────────────────────────────────────
function pickWinner() {
  // weighted by RARITY.dropN
  const tierRoll = Math.random() * 100;
  let acc = 0;
  let chosenTier = "common";
  for (const [k, r] of Object.entries(RARITY)) {
    acc += r.dropN;
    if (tierRoll <= acc) { chosenTier = k; break; }
  }
  const pool = SKINS.filter(s => s.tier === chosenTier);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

function runOpening() {
  const winnerId = pickWinner();

  setScreen("opening", screen => {
    header(screen, "OPENING · TIER-7", "// HOLD STEADY", { showTabs: false });

    const wash = document.createElement("div");
    wash.className = "ss-opening-wash";
    screen.appendChild(wash);

    const callout = document.createElement("div");
    callout.className = "ss-opening-callout";
    callout.textContent = "DECRYPTING…";
    screen.appendChild(callout);
    const calloutSub = document.createElement("div");
    calloutSub.className = "ss-opening-callout-sub";
    calloutSub.textContent = "SLOWING · TARGET ACQUIRING";
    screen.appendChild(calloutSub);

    // spinner viewport
    const viewport = document.createElement("div");
    viewport.className = "ss-opening-viewport";
    screen.appendChild(viewport);

    // build strip with the winner placed at a known index
    const tileSize = 220, gap = 16;
    const stepW = tileSize + gap;
    const WINNING_INDEX = 50;
    const TOTAL = 64;
    const ids = [];
    for (let i = 0; i < TOTAL; i++) ids.push(ID_POOL[Math.floor(Math.random() * ID_POOL.length)]);
    ids[WINNING_INDEX] = winnerId;

    const strip = buildSpinnerStrip(ids, tileSize, gap);
    strip.classList.add("ss-opening-strip");
    viewport.appendChild(strip);

    // side fades + center marker
    viewport.appendChild(Object.assign(document.createElement("div"), { className: "ss-opening-fade-l" }));
    viewport.appendChild(Object.assign(document.createElement("div"), { className: "ss-opening-fade-r" }));
    const marker = document.createElement("div");
    marker.className = "ss-opening-marker";
    marker.innerHTML = `<div class="ss-opening-marker-top"></div><div class="ss-opening-marker-bot"></div>`;
    viewport.appendChild(marker);

    // progress bar
    const prog = document.createElement("div");
    prog.className = "ss-opening-progress";
    prog.innerHTML = `
      <div class="ss-opening-progress-labels">
        <span>DECRYPT</span><span class="ss-opening-progress-pct">0%</span>
      </div>
      <div class="ss-opening-progress-bar"><div class="ss-opening-progress-fill"></div></div>`;
    screen.appendChild(prog);

    const skipHint = document.createElement("div");
    skipHint.className = "ss-opening-skip";
    skipHint.textContent = "[SPACE / CLICK] FAST-FORWARD";
    screen.appendChild(skipHint);

    screen.appendChild(scanlineOverlay());

    // animate: measure viewport, compute target offset, kick a CSS transition.
    requestAnimationFrame(() => {
      const vw = viewport.clientWidth;
      // jitter so it doesn't always stop dead-center on the tile
      const jitter = (Math.random() - 0.5) * (tileSize * 0.35);
      const targetX = vw / 2 - (WINNING_INDEX * stepW + tileSize / 2) + jitter;
      const startX = vw / 2 - (2 * stepW + tileSize / 2);

      strip.style.transform = `translate3d(${startX}px, 0, 0)`;
      // force reflow before kicking transition
      void strip.offsetWidth;
      const DURATION = 5400;
      strip.style.transition = `transform ${DURATION}ms cubic-bezier(0.08, 0.82, 0.17, 1)`;
      strip.style.transform = `translate3d(${targetX}px, 0, 0)`;

      const fill = prog.querySelector(".ss-opening-progress-fill");
      const pct = prog.querySelector(".ss-opening-progress-pct");
      const t0 = performance.now();
      let pulseId = 0;
      const tick = () => {
        const p = Math.min(1, (performance.now() - t0) / DURATION);
        const eased = 1 - Math.pow(1 - p, 1.4);
        fill.style.width = `${Math.round(eased * 100)}%`;
        pct.textContent = `${Math.round(eased * 100)}%`;
        if (p < 1) pulseId = requestAnimationFrame(tick);
        else {
          setTimeout(() => revealWinner(winnerId), 350);
        }
      };
      pulseId = requestAnimationFrame(tick);

      const skip = () => {
        cancelAnimationFrame(pulseId);
        strip.style.transition = "transform 220ms ease-out";
        strip.style.transform = `translate3d(${targetX}px, 0, 0)`;
        setTimeout(() => revealWinner(winnerId), 240);
        window.removeEventListener("keydown", onKey);
        viewport.removeEventListener("click", skip);
      };
      const onKey = (e) => { if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); skip(); } };
      window.addEventListener("keydown", onKey, { once: true });
      viewport.addEventListener("click", skip, { once: true });
    });
  });
}

// ─── 03 · Reveal ──────────────────────────────────────────────────────────
function revealWinner(id) {
  const meta = SKINS_BY_ID[id];
  const tier = RARITY[meta.tier];
  const wasNew = !state.inventory.includes(id);
  if (wasNew) state.inventory.push(id);
  state.lastObtained[id] = new Date().toISOString().slice(0, 10);
  // duplicates earn coins
  if (!wasNew) state.coins += Math.round({ common: 40, rare: 120, epic: 260, legendary: 600 }[meta.tier]);
  save();

  setScreen("reveal", screen => {
    header(screen, "UNLOCKED", `// ${tier.name} DROP`, { showTabs: false });

    // rays
    const rays = document.createElement("div");
    rays.className = "ss-reveal-rays";
    let raysHtml = "";
    for (let i = 0; i < 24; i++) {
      raysHtml += `<div class="ss-reveal-ray" style="background:linear-gradient(180deg, transparent 0%, ${tier.color} 60%, transparent 100%);transform:rotate(${i*15}deg)"></div>`;
    }
    rays.innerHTML = raysHtml;
    screen.appendChild(rays);

    // banner
    const banner = document.createElement("div");
    banner.className = "ss-reveal-banner-wrap";
    banner.innerHTML = `<div class="ss-reveal-banner" style="background:${tier.color};box-shadow:0 0 48px ${tier.glow}">${tier.name}</div>`;
    screen.appendChild(banner);

    // skin
    const skinWrap = document.createElement("div");
    skinWrap.className = "ss-reveal-skin skin-float";
    skinWrap.appendChild(renderSkin(id, 320));
    screen.appendChild(skinWrap);

    // name plate
    const name = document.createElement("div");
    name.className = "ss-reveal-name-wrap";
    name.innerHTML = `
      <div class="ss-reveal-name" style="text-shadow:0 0 32px ${tier.color}, 4px 0 0 ${SKIN_PAL.magenta}55, -4px 0 0 ${SKIN_PAL.cyan}55">${meta.name.toUpperCase()}</div>
      <div class="ss-reveal-sub">◆ ${meta.sub.toUpperCase()} ◆${wasNew ? "" : " · DUPLICATE · COINS REFUNDED"}</div>`;
    screen.appendChild(name);

    // actions
    const actions = document.createElement("div");
    actions.className = "ss-reveal-actions";
    const equip = document.createElement("button");
    equip.className = "ss-rbtn ss-rbtn-acid";
    equip.innerHTML = `EQUIP NOW <span class="ss-rbtn-key">F</span>`;
    equip.addEventListener("click", () => { state.equipped = id; save(); showInventory(); });

    const inv = document.createElement("button");
    inv.className = "ss-rbtn ss-rbtn-fg";
    inv.innerHTML = `INVENTORY <span class="ss-rbtn-key">I</span>`;
    inv.addEventListener("click", showInventory);

    const again = document.createElement("button");
    again.className = "ss-rbtn ss-rbtn-magenta";
    again.disabled = state.keys < 1;
    again.innerHTML = `OPEN AGAIN <span class="ss-rbtn-key">SPACE</span>`;
    again.addEventListener("click", () => {
      if (state.keys < 1) { showHub(); return; }
      state.keys -= 1; save();
      runOpening();
    });

    actions.appendChild(equip);
    actions.appendChild(inv);
    actions.appendChild(again);
    screen.appendChild(actions);

    const onKey = (e) => {
      if (e.key === "f" || e.key === "F") equip.click();
      else if (e.key === "i" || e.key === "I") inv.click();
      else if (e.key === " ") { e.preventDefault(); again.click(); }
      else return;
      window.removeEventListener("keydown", onKey);
    };
    window.addEventListener("keydown", onKey);

    screen.appendChild(scanlineOverlay());
  });
}

// ─── 04 · Inventory ───────────────────────────────────────────────────────
function showInventory() {
  setScreen("inventory", screen => {
    header(screen, "INVENTORY", `// ${state.inventory.length} / 12 SKINS UNLOCKED`);

    const body = document.createElement("div");
    body.className = "ss-inv-body";
    screen.appendChild(body);

    // equipped panel
    const equippedId = state.equipped;
    const eMeta = SKINS_BY_ID[equippedId];
    const eTier = RARITY[eMeta.tier];
    const eqPanel = document.createElement("div");
    eqPanel.className = "ss-inv-equipped";
    const obtained = state.lastObtained[equippedId] || "—";
    eqPanel.innerHTML = `
      <div class="ss-inv-eq-tag">▌EQUIPPED▐</div>
      <div class="ss-inv-eq-skin"></div>
      <div class="ss-inv-eq-name">${eMeta.name.toUpperCase()}</div>
      <div class="ss-inv-eq-tier" style="color:${eTier.color}">◆ ${eTier.name}${eMeta.animated ? " · ANIMATED" : ""}</div>
      <div class="ss-inv-eq-divider"></div>
      <div class="ss-inv-eq-meta">
        <div>OBTAINED <span>${obtained}</span></div>
        <div>FROM <span>TIER-7 CRATE</span></div>
        <div>WEAR <span style="color:${SKIN_PAL.acid}">FACTORY NEW</span></div>
      </div>`;
    eqPanel.querySelector(".ss-inv-eq-skin").appendChild(renderSkin(equippedId, 160));
    body.appendChild(eqPanel);

    // grid
    const grid = document.createElement("div");
    grid.className = "ss-inv-grid";
    for (const s of SKINS) {
      const owned = state.inventory.includes(s.id);
      const isEq = s.id === equippedId;
      const tier = RARITY[s.tier];
      const tile = document.createElement("button");
      tile.className = `ss-inv-tile ${owned ? "owned" : "locked"} ${isEq ? "equipped" : ""}`;
      tile.style.borderColor = tier.color;
      tile.style.background = `linear-gradient(180deg, ${tier.color}22 0%, ${tier.color}05 60%, transparent 100%), #0E0521`;
      tile.style.boxShadow = `0 0 20px -8px ${tier.glow}`;
      tile.disabled = !owned;
      tile.innerHTML = `
        <div class="ss-inv-tag" style="background:${tier.color}">${tier.name}</div>
        <div class="ss-inv-tile-skin"></div>
        <div class="ss-inv-tile-name">${s.name.toUpperCase()}</div>
        <div class="ss-inv-tile-sub">${s.animated ? "◆ ANIMATED" : `// ${s.tier.toUpperCase()}`}</div>
        ${isEq ? `<div class="ss-inv-tile-equipped">● EQUIPPED</div>` : ""}
        ${!owned ? `<div class="ss-inv-tile-lock">🔒 LOCKED</div>` : ""}`;
      const slot = tile.querySelector(".ss-inv-tile-skin");
      slot.appendChild(renderSkin(s.id, 92));
      if (!owned) slot.style.filter = "grayscale(0.9) brightness(0.45)";
      tile.addEventListener("click", () => {
        if (!owned) return;
        state.equipped = s.id; save();
        showInventory();
      });
      grid.appendChild(tile);
    }
    body.appendChild(grid);

    screen.appendChild(scanlineOverlay());
  });
}

// ─── 05 · Catalog ─────────────────────────────────────────────────────────
function showCatalog() {
  setScreen("catalog", screen => {
    header(screen, "SKIN CATALOG", "// 12 SKINS · 4 RARITY TIERS");

    const body = document.createElement("div");
    body.className = "ss-cat-body";
    screen.appendChild(body);

    for (const t of ["common", "rare", "epic", "legendary"]) {
      const r = RARITY[t];
      const items = SKINS.filter(s => s.tier === t);
      const row = document.createElement("div");
      row.className = "ss-cat-row";
      row.innerHTML = `
        <div class="ss-cat-label" style="border-left-color:${r.color};background:linear-gradient(180deg, ${r.color}22, transparent)">
          <div class="ss-cat-label-title" style="color:${r.color}">${r.name}</div>
          <div class="ss-cat-label-sub">DROP ${r.drop} · ${items.length} SKIN${items.length === 1 ? "" : "S"}</div>
          ${t === "legendary" ? `<div class="ss-cat-label-anim" style="color:${r.color}">◆ ALL ANIMATED</div>` : ""}
        </div>
        <div class="ss-cat-items"></div>`;
      const itemsEl = row.querySelector(".ss-cat-items");
      itemsEl.style.gridTemplateColumns = `repeat(${items.length}, 1fr)`;
      for (const s of items) {
        const owned = state.inventory.includes(s.id);
        const cell = document.createElement("div");
        cell.className = "ss-cat-cell";
        cell.style.borderColor = `${r.color}66`;
        cell.style.background = `linear-gradient(180deg, ${r.color}11, transparent 60%), #0E0521`;
        const skinSize = t === "legendary" ? 96 : 76;
        cell.innerHTML = `
          <div class="ss-cat-skin"></div>
          <div class="ss-cat-name">${s.name.toUpperCase()}</div>
          <div class="ss-cat-sub">${s.animated ? "ANIMATED" : "//"}${owned ? "" : " · LOCKED"}</div>`;
        const slot = cell.querySelector(".ss-cat-skin");
        slot.appendChild(renderSkin(s.id, skinSize));
        if (!owned) slot.style.filter = "grayscale(0.9) brightness(0.45)";
        itemsEl.appendChild(cell);
      }
      body.appendChild(row);
    }

    screen.appendChild(scanlineOverlay());
  });
}
