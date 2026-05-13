const MOVE_LEFT = new Set(["KeyA", "ArrowLeft"]);
const MOVE_RIGHT = new Set(["KeyD", "ArrowRight"]);
const JUMP = new Set(["KeyW", "ArrowUp", "Space"]);

export function attachInput(canvas, game) {
  const keys = new Set();

  window.addEventListener("keydown", (e) => {
    keys.add(e.code);
    if (JUMP.has(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  canvas.addEventListener("mousemove", (e) => {
    game.mouse.x = e.clientX;
    game.mouse.y = e.clientY;
  });
  canvas.addEventListener("mousedown", () => {
    game.mouse.down = true;
    game.shoot();
  });
  canvas.addEventListener("mouseup", () => {
    game.mouse.down = false;
  });

  game.readInput = () => ({
    left: [...MOVE_LEFT].some((k) => keys.has(k)),
    right: [...MOVE_RIGHT].some((k) => keys.has(k)),
    jump: [...JUMP].some((k) => keys.has(k)),
  });
}
