// Packs the Halloween skins' walking sheets (design-drop/halloween-skins/<name>_walk_3x4.png: 3 poses
// x 4 directions, 256px cells, rows front, left, right, back) to the map's 32x40 frames, as
// public/spritesheets/skin-<name>-walk.png (96x160), the layout every character sheet uses.
//
// Unlike pack-character-walks.mjs, nothing is cut away: a skin's held lantern or floating hem is
// part of it. Every frame of a skin is drawn at one height on the map, the tallest (up to 34) at
// which each frame still fits the frame's width, and each frame gets its own scale to reach it.
// The sheets do not keep one size: the werewolf's front and back rows are 181px tall against 212
// for the sides, and most sheets draw the middle "passing" frame squashed, its head 10-20px lower
// with the feet in place. With one scale per sheet those frames shrank on the map. A frame's height
// is measured from its head to the row's baseline, so a lifted foot (the mummy's hop) stays a lift
// and is not scaled up into a wider figure.
// A map pixel is opaque when at least 40% of the source pixels it covers are (the sources' alpha is
// already binary), and takes the colour of the one source pixel at its centre, or the nearest
// opaque one to it: one pixel, not an average, so the sprites stay crisp like the trainers', which
// scripts/pack-character-walks.mjs samples the same way.
//
//   node scripts/pack-skin-walks.mjs
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';

export const SKINS = ['pumpkin', 'reaper', 'witch', 'vampire', 'werewolf', 'mummy', 'ghost', 'frankenstein', 'demon_girl'];
const CELL = 256, FW = 32, FH = 40, FIT_W = 30, FIT_H = 34, BASELINE = 38, COVER = 0.4;
const ROWS = ['front', 'left', 'right', 'back'];

for (const name of SKINS) {
  const image = PNG.sync.read(readFileSync(`design-drop/halloween-skins/${name}_walk_3x4.png`));
  if (image.width !== CELL * 3 || image.height !== CELL * 4) throw new Error(`${name}: expected a 768x1024 sheet`);
  const opaque = (x, y) => image.data[(y * image.width + x) * 4 + 3] > 128;
  const packed = new PNG({ width: FW * 3, height: FH * 4 });
  // Each frame's box in cell coordinates, and each row's baseline (its lowest opaque pixel).
  const boxes = [], baselines = [];
  for (let r = 0; r < 4; r++) {
    const row = [];
    for (let c = 0; c < 3; c++) {
      let x0 = CELL, y0 = CELL, x1 = -1, y1 = -1;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        if (opaque(c * CELL + x, r * CELL + y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      }
      if (x1 < 0) throw new Error(`${name}: frame ${r},${c} is empty`);
      row.push({ x0, y0, x1, y1 });
    }
    boxes.push(row); baselines.push(Math.max(...row.map((b) => b.y1)));
  }
  // A frame's height: head to the row's baseline. The one map height is the tallest every frame reaches within the width.
  const height = (r, c) => baselines[r] - boxes[r][c].y0 + 1;
  const width = (r, c) => boxes[r][c].x1 - boxes[r][c].x0 + 1;
  let H = FIT_H;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) H = Math.min(H, Math.floor(height(r, c) * FIT_W / width(r, c)));
  const sizes = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    const { x0, y0, y1 } = boxes[r][c], cw = width(r, c), ch = y1 - y0 + 1, ratio = H / height(r, c);
    const w = Math.round(cw * ratio), h = Math.round(ch * ratio), lift = Math.round((baselines[r] - y1) * ratio);
    if (c === 1) sizes.push(`${ROWS[r]} ${w}x${h}${lift ? `+${lift}` : ''}`);
    const ox = c * FW + Math.floor((FW - w) / 2), oy = r * FH + BASELINE - lift - h;
    let filled = 0;
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      const sx0 = Math.floor(tx / ratio), sx1 = Math.max(sx0 + 1, Math.floor((tx + 1) / ratio));
      const sy0 = Math.floor(ty / ratio), sy1 = Math.max(sy0 + 1, Math.floor((ty + 1) / ratio));
      const cx = (sx0 + sx1 - 1) / 2, cy = (sy0 + sy1 - 1) / 2;
      let n = 0, on = 0, pick = -1, best = Infinity;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const px = c * CELL + x0 + sx, py = r * CELL + y0 + sy;
        n++;
        if (px >= (c + 1) * CELL || py >= (r + 1) * CELL || !opaque(px, py)) continue;
        on++;
        const d = (sx - cx) ** 2 + (sy - cy) ** 2;
        if (d < best) { best = d; pick = (py * image.width + px) * 4; }
      }
      if (!on || on / n < COVER) continue;
      const o = ((oy + ty) * packed.width + ox + tx) * 4;
      packed.data[o] = image.data[pick]; packed.data[o + 1] = image.data[pick + 1]; packed.data[o + 2] = image.data[pick + 2]; packed.data[o + 3] = 255;
      filled++;
    }
    if (!filled) throw new Error(`${name}: frame ${r},${c} packed empty`);
  }
  writeFileSync(`public/spritesheets/skin-${name}-walk.png`, PNG.sync.write(packed));
  console.log(`${name}: height ${H}; middle frames ${sizes.join(', ')}`);
}
