// Room 1 is the original arena; room 2 sits to its right, gated by a
// barricade that costs $1000 to bring down. Pack-a-Punch lives in room 2.
export const ROOM1_W = 1800;
export const ROOM2_W = 600;
export const MAP_W = ROOM1_W + ROOM2_W; // 2400
export const MAP_H = 1300;

// Doorway is the gap in the divider wall between rooms.
export const DOORWAY = { x: ROOM1_W, y: 520, w: 24, h: 200 };

export const BARRICADE = { x: DOORWAY.x, y: DOORWAY.y, w: DOORWAY.w, h: DOORWAY.h };

// Crate sits in room 1 — central, away from walls.
export const CRATE = { x: 900, y: 360, w: 56, h: 40 };

// Pack-a-Punch sits in room 2.
export const PAP = { x: ROOM1_W + 320, y: MAP_H / 2, w: 70, h: 50 };

export const WALLS = [
  // Perimeter (full extended map).
  { x: 0, y: 0, w: MAP_W, h: 24 },
  { x: 0, y: MAP_H - 24, w: MAP_W, h: 24 },
  { x: 0, y: 0, w: 24, h: MAP_H },
  { x: MAP_W - 24, y: 0, w: 24, h: MAP_H },

  // Divider between room 1 and room 2 (gap = DOORWAY).
  { x: ROOM1_W, y: 0, w: 24, h: DOORWAY.y },
  { x: ROOM1_W, y: DOORWAY.y + DOORWAY.h, w: 24, h: MAP_H - (DOORWAY.y + DOORWAY.h) },

  // Room 1 interior cover (unchanged from original layout).
  { x: 200, y: 200, w: 140, h: 40 },
  { x: 520, y: 320, w: 40, h: 220 },
  { x: 820, y: 200, w: 220, h: 40 },
  { x: 1180, y: 520, w: 40, h: 280 },
  { x: 380, y: 700, w: 280, h: 40 },
  { x: 920, y: 880, w: 240, h: 40 },
  { x: 280, y: 940, w: 40, h: 180 },
  { x: 1380, y: 220, w: 40, h: 320 },
  { x: 620, y: 100, w: 40, h: 180 },
  { x: 1020, y: 1060, w: 320, h: 40 },
  { x: 700, y: 540, w: 180, h: 40 },
  { x: 1480, y: 800, w: 200, h: 40 },
  { x: 100, y: 540, w: 200, h: 40 },
  { x: 1340, y: 980, w: 40, h: 220 },

  // Room 2 interior pillars.
  { x: ROOM1_W + 120, y: 200, w: 40, h: 160 },
  { x: ROOM1_W + 120, y: MAP_H - 360, w: 40, h: 160 },
  { x: ROOM1_W + 440, y: 320, w: 40, h: 180 },
  { x: ROOM1_W + 440, y: MAP_H - 500, w: 40, h: 180 },
];

// Spawn points are all anchored inside room 1.
export const SPAWN_POINTS = [
  { x: 100, y: 100 },
  { x: ROOM1_W - 140, y: 100 },
  { x: 100, y: MAP_H - 140 },
  { x: ROOM1_W - 140, y: MAP_H - 140 },
  { x: ROOM1_W / 2, y: MAP_H / 2 },
  { x: 320, y: 620 },
  { x: 1280, y: 720 },
  { x: 760, y: 420 },
];

// Zombie perimeter spawns — confined to room 1's outer wall so zombies
// can never spawn behind the barricade or in the empty PaP room.
export const ZOMBIE_SPAWNS = [
  { x: 60, y: 60 },
  { x: ROOM1_W - 60, y: 60 },
  { x: 60, y: MAP_H - 60 },
  { x: ROOM1_W - 60, y: MAP_H - 60 },
  { x: ROOM1_W / 2, y: 60 },
  { x: ROOM1_W / 2, y: MAP_H - 60 },
  { x: 60, y: MAP_H / 2 },
  { x: ROOM1_W - 60, y: MAP_H / 2 },
];

export function currentWalls(sim) {
  if (sim && sim.barricadeDown) return WALLS;
  return WALLS.concat([BARRICADE]);
}
