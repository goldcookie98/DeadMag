// DeadMag — Player Circle Skins (vanilla port of design/skins/skin-art.jsx
// + design/skins/crate-art.jsx).
//
// 12 skins, 9 static + 3 animated legendaries. Every skin is a self-contained
// circular DOM tree with a forward-pointing notch at 12 o'clock so it reads
// as the top-down player.

export const SKIN_PAL = {
  bg: "#08020F",
  fg: "#F4ECFF",
  dim: "#8E6BB8",
  magenta: "#FF1F6E",
  cyan: "#2EFFE5",
  acid: "#B6FF2E",
  yellow: "#FFE03E",
  ink: "#0E0521",
};

export const RARITY = {
  common:    { name: "COMMON",    color: "#8E9FAE", glow: "rgba(142,159,174,0.55)", drop: "60%", dropN: 60 },
  rare:      { name: "RARE",      color: "#2EFFE5", glow: "rgba(46,255,229,0.55)",  drop: "25%", dropN: 25 },
  epic:      { name: "EPIC",      color: "#B266FF", glow: "rgba(178,102,255,0.65)", drop: "12%", dropN: 12 },
  legendary: { name: "LEGENDARY", color: "#FFE03E", glow: "rgba(255,224,62,0.75)",  drop: "3%",  dropN: 3  },
};

export const SKINS = [
  { id: "steel",     name: "Steel",         tier: "common",    sub: "Standard issue gunmetal." },
  { id: "crimson",   name: "Crimson Crest", tier: "common",    sub: "Squad-painted blood red." },
  { id: "jade",      name: "Jade Halves",   tier: "common",    sub: "Two-tone bivouac green." },
  { id: "desert",    name: "Desert Camo",   tier: "common",    sub: "Tan splotches, NATO pattern." },
  { id: "circuit",   name: "Circuit Board", tier: "rare",      sub: "Live traces, soldered nodes." },
  { id: "hazard",    name: "Hazard Tape",   tier: "rare",      sub: "Striped warning chassis." },
  { id: "frost",     name: "Frostbite",     tier: "rare",      sub: "Crystalline ice-armor." },
  { id: "neongrid",  name: "Neon Grid",     tier: "epic",      sub: "Wireframe holo-shell." },
  { id: "biohazard", name: "Biohazard",     tier: "epic",      sub: "Class-IV containment paint." },
  { id: "void",      name: "Void Vortex",   tier: "legendary", sub: "Singularity contained.",  animated: true },
  { id: "phoenix",   name: "Phoenix Core",  tier: "legendary", sub: "Self-cremating plasma.",  animated: true },
  { id: "glitch",    name: "Glitch.exe",    tier: "legendary", sub: "Unstable executable.",    animated: true },
];

export const SKINS_BY_ID = Object.fromEntries(SKINS.map(s => [s.id, s]));

// ─── one-time CSS injection: keyframes shared across skins + crate ─────────
if (typeof document !== "undefined" && !document.getElementById("skin-anims")) {
  const s = document.createElement("style");
  s.id = "skin-anims";
  s.textContent = `
    @keyframes skin-spin       { to { transform: rotate(360deg); } }
    @keyframes skin-spin-rev   { to { transform: rotate(-360deg); } }
    @keyframes skin-pulse      { 0%,100%{opacity:.55} 50%{opacity:1} }
    @keyframes skin-flicker    { 0%,100%{opacity:.9} 47%{opacity:.55} 50%{opacity:1} 53%{opacity:.7} }
    @keyframes skin-hue        { to { filter: hue-rotate(360deg); } }
    @keyframes skin-glitch-x   {
      0%,100% { transform: translate(0,0) }
      12%     { transform: translate(-3px, 1px) }
      28%     { transform: translate(2px, -2px) }
      44%     { transform: translate(-2px, -1px) }
      58%     { transform: translate(3px, 2px) }
      76%     { transform: translate(-1px, 0) }
    }
    @keyframes skin-glitch-y   {
      0%,100% { transform: translateY(0) }
      33%     { transform: translateY(2px) }
      66%     { transform: translateY(-3px) }
    }
    @keyframes skin-scan       { from { transform: translateY(-100%) } to { transform: translateY(100%) } }
    @keyframes skin-float      { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
    @keyframes crate-shimmer   { to { background-position: 200% 0 } }
    @keyframes crate-lid       { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-2px) } }
    @keyframes spark-orbit     { to { transform: rotate(360deg) translateX(var(--r)) rotate(-360deg) } }
    @keyframes skin-rays-spin  { to { transform: translate(-50%, -50%) rotate(360deg) } }

    .skin-spin-slow    { animation: skin-spin 9s linear infinite; transform-origin: center; }
    .skin-spin-med     { animation: skin-spin 4.5s linear infinite; transform-origin: center; }
    .skin-spin-fast    { animation: skin-spin 2.4s linear infinite; transform-origin: center; }
    .skin-spin-rev     { animation: skin-spin-rev 6s linear infinite; transform-origin: center; }
    .skin-pulse        { animation: skin-pulse 1.6s ease-in-out infinite; }
    .skin-flicker      { animation: skin-flicker 2.3s steps(8,end) infinite; }
    .skin-hue          { animation: skin-hue 4s linear infinite; }
    .skin-glitch-x     { animation: skin-glitch-x 1.4s steps(8,end) infinite; }
    .skin-glitch-y     { animation: skin-glitch-y 1.1s steps(6,end) infinite; }
    .skin-scan         { animation: skin-scan 1.8s linear infinite; }
    .skin-float        { animation: skin-float 3.4s ease-in-out infinite; }
    .crate-shimmer-anim{ background-size: 200% 100%; animation: crate-shimmer 3.2s linear infinite; }
    .crate-lid-anim    { animation: crate-lid 2.6s ease-in-out infinite; }
  `;
  document.head.appendChild(s);
}

