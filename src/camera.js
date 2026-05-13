import { MAP_W, MAP_H } from "./map.js";

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.vw = 0; this.vh = 0;
  }
  setViewport(w, h) { this.vw = w; this.vh = h; }
  follow(tx, ty, lerp = 0.15) {
    const goalX = tx - this.vw / 2;
    const goalY = ty - this.vh / 2;
    this.x += (goalX - this.x) * lerp;
    this.y += (goalY - this.y) * lerp;
    this.x = Math.max(0, Math.min(MAP_W - this.vw, this.x));
    this.y = Math.max(0, Math.min(MAP_H - this.vh, this.y));
  }
  screenToWorldX(sx) { return sx + this.x; }
  screenToWorldY(sy) { return sy + this.y; }
}
