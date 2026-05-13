export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 22;
    this.h = 30;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.hp = 100;
    this.maxHp = 100;
    this.facing = 1;
  }

  render(ctx) {
    ctx.fillStyle = "#ff2e6c";
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.strokeStyle = "rgba(255, 46, 108, 0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x - 1.5, this.y - 1.5, this.w + 3, this.h + 3);

    const barW = 32;
    const barH = 4;
    const bx = this.x + this.w / 2 - barW / 2;
    const by = this.y - 10;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    const ratio = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = ratio > 0.4 ? "#00ffd1" : "#ff2e6c";
    ctx.fillRect(bx, by, barW * ratio, barH);
  }
}
