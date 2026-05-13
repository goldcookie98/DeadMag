export function buildMap(w, h) {
  const ground = { x: 0, y: h - 60, w: w, h: 60 };
  const platforms = [
    ground,
    { x: w * 0.1, y: h - 200, w: 180, h: 16 },
    { x: w * 0.3, y: h - 320, w: 220, h: 16 },
    { x: w * 0.55, y: h - 240, w: 200, h: 16 },
    { x: w * 0.75, y: h - 380, w: 160, h: 16 },
    { x: w * 0.45, y: h - 460, w: 140, h: 16 },
    { x: w * 0.15, y: h - 460, w: 160, h: 16 },
  ];
  return platforms;
}
