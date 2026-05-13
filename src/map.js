export const MAP_W = 1800;
export const MAP_H = 1300;

export const WALLS = [
  { x: 0, y: 0, w: MAP_W, h: 24 },
  { x: 0, y: MAP_H - 24, w: MAP_W, h: 24 },
  { x: 0, y: 0, w: 24, h: MAP_H },
  { x: MAP_W - 24, y: 0, w: 24, h: MAP_H },

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
];

export const SPAWN_POINTS = [
  { x: 100, y: 100 },
  { x: MAP_W - 140, y: 100 },
  { x: 100, y: MAP_H - 140 },
  { x: MAP_W - 140, y: MAP_H - 140 },
  { x: MAP_W / 2, y: MAP_H / 2 },
  { x: 320, y: 620 },
  { x: 1280, y: 720 },
  { x: 760, y: 420 },
];

export const ZOMBIE_SPAWNS = [
  { x: 60, y: 60 },
  { x: MAP_W - 60, y: 60 },
  { x: 60, y: MAP_H - 60 },
  { x: MAP_W - 60, y: MAP_H - 60 },
  { x: MAP_W / 2, y: 60 },
  { x: MAP_W / 2, y: MAP_H - 60 },
  { x: 60, y: MAP_H / 2 },
  { x: MAP_W - 60, y: MAP_H / 2 },
];
