const KEYS = {
  up:    new Set(["KeyW", "ArrowUp"]),
  down:  new Set(["KeyS", "ArrowDown"]),
  left:  new Set(["KeyA", "ArrowLeft"]),
  right: new Set(["KeyD", "ArrowRight"]),
  reload: new Set(["KeyR"]),
  revive: new Set(["KeyF"]),
  escape: new Set(["Escape"]),
};

function digitSlot(code) {
  if (code.startsWith("Digit")) return parseInt(code.slice(5), 10) - 1;
  if (code.startsWith("Numpad") && code.length === 7) {
    const n = parseInt(code.slice(6), 10);
    if (!Number.isNaN(n) && n >= 0 && n <= 9) return n - 1;
  }
  return -1;
}

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.reloadPressed = false;
    this.escapePressed = false;
    this.autoFire = false;
    this.weaponSlot = -1;
    this.quickSwapPressed = false;
    this._enabled = true;

    window.addEventListener("keydown", (e) => {
      if (!this._enabled) return;
      const wasDown = this.keys.has(e.code);
      this.keys.add(e.code);
      if (KEYS.reload.has(e.code)) this.reloadPressed = true;
      if (KEYS.escape.has(e.code)) this.escapePressed = true;
      if (!wasDown && e.code === "KeyE") this.autoFire = !this.autoFire;
      if (!wasDown && e.code === "KeyQ") this.quickSwapPressed = true;
      if (!wasDown) {
        const slot = digitSlot(e.code);
        if (slot >= 0) this.weaponSlot = slot;
      }
      if (e.code === "Space") e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());

    canvas.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      this.mouse.down = true;
      this.mouse.clicked = true;
    });
    canvas.addEventListener("mouseup", () => { this.mouse.down = false; });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  setEnabled(v) {
    this._enabled = v;
    if (!v) this.keys.clear();
  }

  has(group) {
    for (const k of KEYS[group]) if (this.keys.has(k)) return true;
    return false;
  }

  consumeReload() { const v = this.reloadPressed; this.reloadPressed = false; return v; }
  consumeEscape() { const v = this.escapePressed; this.escapePressed = false; return v; }
  consumeClick() { const v = this.mouse.clicked; this.mouse.clicked = false; return v; }
  consumeWeaponSlot() { const v = this.weaponSlot; this.weaponSlot = -1; return v; }
  consumeQuickSwap() { const v = this.quickSwapPressed; this.quickSwapPressed = false; return v; }

  snapshot(camera) {
    let mx = 0, my = 0;
    if (this.has("right")) mx += 1;
    if (this.has("left"))  mx -= 1;
    if (this.has("down"))  my += 1;
    if (this.has("up"))    my -= 1;
    const len = Math.hypot(mx, my) || 1;
    mx /= len; my /= len;
    const wx = camera ? camera.screenToWorldX(this.mouse.x) : this.mouse.x;
    const wy = camera ? camera.screenToWorldY(this.mouse.y) : this.mouse.y;
    return {
      mx, my,
      aimX: wx, aimY: wy,
      shoot: this.mouse.down || this.autoFire,
      reload: this.has("reload") || this.consumeReload(),
      revive: this.has("revive"),
    };
  }
}
