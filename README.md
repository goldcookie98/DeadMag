# DeadMag

**Play:** https://goldcookie98.github.io/DeadMag/

2D online top-down shooter. HTML5 Canvas + Node.js WebSockets.

## Modes

**Horde** (co-op, 2–4) — Survive zombie waves. Kills earn cash. Between waves the shop opens: new guns, +damage/+fire-rate/+reload/+speed upgrades, armour, medkits, extra lives, plus **Revive Mate** ($1500) to bring back a dead teammate.

Three states when playing with others: **alive** → **downed** (hp 0, bleeding out in 30s — a teammate can hold `F` next to you for 5s to revive) → **dead** (lost a life, can only return when a teammate buys Revive Mate from the shop).

**Arsenal** (FFA, 2–8) — Everyone starts with the same gun. Each kill cycles **your** weapon to the next: pistol → shotgun → SMG → sniper → rocket → knife. First to land a kill with every weapon wins.

## Controls

- `WASD` / arrows — move (top-down, 8-way)
- Mouse — aim
- Left click — shoot
- `R` — reload
- `E` — toggle auto-fire
- `F` — hold near a downed teammate to revive (5s)
- `Esc` — back to menu

## Run it

### Client only (solo + bots)
```bash
npm run dev
```
Open http://localhost:8000 — Solo Horde and Arsenal-vs-bots run entirely in the browser, no server needed. Same on the GitHub Pages live URL.

### Multiplayer
No server, no setup. Click **CREATE LOBBY** to get a 4-character code, share it with a friend, they click **JOIN LOBBY** and type the code. WebRTC peer-to-peer via [trystero](https://github.com/dmotz/trystero) over public Nostr relays — works from the live site as-is. The player who created the lobby is the authoritative host; if they leave, the game ends.

(A standalone WebSocket server still lives in `server/` for dedicated hosting if you'd rather run it that way: `npm install && npm run server`.)

## Versioning

`version.json` is auto-bumped by a `prepare-commit-msg` git hook on every commit, so every push lands a new version number. The number shows bottom-right.

## Stack

- Canvas + ES modules, no framework
- Server-authoritative sim shared between client (solo) and server (multiplayer) — `src/sim.js`
- `ws` for WebSockets

## Status

First cut of every system from spec: top-down movement, mouse aim, shooting, 6 weapons, reload, zombies + waves, shop, lives, Arsenal gun cycle, lobby + room codes, server. Expect rough edges — open an issue / hit me up to iterate.
