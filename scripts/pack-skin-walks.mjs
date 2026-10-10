// Packs the Halloween skins' walking sheets (design-drop/halloween-skins/<name>_walk_3x4.png: 3 poses
// x 4 directions, 256px cells, rows front, left, right, back) to the map's 32x40 frames, as
// public/spritesheets/skin-<name>-walk.png (96x160), the layout every character sheet uses.
//
// Unlike pack-character-walks.mjs, nothing is cut away: a skin's held lantern or floating hem is
// part of it. One crop, the union of all twelve frames' opaque pixels, is used for every frame, so
// each step's lift and the ghost's bob survive the packing; one scale fits that crop into 28x34.
// Each map pixel takes the average colour of the opaque source pixels it covers, and is opaque when
// at least 40% of them are (the sources' alpha is already binary).
//
//   node scripts/pack-skin-walks.mjs
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';

export const SKINS = ['pumpkin', 'reaper', 'witch', 'vampire', 'werewolf', 'mummy', 'ghost', 'frankenstein', 'demon_girl'];
const CELL = 256, FW = 32, FH = 40, FIT_W = 28, FIT_H = 34, BASELINE = 38, COVER = 0.4;

for (const name of SKINS) {
  const image = PNG.sync.read(readFileSync(`design-drop/halloween-skins/${name}_walk_3x4.png`));
  if (image.width !== CELL * 3 || image.height !== CELL * 4) throw new Error(`${name}: expected a 768x1024 sheet`);
  const opaque = (x, y) => image.data[(y * image.width + x) * 4 + 3] > 128;
  // The union crop, in cell coordinates.
  let x0 = CELL, y0 = CELL, x1 = -1, y1 = -1;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    if (opaque(c * CELL + x, r * CELL + y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) throw new Error(`${name}: an empty sheet`);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, ratio = Math.min(FIT_W / cw, FIT_H / ch);
  const w = Math.round(cw * ratio), h = Math.round(ch * ratio);
  const packed = new PNG({ width: FW * 3, height: FH * 4 });
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    const ox = c * FW + Math.floor((FW - w) / 2), oy = r * FH + BASELINE - h;
    let filled = 0;
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      const sx0 = Math.floor(tx / ratio), sx1 = Math.max(sx0 + 1, Math.floor((tx + 1) / ratio));
      const sy0 = Math.floor(ty / ratio), sy1 = Math.max(sy0 + 1, Math.floor((ty + 1) / ratio));
      let n = 0, on = 0, red = 0, green = 0, blue = 0;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const px = c * CELL + x0 + sx, py = r * CELL + y0 + sy;
        n++;
        if (px >= (c + 1) * CELL || py >= (r + 1) * CELL || !opaque(px, py)) continue;
        const i = (py * image.width + px) * 4;
        on++; red += image.data[i]; green += image.data[i + 1]; blue += image.data[i + 2];
      }
      if (!on || on / n < COVER) continue;
      const o = ((oy + ty) * packed.width + ox + tx) * 4;
      packed.data[o] = Math.round(red / on); packed.data[o + 1] = Math.round(green / on); packed.data[o + 2] = Math.round(blue / on); packed.data[o + 3] = 255;
      filled++;
    }
    if (!filled) throw new Error(`${name}: frame ${r},${c} packed empty`);
  }
  writeFileSync(`public/spritesheets/skin-${name}-walk.png`, PNG.sync.write(packed));
  console.log(`${name}: crop ${cw}x${ch} → ${w}x${h}`);
}
