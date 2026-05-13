export const WEAPONS = {
  pistol:  { name: "PISTOL",  cost:    0, dmg:  25, rate:  350, mag: 12, reload: 1200, proj:  900, range:  700, spread: 0.04, pellets: 1, kind: "ranged" },
  shotgun: { name: "SHOTGUN", cost: 1000, dmg:  14, rate:  700, mag:  6, reload: 2000, proj:  800, range:  380, spread: 0.30, pellets: 6, kind: "ranged" },
  smg:     { name: "SMG",     cost: 1500, dmg:  10, rate:   80, mag: 30, reload: 1500, proj:  850, range:  550, spread: 0.10, pellets: 1, kind: "ranged" },
  sniper:  { name: "SNIPER",  cost: 2500, dmg: 110, rate: 1200, mag:  5, reload: 2500, proj: 1400, range: 1800, spread: 0.00, pellets: 1, kind: "ranged" },
  rocket:  { name: "ROCKET",  cost: 4000, dmg: 100, rate: 1500, mag:  1, reload: 3000, proj:  600, range:  900, spread: 0.00, pellets: 1, kind: "rocket", splashR: 90, splashDmg: 70 },
  knife:   { name: "KNIFE",   cost:  200, dmg:  60, rate:  250, mag:  1, reload:    0, range:   55, kind: "melee" },
};

export const ARSENAL_ORDER = ["pistol", "shotgun", "smg", "sniper", "rocket", "knife"];

export function weaponMag(id, upgrades = {}) {
  return WEAPONS[id].mag;
}
