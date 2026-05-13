export async function mountVersion() {
  const el = document.getElementById("version");
  if (!el) return;
  try {
    const res = await fetch("./version.json", { cache: "no-store" });
    const { version } = await res.json();
    el.textContent = `v${version}`;
  } catch {
    el.textContent = "v?";
  }
}