// ─── helpers ──────────────────────────────────────────────────────────────
function h(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(tag.startsWith("svg") || tag === "svg" || SVG_TAGS.has(tag)
    ? "http://www.w3.org/2000/svg" : "http://www.w3.org/1999/xhtml", tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "class") el.setAttribute("class", v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    if (Array.isArray(kid)) for (const c of kid) if (c) el.appendChild(c);
    else if (typeof kid === "string") el.appendChild(document.createTextNode(kid));
    else el.appendChild(kid);
  }
  return el;
}
const SVG_TAGS = new Set(["svg","g","path","rect","circle","ellipse","line","defs","linearGradient","radialGradient","stop","filter","feGaussianBlur","feMerge","feMergeNode","polygon","mask"]);

function forwardNotch(size, color = "#0c0c0c") {
  const w = size * 0.16, ht = size * 0.10;
  return h("div", {
    style: {
      position: "absolute",
      top: `${-ht * 0.45}px`,
      left: "50%",
      transform: "translateX(-50%)",
      width: `${w}px`, height: `${ht}px`,
      background: color,
      clipPath: "polygon(50% 0, 100% 100%, 0 100%)",
      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
      zIndex: 3,
    },
  });
}

function frame(size, rim, glow, ...kids) {
  const inner = h("div", { style: { width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", position: "relative" } }, ...kids);
  const rimW = Math.max(1, size * 0.012);
  return h("div", {
    style: {
      width: `${size}px`, height: `${size}px`, position: "relative",
      borderRadius: "50%",
      boxShadow: glow
        ? `0 0 ${size * 0.18}px ${glow}, inset 0 0 0 ${rimW}px ${rim}`
        : `inset 0 0 0 ${rimW}px ${rim}`,
    },
  }, inner);
}

// ─── COMMON × 4 ────────────────────────────────────────────────────────────
function SteelSkin(size) {
  const rivets = [];
  const r = size * 0.42;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    rivets.push(h("div", { style: {
      position: "absolute",
      left: `calc(50% + ${Math.cos(a) * r}px - ${size * 0.04}px)`,
      top:  `calc(50% + ${Math.sin(a) * r}px - ${size * 0.04}px)`,
      width: `${size * 0.08}px`, height: `${size * 0.08}px`, borderRadius: "50%",
      background: "radial-gradient(circle at 30% 30%, #c8ccd2, #4a5058 70%, #1c2026)",
      boxShadow: "inset 0 1px 1px rgba(255,255,255,0.4)",
    }}));
  }
  return frame(size, "#0008", null,
    h("div", { style: { position: "absolute", inset: 0, background: "radial-gradient(circle at 35% 30%, #9ba3ad 0%, #5a626b 55%, #2c323a 100%)" }}),
    h("div", { style: { position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(90deg, transparent 0, transparent 2px, rgba(255,255,255,0.04) 2px, rgba(255,255,255,0.04) 3px)" }}),
    h("div", { style: { position: "absolute", inset: "8%", borderRadius: "50%", border: `${Math.max(1, size * 0.008)}px solid rgba(0,0,0,0.35)` }}),
    ...rivets,
  );
}

function CrimsonSkin(size) {
  return frame(size, "#3a0008", null,
    h("div", { style: { position: "absolute", inset: 0, background: "radial-gradient(circle at 35% 30%, #d4203a 0%, #8b0d20 70%, #4a0612 100%)" }}),
    h("div", { style: { position: "absolute", inset: 0, background: "conic-gradient(from 0deg at 50% 50%, rgba(0,0,0,0.5) 0deg, rgba(0,0,0,0.5) 90deg, transparent 90deg)" }}),
    h("div", { style: { position: "absolute", inset: "14%", borderRadius: "50%", border: `${Math.max(1, size * 0.012)}px solid #d4a01a`, boxShadow: "0 0 6px rgba(212,160,26,0.45)" }}),
    h("div", { style: { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: `${size * 0.08}px`, height: `${size * 0.08}px`, borderRadius: "50%", background: "#d4a01a" }}),
  );
}

function JadeSkin(size) {
  return frame(size, "#001a0a", null,
    h("div", { style: { position: "absolute", inset: 0, background: "linear-gradient(180deg, #4a7a3a 0%, #4a7a3a 50%, #2a4a22 50%, #2a4a22 100%)" }}),
    h("div", { style: { position: "absolute", left: 0, right: 0, top: "50%", height: "1px", background: "#c4a85a" }}),
    h("div", { style: { position: "absolute", inset: 0, borderRadius: "50%", boxShadow: `inset 0 0 0 ${Math.max(1, size * 0.018)}px #c4a85a, inset 0 0 0 ${Math.max(2, size * 0.026)}px #5a4a1a` }}),
    h("div", { style: { position: "absolute", left: "50%", bottom: "16%", transform: "translateX(-50%)", width: `${size * 0.18}px`, height: `${size * 0.04}px`, background: "#c4a85a", clipPath: "polygon(20% 0, 80% 0, 100% 100%, 0 100%)" }}),
  );
}

function DesertSkin(size) {
  const blobs = [
    { c: "#7a5a3a", x: 28, y: 32, r: 36 },
    { c: "#4a3a22", x: 70, y: 28, r: 28 },
    { c: "#9a8462", x: 60, y: 70, r: 34 },
    { c: "#5a4a32", x: 22, y: 72, r: 26 },
    { c: "#4a3a22", x: 50, y: 50, r: 18 },
  ];
  return frame(size, "#2a1a0a", null,
    h("div", { style: { position: "absolute", inset: 0, background: "#c4a474" }}),
    ...blobs.map(b => h("div", { style: {
      position: "absolute",
      left: `${b.x - b.r/2}%`, top: `${b.y - b.r/2}%`,
      width: `${b.r}%`, height: `${b.r}%`,
      borderRadius: "50%",
      background: b.c,
      filter: "blur(1px)",
    }})),
    h("div", { style: { position: "absolute", inset: 0, borderRadius: "50%", boxShadow: `inset 0 0 ${size * 0.2}px rgba(0,0,0,0.35)` }}),
  );
}

// ─── RARE × 3 ──────────────────────────────────────────────────────────────
function CircuitSkin(size) {
  const traceCol = "#FFC233";
  const svg = h("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "none", style: { position: "absolute", inset: 0, width: "100%", height: "100%" }});
  svg.innerHTML = `
    <g fill="none" stroke="${traceCol}" stroke-width="0.8">
      <path d="M 10 30 L 30 30 L 30 50 L 60 50 L 60 20 L 90 20" />
      <path d="M 10 70 L 25 70 L 25 85 L 75 85 L 75 65 L 90 65" />
      <path d="M 50 10 L 50 35 M 50 65 L 50 95" />
    </g>
    <rect x="40" y="40" width="20" height="20" fill="#1a1a1a" stroke="${traceCol}" stroke-width="0.6" />
    <g fill="${traceCol}">
      <rect x="38" y="43" width="2" height="2" /><rect x="38" y="48" width="2" height="2" /><rect x="38" y="53" width="2" height="2" />
      <rect x="60" y="43" width="2" height="2" /><rect x="60" y="48" width="2" height="2" /><rect x="60" y="53" width="2" height="2" />
    </g>
    <g fill="${SKIN_PAL.cyan}">
      <circle cx="30" cy="30" r="1.4" /><circle cx="60" cy="50" r="1.4" /><circle cx="60" cy="20" r="1.4" />
      <circle cx="90" cy="20" r="1.4" /><circle cx="25" cy="70" r="1.4" /><circle cx="75" cy="85" r="1.4" /><circle cx="75" cy="65" r="1.4" />
    </g>`;
  return frame(size, "#001008", "rgba(46,255,229,0.25)",
    h("div", { style: { position: "absolute", inset: 0, background: "linear-gradient(135deg, #0e3a22 0%, #062614 100%)" }}),
    svg,
  );
}

function HazardSkin(size) {
  const stripe = size * 0.08;
  return frame(size, "#1a1400", "rgba(46,255,229,0.2)",
    h("div", { style: { position: "absolute", inset: 0, background: `repeating-linear-gradient(45deg, ${SKIN_PAL.yellow} 0 ${stripe}px, #0c0c0c ${stripe}px ${stripe*2}px)` }}),
    h("div", { style: {
      position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      width: `${size * 0.42}px`, height: `${size * 0.42}px`, borderRadius: "50%",
      background: "#0c0c0c",
      border: `${Math.max(1, size * 0.014)}px solid ${SKIN_PAL.yellow}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: SKIN_PAL.yellow,
      fontFamily: '"Anton", sans-serif',
      fontSize: `${size * 0.22}px`,
      lineHeight: "1",
    }}, "⚠"),
  );
}

function FrostSkin(size) {
  const svg = h("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "none", style: { position: "absolute", inset: 0, width: "100%", height: "100%" }});
  svg.innerHTML = `
    <g fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="0.6">
      <path d="M 50 10 L 30 35 L 50 50 L 70 35 Z" />
      <path d="M 30 35 L 15 55 L 35 70 L 50 50 Z" />
      <path d="M 70 35 L 50 50 L 65 70 L 85 55 Z" />
      <path d="M 50 50 L 35 70 L 50 90 L 65 70 Z" />
    </g>
    <g fill="rgba(255,255,255,0.25)">
      <path d="M 50 10 L 30 35 L 50 50 Z" />
      <path d="M 70 35 L 50 50 L 65 70 L 85 55 Z" />
    </g>`;
  return frame(size, "#001a26", "rgba(46,255,229,0.4)",
    h("div", { style: { position: "absolute", inset: 0, background: "radial-gradient(circle at 40% 30%, #eafcff 0%, #a5e0f0 30%, #4a8fa8 70%, #1a3a4a 100%)" }}),
    svg,
    h("div", { style: { position: "absolute", left: "20%", top: "15%", width: "30%", height: "20%", background: "radial-gradient(ellipse, rgba(255,255,255,0.7), transparent 70%)" }}),
  );
}

// ─── EPIC × 2 ──────────────────────────────────────────────────────────────
function NeonGridSkin(size) {
  const svg = h("svg", { viewBox: "-50 -50 100 100", style: { position: "absolute", inset: 0, width: "100%", height: "100%" }});
  let mer = "", hor = "";
  for (const x of [-40,-30,-20,-10,0,10,20,30,40]) mer += `<line x1="${x}" y1="-50" x2="${x}" y2="50" />`;
  for (const y of [-40,-25,-12,0,12,25,40]) hor += `<ellipse cx="0" cy="${y}" rx="50" ry="3" />`;
  svg.innerHTML = `
    <defs>
      <linearGradient id="ng-grad-${size}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${SKIN_PAL.magenta}" />
        <stop offset="1" stop-color="${SKIN_PAL.cyan}" />
      </linearGradient>
    </defs>
    <g stroke="url(#ng-grad-${size})" stroke-width="0.5" fill="none" opacity="0.95">${mer}${hor}</g>
    <circle cx="0" cy="0" r="4" fill="${SKIN_PAL.cyan}" class="skin-pulse" />`;
  return frame(size, "#1a002a", "rgba(178,102,255,0.55)",
    h("div", { style: { position: "absolute", inset: 0, background: "#08020F" }}),
    svg,
  );
}

function BiohazardSkin(size) {
  const svg = h("svg", { viewBox: "-50 -50 100 100", style: { position: "absolute", inset: 0, width: "100%", height: "100%" }});
  svg.innerHTML = `
    <g fill="${SKIN_PAL.acid}" stroke="#0c0c0c" stroke-width="1">
      <g transform="rotate(0)"><circle cx="0" cy="-18" r="11" /></g>
      <g transform="rotate(120)"><circle cx="0" cy="-18" r="11" /></g>
      <g transform="rotate(240)"><circle cx="0" cy="-18" r="11" /></g>
      <circle cx="0" cy="0" r="6" fill="#0c0c0c" />
      <circle cx="0" cy="0" r="3" fill="${SKIN_PAL.acid}" />
    </g>`;
  return frame(size, "#0a1a00", "rgba(182,255,46,0.55)",
    h("div", { style: { position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 30%, #6a1a8a 0%, #2a0844 70%, #100020 100%)" }}),
    h("div", { style: { position: "absolute", left: "10%", top: "20%", width: "30%", height: "30%", borderRadius: "50%", background: SKIN_PAL.acid, filter: "blur(8px)", opacity: "0.7" }}),
    h("div", { style: { position: "absolute", right: "8%", bottom: "12%", width: "36%", height: "36%", borderRadius: "50%", background: SKIN_PAL.acid, filter: "blur(10px)", opacity: "0.55" }}),
    svg,
  );
}

// ─── LEGENDARY × 3 (animated) ──────────────────────────────────────────────
function VoidSkin(size) {
  return frame(size, "#1a002a", "rgba(255,224,62,0.55)",
    h("div", { style: { position: "absolute", inset: 0, background: "#000000" }}),
    h("div", { class: "skin-spin-med", style: {
      position: "absolute", inset: "-10%",
      background: "conic-gradient(from 0deg, #FFE03E, #FF1F6E, #B266FF, #2EFFE5, #FFE03E)",
      maskImage: "radial-gradient(circle, transparent 18%, black 22%, black 70%, transparent 95%)",
      WebkitMaskImage: "radial-gradient(circle, transparent 18%, black 22%, black 70%, transparent 95%)",
      opacity: "0.85",
    }}),
    h("div", { class: "skin-spin-rev", style: {
      position: "absolute", inset: "20%",
      background: "conic-gradient(from 90deg, transparent 0%, rgba(178,102,255,0.5) 30%, transparent 50%, rgba(255,31,110,0.5) 80%, transparent 100%)",
      borderRadius: "50%",
    }}),
    h("div", { style: {
      position: "absolute", inset: "30%", borderRadius: "50%",
      background: "radial-gradient(circle, transparent 40%, rgba(255,255,255,0.4) 55%, transparent 65%)",
    }}),
    h("div", { style: {
      position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      width: `${size * 0.22}px`, height: `${size * 0.22}px`, borderRadius: "50%",
      background: "#000",
      boxShadow: `0 0 ${size*0.06}px ${size*0.02}px rgba(255,255,255,0.6), inset 0 0 ${size*0.04}px rgba(255,255,255,0.3)`,
    }}),
  );
}

function PhoenixSkin(size) {
  return frame(size, "#2a0a00", "rgba(255,140,40,0.7)",
    h("div", { style: { position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 50%, #2a0408 0%, #08020F 100%)" }}),
    h("div", { class: "skin-spin-slow skin-hue", style: {
      position: "absolute", inset: "-12%",
      background: "conic-gradient(from 0deg, #ff2a2a, #ff8a2a, #ffd44a, #ff8a2a, #ff2a2a, #ff8a2a, #ffd44a, #ff8a2a, #ff2a2a)",
      maskImage: "radial-gradient(circle, transparent 36%, black 40%, black 50%, transparent 56%)",
      WebkitMaskImage: "radial-gradient(circle, transparent 36%, black 40%, black 50%, transparent 56%)",
      filter: "blur(2px)",
      opacity: "0.95",
    }}),
    h("div", { class: "skin-spin-rev skin-hue", style: {
      position: "absolute", inset: "10%",
      background: "conic-gradient(from 0deg, transparent 0%, #ffae3a 20%, transparent 50%, #ff5a2a 70%, transparent 100%)",
      maskImage: "radial-gradient(circle, transparent 50%, black 55%, black 70%, transparent 78%)",
      WebkitMaskImage: "radial-gradient(circle, transparent 50%, black 55%, black 70%, transparent 78%)",
      filter: "blur(1.5px)",
    }}),
    h("div", { class: "skin-flicker", style: {
      position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      width: `${size * 0.38}px`, height: `${size * 0.38}px`, borderRadius: "50%",
      background: "radial-gradient(circle, #fff6c2 0%, #ffd44a 30%, #ff8a2a 60%, #ff2a2a 100%)",
      boxShadow: `0 0 ${size*0.08}px ${size*0.02}px rgba(255,170,40,0.8)`,
    }}),
    h("div", { style: {
      position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      color: "#2a0408",
      fontFamily: '"Anton", sans-serif',
      fontSize: `${size * 0.28}px`,
      textShadow: "0 0 8px rgba(255,200,80,0.8)",
      fontWeight: "700",
    }}, "▲"),
  );
}

function GlitchSkin(size) {
  const glyph = h("div", { class: "skin-glitch-x", style: { position: "relative", color: SKIN_PAL.fg }});
  glyph.innerHTML = `
    <span style="position:absolute;left:-3px;top:0;color:${SKIN_PAL.magenta};mix-blend-mode:screen;opacity:0.9">D/M</span>
    <span style="position:absolute;left:3px;top:0;color:${SKIN_PAL.cyan};mix-blend-mode:screen;opacity:0.9">D/M</span>
    <span style="position:relative">D/M</span>`;
  return frame(size, "#1a002a", "rgba(46,255,229,0.6)",
    h("div", { style: { position: "absolute", inset: 0, background: "#08020F" }}),
    h("div", { class: "skin-glitch-y", style: {
      position: "absolute", inset: 0,
      backgroundImage: `repeating-linear-gradient(90deg, transparent 0 6px, rgba(46,255,229,0.06) 6px 7px), repeating-linear-gradient(0deg, transparent 0 6px, rgba(255,31,110,0.06) 6px 7px)`,
    }}),
    h("div", { style: {
      position: "absolute", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: '"JetBrains Mono", monospace',
      fontWeight: "700",
      fontSize: `${size * 0.32}px`,
      lineHeight: "1",
    }}, glyph),
    h("div", { style: { position: "absolute", inset: 0, overflow: "hidden" }},
      h("div", { class: "skin-scan", style: {
        position: "absolute", left: 0, right: 0,
        height: `${size * 0.18}px`,
        background: "linear-gradient(180deg, transparent, rgba(46,255,229,0.25), transparent)",
        mixBlendMode: "screen",
      }}),
    ),
    h("div", { style: {
      position: "absolute", bottom: `${size * 0.08}px`, right: `${size * 0.08}px`,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: `${size * 0.05}px`,
      color: SKIN_PAL.acid,
      letterSpacing: "0.1em",
    }}, "0xFE"),
  );
}

const RENDERERS = {
  steel: SteelSkin, crimson: CrimsonSkin, jade: JadeSkin, desert: DesertSkin,
  circuit: CircuitSkin, hazard: HazardSkin, frost: FrostSkin,
  neongrid: NeonGridSkin, biohazard: BiohazardSkin,
  void: VoidSkin, phoenix: PhoenixSkin, glitch: GlitchSkin,
};

// Public: renders a skin into a wrapper div with halo + forward notch.
export function renderSkin(id, size = 180, showNotch = true) {
  const meta = SKINS_BY_ID[id];
  const Renderer = RENDERERS[id];
  if (!meta || !Renderer) return h("div");
  const tier = RARITY[meta.tier];
  const wrap = h("div", { style: { position: "relative", width: `${size}px`, height: `${size}px`, display: "inline-block" }});
  wrap.appendChild(Renderer(size));
  if (showNotch) wrap.appendChild(forwardNotch(size));
  wrap.appendChild(h("div", { style: {
    position: "absolute", inset: `${-size * 0.08}px`, borderRadius: "50%",
    boxShadow: `0 0 ${size*0.14}px ${size*0.02}px ${tier.glow}`,
    pointerEvents: "none", zIndex: "-1",
  }}));
  return wrap;
}

// ─── Loot Crate ────────────────────────────────────────────────────────────
export function renderCrate(size = 360, floating = true) {
  const w = size, ht = size * 1.05;
  const wrap = h("div", { style: {
    position: "relative",
    width: `${w}px`, height: `${ht}px`,
    animation: floating ? "skin-float 3.4s ease-in-out infinite" : "none",
  }});

  // beam
  wrap.appendChild(h("div", { style: {
    position: "absolute",
    left: "50%", top: `${-ht * 0.55}px`, transform: "translateX(-50%)",
    width: `${w * 1.4}px`, height: `${ht}px`,
    background: "linear-gradient(180deg, rgba(46,255,229,0.0) 0%, rgba(46,255,229,0.15) 40%, rgba(255,31,110,0.25) 100%)",
    clipPath: "polygon(38% 0, 62% 0, 100% 100%, 0 100%)",
    filter: "blur(2px)",
    pointerEvents: "none",
  }}));

  // ground shadow
  wrap.appendChild(h("div", { style: {
    position: "absolute",
    left: "50%", bottom: `${-ht * 0.04}px`, transform: "translateX(-50%)",
    width: `${w * 0.7}px`, height: `${ht * 0.06}px`,
    background: "radial-gradient(ellipse, rgba(255,31,110,0.55), transparent 70%)",
    filter: "blur(4px)",
  }}));

  // lid
  const lid = h("div", { class: "crate-lid-anim", style: {
    position: "absolute",
    left: `${w * 0.04}px`, top: `${ht * 0.02}px`,
    width: `${w * 0.92}px`, height: `${ht * 0.20}px`,
    background: "linear-gradient(180deg, #2a0e44 0%, #1c0830 100%)",
    clipPath: "polygon(8% 0, 92% 0, 100% 100%, 0 100%)",
    border: `2px solid ${SKIN_PAL.magenta}`,
    borderBottom: "none",
    boxShadow: "0 -4px 24px rgba(255,31,110,0.4), inset 0 4px 12px rgba(255,31,110,0.3)",
  }});
  lid.appendChild(h("div", { style: {
    position: "absolute", top: "32%", left: 0, right: 0,
    textAlign: "center",
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: `${w * 0.038}px`,
    color: SKIN_PAL.cyan,
    letterSpacing: "0.45em",
    fontWeight: "700",
    textShadow: `0 0 8px ${SKIN_PAL.cyan}`,
  }}, "TIER-7 · SUPPLY"));
  lid.appendChild(h("div", { style: { position: "absolute", left: "20%", bottom: "-6px", width: `${w * 0.08}px`, height: `${ht * 0.02}px`, background: SKIN_PAL.yellow, clipPath: "polygon(0 0, 100% 0, 90% 100%, 10% 100%)" }}));
  lid.appendChild(h("div", { style: { position: "absolute", right: "20%", bottom: "-6px", width: `${w * 0.08}px`, height: `${ht * 0.02}px`, background: SKIN_PAL.yellow, clipPath: "polygon(0 0, 100% 0, 90% 100%, 10% 100%)" }}));
  wrap.appendChild(lid);

  // body
  const body = h("div", { style: {
    position: "absolute",
    left: 0, top: `${ht * 0.20}px`,
    width: `${w}px`, height: `${ht * 0.78}px`,
    background: "linear-gradient(180deg, #1c0830 0%, #08020F 60%, #1c0830 100%)",
    clipPath: "polygon(8% 0, 92% 0, 100% 12%, 100% 88%, 92% 100%, 8% 100%, 0 88%, 0 12%)",
    border: `2px solid ${SKIN_PAL.magenta}`,
    boxShadow: "0 0 40px rgba(255,31,110,0.4), inset 0 0 40px rgba(255,31,110,0.15)",
    overflow: "hidden",
  }});
  body.appendChild(h("div", { class: "crate-shimmer-anim", style: {
    position: "absolute", inset: 0,
    background: "linear-gradient(90deg, transparent 0%, transparent 40%, rgba(46,255,229,0.18) 50%, transparent 60%, transparent 100%)",
    mixBlendMode: "screen",
    pointerEvents: "none",
  }}));

  // logo plate
  const plate = h("div", { style: {
    position: "absolute",
    left: "50%", top: "50%", transform: "translate(-50%, -50%)",
    width: `${w * 0.55}px`,
    padding: `${w * 0.04}px 0`,
    textAlign: "center",
  }});
  plate.innerHTML = `
    <div style="font-family:'Anton',sans-serif;font-size:${w*0.22}px;line-height:0.85;color:${SKIN_PAL.fg};letter-spacing:0.04em;text-shadow:4px 0 0 ${SKIN_PAL.cyan}55,-4px 0 0 ${SKIN_PAL.magenta}55,0 0 32px ${SKIN_PAL.magenta}77">
      DEAD<br><span style="color:${SKIN_PAL.magenta}">MAG.</span>
    </div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:${w*0.032}px;color:${SKIN_PAL.acid};letter-spacing:0.4em;margin-top:8px">
      ◆ CRATE.07 ◆
    </div>`;
  body.appendChild(plate);

  // keyhole
  const keyhole = h("div", { style: {
    position: "absolute",
    left: "50%", bottom: "10%", transform: "translateX(-50%)",
    width: `${w * 0.06}px`, height: `${w * 0.06}px`, borderRadius: "50%",
    background: SKIN_PAL.bg,
    border: `2px solid ${SKIN_PAL.yellow}`,
    boxShadow: `0 0 12px ${SKIN_PAL.yellow}`,
  }});
  keyhole.appendChild(h("div", { style: { position: "absolute", left: "50%", top: "60%", transform: "translateX(-50%)", width: "2px", height: `${w * 0.03}px`, background: SKIN_PAL.yellow }}));
  body.appendChild(keyhole);

  // side hazards
  body.appendChild(h("div", { style: { position: "absolute", left: 0, top: "30%", bottom: "30%", width: `${w * 0.025}px`, background: `repeating-linear-gradient(0deg, ${SKIN_PAL.yellow} 0 8px, #0c0c0c 8px 16px)` }}));
  body.appendChild(h("div", { style: { position: "absolute", right: 0, top: "30%", bottom: "30%", width: `${w * 0.025}px`, background: `repeating-linear-gradient(0deg, ${SKIN_PAL.yellow} 0 8px, #0c0c0c 8px 16px)` }}));

  // labels
  body.appendChild(h("div", { style: {
    position: "absolute", top: `${w * 0.06}px`, left: `${-w * 0.04}px`,
    transform: "rotate(-8deg)",
    background: SKIN_PAL.acid, color: SKIN_PAL.bg,
    padding: `${w * 0.012}px ${w * 0.04}px`,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: `${w * 0.03}px`,
    letterSpacing: "0.3em",
    fontWeight: "700",
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  }}, "HOSTILE"));
  body.appendChild(h("div", { style: {
    position: "absolute", bottom: `${w * 0.06}px`, right: `${-w * 0.04}px`,
    transform: "rotate(-8deg)",
    background: SKIN_PAL.cyan, color: SKIN_PAL.bg,
    padding: `${w * 0.012}px ${w * 0.04}px`,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: `${w * 0.03}px`,
    letterSpacing: "0.3em",
    fontWeight: "700",
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  }}, "▼ 12 SKINS"));

  // scanlines
  body.appendChild(h("div", { style: {
    position: "absolute", inset: 0,
    backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 4px)",
    pointerEvents: "none",
    mixBlendMode: "overlay",
  }}));

  wrap.appendChild(body);

  // orbital sparks
  for (let i = 0; i < 4; i++) {
    const orb = h("div", { style: {
      position: "absolute",
      left: "50%", top: "50%",
      width: "6px", height: "6px", marginLeft: "-3px", marginTop: "-3px",
      animation: `spark-orbit ${4 + i * 0.5}s linear infinite`,
      animationDelay: `${i * 0.4}s`,
      pointerEvents: "none",
    }});
    orb.style.setProperty("--r", `${w * 0.55}px`);
    orb.appendChild(h("div", { style: {
      width: "6px", height: "6px", borderRadius: "50%",
      background: i % 2 === 0 ? SKIN_PAL.cyan : SKIN_PAL.acid,
      boxShadow: `0 0 12px ${i % 2 === 0 ? SKIN_PAL.cyan : SKIN_PAL.acid}`,
    }}));
    wrap.appendChild(orb);
  }
  return wrap;
}

// ─── Opening Spinner ──────────────────────────────────────────────────────
// Builds a horizontal strip; caller animates the strip's transform from the
// pre-roll position to a position that lands `winningIndex` under center.
export function buildSpinnerStrip(ids, tileSize, gap) {
  const strip = h("div", { style: { display: "flex", gap: `${gap}px`, willChange: "transform" }});
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const meta = SKINS_BY_ID[id];
    const tier = RARITY[meta.tier];
    const tile = h("div", { style: {
      width: `${tileSize}px`, height: `${tileSize}px`,
      padding: "12px",
      background: `linear-gradient(180deg, ${tier.color}22, transparent 60%)`,
      border: `2px solid ${tier.color}`,
      clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: "0",
      position: "relative",
    }});
    tile.appendChild(renderSkin(id, tileSize - 50));
    tile.appendChild(h("div", { style: {
      position: "absolute", bottom: "6px", left: "12px", right: "12px",
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "10px",
      letterSpacing: "0.25em",
      color: tier.color,
      textAlign: "center",
    }}, tier.name));
    strip.appendChild(tile);
  }
  return strip;
}
