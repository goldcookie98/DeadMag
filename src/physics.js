const GRAVITY = 1800;
const MOVE_SPEED = 260;
const JUMP_VELOCITY = -620;
const AIR_CONTROL = 0.7;

export function stepPhysics(player, platforms, ctrl, dt, w, h) {
  const accel = player.onGround ? 1 : AIR_CONTROL;
  if (ctrl.left && !ctrl.right) {
    player.vx = -MOVE_SPEED * accel;
    player.facing = -1;
  } else if (ctrl.right && !ctrl.left) {
    player.vx = MOVE_SPEED * accel;
    player.facing = 1;
  } else {
    player.vx *= player.onGround ? 0.7 : 0.95;
    if (Math.abs(player.vx) < 5) player.vx = 0;
  }

  if (ctrl.jump && player.onGround) {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
  }

  player.vy += GRAVITY * dt;
  if (player.vy > 1400) player.vy = 1400;

  player.x += player.vx * dt;
  resolveAxis(player, platforms, "x");

  player.y += player.vy * dt;
  player.onGround = false;
  resolveAxis(player, platforms, "y");

  if (player.x < 0) {
    player.x = 0;
    player.vx = 0;
  }
  if (player.x + player.w > w) {
    player.x = w - player.w;
    player.vx = 0;
  }
  if (player.y > h + 200) {
    player.x = w * 0.25;
    player.y = h * 0.2;
    player.vx = 0;
    player.vy = 0;
  }
}

function resolveAxis(player, platforms, axis) {
  for (const p of platforms) {
    if (!aabb(player, p)) continue;
    if (axis === "x") {
      if (player.vx > 0) player.x = p.x - player.w;
      else if (player.vx < 0) player.x = p.x + p.w;
      player.vx = 0;
    } else {
      if (player.vy > 0) {
        player.y = p.y - player.h;
        player.onGround = true;
      } else if (player.vy < 0) {
        player.y = p.y + p.h;
      }
      player.vy = 0;
    }
  }
}

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
