// Tile-grid flow-field pathfinding for zombies.
//
// A flow field is built per alive player by BFS-ing OUT from the player's
// tile, recording for every reachable tile the unit direction toward the
// player's tile. Each zombie samples its current tile and walks in the
// recorded direction. This handles arbitrary wall layouts without the
// straight-line-plus-detour heuristics getting stuck on corners.

export const TILE_SIZE = 32;

// Clearance margin around walls when marking tiles blocked. Tuned to be
// roughly the standard zombie radius — narrower than the biggest zombie
// (brute, r=22) on purpose, so brutes occasionally clip walls and rely on
// the runtime wall-pushout, but pathing isn't choked into nothing.
const PATH_CLEARANCE = 14;

const NEIGHBORS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
];

export function buildNavGrid(walls, mapW, mapH) {
  const cols = Math.ceil(mapW / TILE_SIZE);
  const rows = Math.ceil(mapH / TILE_SIZE);
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * TILE_SIZE, y = r * TILE_SIZE;
      let bad = false;
      for (const w of walls) {
        const wx = w.x - PATH_CLEARANCE;
        const wy = w.y - PATH_CLEARANCE;
        const ww = w.w + PATH_CLEARANCE * 2;
        const wh = w.h + PATH_CLEARANCE * 2;
        if (x + TILE_SIZE > wx && x < wx + ww && y + TILE_SIZE > wy && y < wy + wh) {
          bad = true; break;
        }
      }
      blocked[r * cols + c] = bad ? 1 : 0;
    }
  }
  return { cols, rows, blocked };
}

// Returns a flow field rooted at (targetX, targetY). If the target tile is
// blocked (e.g. player standing partially in a wall-buffer), seeds from the
// nearest unblocked tile so zombies don't get stranded.
export function computeFlowField(grid, targetX, targetY) {
  const { cols, rows, blocked } = grid;
  const total = cols * rows;
  const dist = new Int32Array(total).fill(-1);
  const dirX = new Int8Array(total);
  const dirY = new Int8Array(total);

  let tc = Math.max(0, Math.min(cols - 1, Math.floor(targetX / TILE_SIZE)));
  let tr = Math.max(0, Math.min(rows - 1, Math.floor(targetY / TILE_SIZE)));
  if (blocked[tr * cols + tc]) {
    let bestD = Infinity, bestR = -1, bestC = -1;
    const span = 6;
    for (let r = Math.max(0, tr - span); r <= Math.min(rows - 1, tr + span); r++) {
      for (let c = Math.max(0, tc - span); c <= Math.min(cols - 1, tc + span); c++) {
        if (blocked[r * cols + c]) continue;
        const d = (r - tr) * (r - tr) + (c - tc) * (c - tc);
        if (d < bestD) { bestD = d; bestR = r; bestC = c; }
      }
    }
    if (bestR < 0) return null;
    tr = bestR; tc = bestC;
  }

  const queue = new Int32Array(total);
  let head = 0, tail = 0;
  const start = tr * cols + tc;
  dist[start] = 0;
  queue[tail++] = start;

  while (head < tail) {
    const idx = queue[head++];
    const c = idx % cols;
    const r = (idx - c) / cols;
    const d = dist[idx];
    for (let n = 0; n < NEIGHBORS.length; n++) {
      const dc = NEIGHBORS[n][0], dr = NEIGHBORS[n][1];
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const nidx = nr * cols + nc;
      if (dist[nidx] !== -1) continue;
      if (blocked[nidx]) continue;
      // No corner-cutting: a diagonal step is only valid if both
      // orthogonal neighbors are also clear. Otherwise zombies would
      // squeeze through one-tile gaps that they can't physically fit.
      if (dc !== 0 && dr !== 0) {
        if (blocked[r * cols + nc] || blocked[nr * cols + c]) continue;
      }
      dist[nidx] = d + 1;
      // The flow direction at a tile points back toward the BFS parent,
      // i.e. the previously-visited (lower-dist) tile. Since this tile
      // was reached from (r, c) by stepping (dc, dr), the way back is
      // (-dc, -dr).
      dirX[nidx] = -dc;
      dirY[nidx] = -dr;
      queue[tail++] = nidx;
    }
  }
  return { cols, rows, dist, dirX, dirY };
}

export function sampleFlow(field, x, y) {
  if (!field) return null;
  const { cols, rows, dist, dirX, dirY } = field;
  const c = Math.floor(x / TILE_SIZE);
  const r = Math.floor(y / TILE_SIZE);
  if (c < 0 || c >= cols || r < 0 || r >= rows) return null;
  const idx = r * cols + c;
  if (dist[idx] === -1) return null;
  return { dx: dirX[idx], dy: dirY[idx], dist: dist[idx] };
}
