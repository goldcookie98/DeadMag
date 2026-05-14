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
    default:
      return { ok: false, message: `unknown cheat: ${code}` };
  }
}
