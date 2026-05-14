// End-to-end multiplayer smoke test. Requires:
//   - ws server: `node server/index.js` on :8080
//   - http server: `npx http-server -p 8000 .`
// Run: node test/mp.test.mjs
import { chromium } from "playwright";

const BASE = "http://localhost:8000/?server=ws://localhost:8080";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function dumpConsole(page, label) {
  page.on("console", (m) => console.log(`[${label}] ${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => console.log(`[${label}] PAGEERROR: ${e.message}`));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctxA = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const ctxB = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const host = await ctxA.newPage();
  const guest = await ctxB.newPage();
  await dumpConsole(host, "HOST ");
  await dumpConsole(guest, "GUEST");

  console.log("--- loading pages ---");
  await Promise.all([host.goto(BASE), guest.goto(BASE)]);

  // Wait for menu
  await host.waitForSelector("#menu");
  await guest.waitForSelector("#menu");

  console.log("--- host clicks CREATE LOBBY ---");
  await host.click('button[data-action="mp-create"]');

  // Wait for code text to populate (not "----")
  await host.waitForFunction(() => {
    const t = document.getElementById("lobby-code")?.textContent || "";
    return /^[A-Z0-9]{4}$/.test(t);
  }, { timeout: 15000 });

  const code = await host.$eval("#lobby-code", (el) => el.textContent.trim());
  console.log("HOST got room code:", code);

  console.log("--- guest clicks JOIN LOBBY ---");
  await guest.click('button[data-action="mp-join"]');
  await guest.waitForSelector("#join-code", { state: "visible" });
  await guest.fill("#join-code", code);
  await guest.click("#join-go");

  // Wait for guest lobby to render
  await guest.waitForFunction(() => {
    const c = document.getElementById("lobby-code")?.textContent || "";
    return /^[A-Z0-9]{4}$/.test(c) && !document.getElementById("lobby").classList.contains("hidden");
  }, { timeout: 15000 });
  console.log("GUEST entered lobby");

  // Wait for host lobby to show two players
  await host.waitForFunction(() => {
    const rows = document.querySelectorAll("#lobby-players .row");
    return rows.length >= 2;
  }, { timeout: 8000 });
  console.log("HOST sees 2 players");

  // Host changes mode to arsenal
  await host.click('#lobby [data-mode="arsenal"]');
  await guest.waitForFunction(() => {
    return document.querySelector('#lobby [data-mode="arsenal"]')?.classList.contains("selected");
  }, { timeout: 5000 });
  console.log("GUEST received mode change → arsenal");

  // Back to horde
  await host.click('#lobby [data-mode="horde"]');
  await guest.waitForFunction(() => {
    return document.querySelector('#lobby [data-mode="horde"]')?.classList.contains("selected");
  }, { timeout: 5000 });
  console.log("GUEST received mode change → horde");

  // Host starts game
  console.log("--- HOST clicks START ---");
  await host.click("#lobby-start");

  // Both should leave lobby and enter game (HUD visible)
  await host.waitForFunction(() => !document.getElementById("hud").classList.contains("hidden"), { timeout: 8000 });
  await guest.waitForFunction(() => !document.getElementById("hud").classList.contains("hidden"), { timeout: 8000 });
  console.log("BOTH entered game");

  // Wait for HUD to populate (means the state event landed and updateHUD ran).
  await Promise.all([host, guest].map((p) =>
    p.waitForFunction(() => {
      const m = document.getElementById("hud-mode")?.textContent || "";
      return m.includes("HORDE") || m.includes("ARSENAL");
    }, { timeout: 8000 })
  ));
  const hostMode = await host.$eval("#hud-mode", (el) => el.textContent);
  const guestMode = await guest.$eval("#hud-mode", (el) => el.textContent);
  console.log("HOST hud:", hostMode, "| GUEST hud:", guestMode);
  if (hostMode !== guestMode) throw new Error("HUD mode mismatch");

  // Focus host canvas
  await host.click("#game", { position: { x: 500, y: 400 } });
  await wait(200);
  const before = await host.evaluate(() => window.__lastState);
  const myIdHost = await host.evaluate(() => window.__mpLocalId);
  const beforeMine = before.players.find((p) => p.id === myIdHost);
  console.log("HOST pre-move pos:", Math.round(beforeMine.x), Math.round(beforeMine.y));

  await host.keyboard.down("KeyD");
  await wait(1500);
  await host.keyboard.up("KeyD");
  await wait(400);

  const after = await host.evaluate(() => window.__lastState);
  const afterMine = after.players.find((p) => p.id === myIdHost);
  const dx = afterMine.x - beforeMine.x;
  console.log("HOST post-move pos:", Math.round(afterMine.x), Math.round(afterMine.y), `(dx=${Math.round(dx)})`);
  if (dx < 50) throw new Error(`expected host to move right; dx=${dx}`);

  // Read both players' positions from a snapshot we attach in the page.
  // Use a small probe injected into host/guest pages that pulls from the last
  // state message via a global hook on the Mp instance.
  for (const [label, page] of [["HOST", host], ["GUEST", guest]]) {
    const res = await page.evaluate(() => window.__lastState ?? null);
    if (!res) throw new Error(`${label} missing __lastState`);
    console.log(`${label} state: players=${res.players.length} positions=${res.players.map(p => `[${p.id}: ${Math.round(p.x)},${Math.round(p.y)}]`).join(" ")}`);
  }
  const hs = await host.evaluate(() => window.__lastState);
  const gs = await guest.evaluate(() => window.__lastState);
  if (hs.players.length !== 2 || gs.players.length !== 2) throw new Error("expected 2 players in each state");

  // Compare host's view of each player position vs guest's view (within tolerance)
  for (const hp of hs.players) {
    const gp = gs.players.find((p) => p.id === hp.id);
    if (!gp) throw new Error(`guest missing player ${hp.id}`);
    if (Math.abs(hp.x - gp.x) > 60 || Math.abs(hp.y - gp.y) > 60) {
      throw new Error(`player ${hp.id} position desync host=(${hp.x},${hp.y}) guest=(${gp.x},${gp.y})`);
    }
  }
  console.log("positions sync within tolerance ✓");

  // Bad code rejection: open a third page and try to join with a code that doesn't exist.
  console.log("--- bad-code rejection ---");
  const ctxC = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const stranger = await ctxC.newPage();
  let alertText = null;
  stranger.on("dialog", (d) => { alertText = d.message(); d.dismiss(); });
  await stranger.goto(BASE);
  await stranger.waitForSelector("#menu");
  await stranger.click('button[data-action="mp-join"]');
  await stranger.fill("#join-code", "ZZZZ");
  await stranger.click("#join-go");
  await wait(2500);
  if (!alertText || !/(room|join)/i.test(alertText)) {
    throw new Error("bad-code should have triggered an alert, got: " + alertText);
  }
  console.log("bad-code rejected with alert:", JSON.stringify(alertText));

  console.log("--- TEST OK ---");
  await browser.close();
}

main().catch((e) => { console.error("TEST FAIL:", e); process.exit(1); });
