# DeadMag

**Play:** [deadmag.ext.io](https://deadmag.ext.io/)

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

## Versioning

`version.json` is auto-bumped by a `prepare-commit-msg` git hook on every commit, so every push lands a new version number. The number shows bottom-right.

## Status

First cut of every system from spec: top-down movement, mouse aim, shooting, 6 weapons, reload, zombies + waves, shop, lives, Arsenal gun cycle, lobby + room codes, server. Expect rough edges — open an issue / hit me up to iterate.
