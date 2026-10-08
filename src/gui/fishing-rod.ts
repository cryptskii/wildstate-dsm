/**
 * The fishing rod as pixel art: every piece is whole map pixels, drawn at the camera's scale like
 * the characters, so it reads as part of the same picture. Coordinates are map pixels from the
 * hand holding the rod.
 */
export type Pixel = { x: number; y: number; c: string };
export type Way = { tip: [number, number]; bob: [number, number] };

const ROD = '#9a6a38', UNDERSIDE = '#5a3a1c', GRIP = '#2e1d10', REEL = '#8a8f94', LINE = '#b9bec4';

/** The pixels of a straight run from a to b (Bresenham), both ends included. */
function run(ax: number, ay: number, bx: number, by: number): [number, number][] {
  const out: [number, number][] = [];
  let x = ax, y = ay;
  const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay), sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x, y]);
    if (x === bx && y === by) return out;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/**
 * The rod, its line and the bobber. While waiting the line sags toward the water; on a bite it
 * runs straight and the tip is pulled down toward the bobber.
 */
export function rodPixels(way: Way, bite: boolean): { rod: Pixel[]; bobber: Pixel[] } {
  const tip: [number, number] = [way.tip[0], Math.round(way.tip[1] * (bite ? 0.55 : 1))];
  const [bx, by] = way.bob;
  const pole = run(0, 0, tip[0], tip[1]);
  const px: Pixel[] = [];
  const at = new Set<string>();
  const put = (x: number, y: number, c: string) => { const k = `${x},${y}`; if (!at.has(k)) { at.add(k); px.push({ x, y, c }); } };
  // The line first, so the rod and bobber draw over it.
  if (bite) for (const [x, y] of run(tip[0], tip[1], bx, by)) put(x, y, LINE);
  else {
    const cx = (tip[0] + bx) / 2, cy = Math.max(tip[1], by) + 12;
    let prev: [number, number] = tip;
    for (let i = 1; i <= 24; i++) {
      const t = i / 24, u = 1 - t;
      const p: [number, number] = [Math.round(u * u * tip[0] + 2 * u * t * cx + t * t * bx), Math.round(u * u * tip[1] + 2 * u * t * cy + t * t * by)];
      for (const [x, y] of run(prev[0], prev[1], p[0], p[1])) put(x, y, LINE);
      prev = p;
    }
  }
  const rod: Pixel[] = [];
  pole.forEach(([x, y], i) => {
    // The grip: the first few pixels from the hand, two thick; then the rod with a darker underside.
    if (i < 4) { rod.push({ x, y, c: GRIP }, { x, y: y + 1, c: GRIP }); return; }
    rod.push({ x, y: y + 1, c: UNDERSIDE }, { x, y, c: ROD });
  });
  const [rx, ry] = pole[Math.min(2, pole.length - 1)];
  rod.push({ x: rx, y: ry + 2, c: REEL }, { x: rx + 1, y: ry + 2, c: REEL });
  // The bobber: a red cap over a white float.
  const bobber: Pixel[] = [
    { x: bx, y: by - 1, c: '#d4402b' }, { x: bx - 1, y: by, c: '#d4402b' }, { x: bx, y: by, c: '#d4402b' }, { x: bx + 1, y: by, c: '#d4402b' },
    { x: bx - 1, y: by + 1, c: '#f6efd2' }, { x: bx, y: by + 1, c: '#f6efd2' }, { x: bx + 1, y: by + 1, c: '#f6efd2' },
  ];
  return { rod: [...px.filter(p => !rod.some(r => r.x === p.x && r.y === p.y)), ...rod], bobber };
}
