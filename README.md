# DeadMag

2D online multiplayer platformer shooter. HTML5 Canvas + Node.js WebSockets.

## Modes

**Horde** — 2–4 player co-op. Survive zombie waves on a platform map. Killing zombies earns cash. Between waves, the shop opens: new guns, damage/fire-rate/reload upgrades, armour, move speed. Run ends when the team is out of lives.

**Arsenal** — 2–8 player FFA. Everyone starts with the same gun. Each kill cycles the killer to the next weapon: pistol → shotgun → SMG → sniper → rocket launcher → knife. First to kill with every weapon wins.

## Controls

- `WASD` / arrows — move + jump
- Mouse — aim
- Left click — shoot

## Dev

```bash
npm run dev
```

Then open http://localhost:8000.

## Versioning

`version.json` is auto-bumped by a `prepare-commit-msg` git hook on every commit, so every push lands a new version number. The number shows in the bottom-right corner of the canvas.

## Status

Phase 1: single-player platformer core (movement, jumping, mouse aim, placeholder shooting). Multiplayer/networking/game modes come in later phases.
