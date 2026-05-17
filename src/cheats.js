export function mountCheats({ isSolo, run }) {
  const trigger = document.getElementById("cheat-open") || document.getElementById("version");
  const panel = document.getElementById("cheat");
  const input = document.getElementById("cheat-code");
  const result = document.getElementById("cheat-result");
  const goBtn = document.getElementById("cheat-go");
  const closeBtn = document.getElementById("cheat-close");
  if (!trigger || !panel || !input || !goBtn || !closeBtn) return;

  const open = () => {
    panel.classList.remove("hidden");
    setResult("", null);
    setTimeout(() => input.focus(), 30);
  };
  const close = () => {
    panel.classList.add("hidden");
    input.value = "";
  };
  const setResult = (text, kind) => {
    result.textContent = text;
    result.className = kind || "";
  };

  trigger.addEventListener("click", open);
  closeBtn.addEventListener("click", close);

  const submit = () => {
    const code = input.value.trim().toLowerCase();
    if (!code) return;
    if (!isSolo()) {
      setResult("solo modes only — server is authoritative in MP.", "err");
      return;
    }
    const res = run(code);
    if (res?.ok) setResult(res.message || "ok", "ok");
    else setResult(res?.message || `unknown cheat: ${code}`, "err");
  };
  goBtn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") submit();
    else if (e.key === "Escape") close();
  });
}

export function applyCheat(code, { sim, localId }) {
  if (!sim) return { ok: false, message: "start a game first." };
  const me = sim.players.get(localId);
  if (!me) return { ok: false, message: "no local player." };

  switch (code) {
    case "max money":
    case "money":
      me.cash = 999999;
      return { ok: true, message: `cash set to $${me.cash}.` };

    case "god":
    case "invincible":
    case "invincibility":
      me.invincible = !me.invincible;
      me.infAmmo = me.invincible;
      me.fireRateMul = me.invincible ? 0.1 : 1;
      me.speedMul = me.invincible ? 3 : 1;
      me.noClip = me.invincible;
      me.infMoney = me.invincible;
      me.rangeMul = me.invincible ? 1000 : 1;
      if (me.invincible) me.cash = Math.max(me.cash, 999999);
      return { ok: true, message: me.invincible
        ? "god ON · invincible · 10× fire · 3× speed · no reload · noclip · ∞ range · $$$."
        : "god OFF." };

    case "one shot":
    case "oneshot":
    case "1shot":
    case "instakill":
      me.oneShot = !me.oneShot;
      return { ok: true, message: me.oneShot ? "one-shot kills ON." : "one-shot kills OFF." };

    case "double money":
    case "doublemoney":
    case "2x money":
    case "2x cash":
      me.doubleMoney = !me.doubleMoney;
      return { ok: true, message: me.doubleMoney ? "double money ON." : "double money OFF." };

    case "no delay":
    case "nodelay":
    case "rapid fire":
    case "rapidfire":
      me.noDelay = !me.noDelay;
      return { ok: true, message: me.noDelay ? "no fire delay ON." : "no fire delay OFF." };

    case "infinite ammo":
    case "inf ammo":
    case "infammo":
    case "no reload":
    case "noreload":
      me.infAmmo = !me.infAmmo;
      return { ok: true, message: me.infAmmo ? "infinite ammo ON." : "infinite ammo OFF." };

    case "all normal":
    case "normal horde":
      sim.forceZombieKind = null;
      return { ok: true, message: "zombie spawns: normal mix." };

    case "all sprinter":
    case "all sprinters":
    case "sprinter horde":
      sim.forceZombieKind = "sprinter";
      return { ok: true, message: "every spawn is a sprinter." };

    case "all brute":
    case "all brutes":
    case "brute horde":
      sim.forceZombieKind = "brute";
      return { ok: true, message: "every spawn is a brute." };

    case "all volt-fuse":
    case "all voltfuse":
    case "all exploder":
    case "all exploders":
    case "volt horde":
      sim.forceZombieKind = "volt-fuse";
      return { ok: true, message: "every spawn is a volt-fuse." };

    default:
      return { ok: false, message: `unknown cheat: ${code}` };
  }
}
