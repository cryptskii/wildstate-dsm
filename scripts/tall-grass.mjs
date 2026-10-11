// Tall grass: the tiles and the map layer that make the wild zones, where wild creatures are met.
//
// Draws src/tiled/tall-grass.png (eight 32px tiles: blades in the painted map's own greens over a
// faint darker underlay; the last two are sparse, for tiles that hold flowers) with its .tsx, and
// writes the `TallGrass` layer of src/tiled/simplemap.tmx: every walkable tile of the zones below
// gets a tile, a flower tile a sparse one. The layer sits above the painted Dressing. The meadow's
// painted glow (the MeadowGlow layer, the old edge) is hidden, not removed.
//
// The game server reads the wild tiles from this layer (src/modules/main/field.ts): a creature
// can be met on exactly the tiles that show tall grass.
//
// To revert: delete the TallGrass layer and its tileset line from simplemap.tmx and set
// MeadowGlow's visible back to 1; the server then meets creatures on no tile until a zone is
// drawn again.
//
//   node scripts/tall-grass.mjs
import pngjs from 'pngjs'; const { PNG } = pngjs;
import { readFileSync, writeFileSync } from 'node:fs';

const W = 25, H = 20, T = 32;
/** The wild zones, in tiles (inclusive): the meadow east of camp, and Rowan's field in the north-west. */
export const ZONES = [
  // The meadow's two lower rows stop at the right garden's fence: no wild creature inside the garden.
  { name: 'meadow', x0: 14, y0: 6, x1: 19, y1: 8 },
  { name: 'meadow, lower', x0: 16, y0: 9, x1: 19, y1: 10 },
  { name: 'north-west strip', x0: 1, y0: 2, x1: 6, y1: 3 },
  { name: 'north-west corner', x0: 1, y0: 4, x1: 3, y1: 8 },
];
const VARIANTS = 8, SPARSE_FROM = 6;

// ---- the tiles
const rnd = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const BODY = [[74, 132, 8], [88, 150, 14], [96, 162, 20], [80, 140, 10]];
const TIP = [[168, 220, 70], [150, 206, 54], [184, 230, 92]];
const sheet = new PNG({ width: VARIANTS * T, height: T });
const put = (v, x, y, c, a = 255) => { if (x < 0 || x >= T || y < 0 || y >= T) return; const o = ((y) * sheet.width + v * T + x) * 4; sheet.data[o] = c[0]; sheet.data[o + 1] = c[1]; sheet.data[o + 2] = c[2]; sheet.data[o + 3] = a; };
for (let v = 0; v < VARIANTS; v++) {
  const r = rnd(97 + v * 31), sparse = v >= SPARSE_FROM;
  // A faint darker underlay marks the zone without hiding the ground or the flowers.
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) put(v, x, y, [60, 110, 0], sparse ? 40 : 70);
  const blades = sparse ? 9 : 24;
  for (let i = 0; i < blades; i++) {
    const bx = Math.floor(r() * T), by = 12 + Math.floor(r() * (T - 12)), h = 8 + Math.floor(r() * 9), lean = Math.round((r() - 0.5) * 5);
    const body = BODY[Math.floor(r() * BODY.length)], tip = TIP[Math.floor(r() * TIP.length)];
    for (let k = 0; k < h; k++) {
      const y = by - k, x = bx + Math.round(lean * (k / h) ** 2);
      const colour = k >= h - 3 ? tip : body;
      put(v, x, y, colour);
      if (k < h / 2) put(v, x + 1, y, body); // two wide at the base
    }
  }
}
writeFileSync('src/tiled/tall-grass.png', PNG.sync.write(sheet));
writeFileSync('src/tiled/tall-grass.tsx', `<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.9" tiledversion="1.9.2" name="tall-grass" tilewidth="32" tileheight="32" tilecount="${VARIANTS}" columns="${VARIANTS}">
 <image source="tall-grass.png" width="${VARIANTS * T}" height="${T}"/>
</tileset>
`);

// ---- the layer
const tmxPath = 'src/tiled/simplemap.tmx';
let tmx = readFileSync(tmxPath, 'utf8');
const layerCsv = (name) => {
  const m = tmx.match(new RegExp(`<layer id="\\d+" name="${name}"[^>]*>\\s*<data encoding="csv">\\n([\\s\\S]*?)</data>`));
  if (!m) throw new Error(`no ${name} layer`);
  return m[1].trim().split('\n').map((row) => row.split(',').filter((c) => c.trim() !== '').map(Number));
};
const blocked = layerCsv('Collisions');
const map = PNG.sync.read(readFileSync('src/tiled/fieldmap-v10.png'));
const at = (x, y) => { const i = (y * map.width + x) * 4; return [map.data[i], map.data[i + 1], map.data[i + 2]]; };
/** A tile with flowers (or anything else not green) on the painted map. */
const flowery = (tx, ty) => { let n = 0; for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const [r, g, b] = at(tx * T + x, ty * T + y); if (r > g + 10 || b > g + 10 || (r > 200 && g > 200 && b > 200)) n++; } return n > 12; };
// The tileset's first gid: after the last tileset's.
const tilesets = [...tmx.matchAll(/<tileset firstgid="(\d+)" source="([^"]+)"/g)].filter((m) => m[2] !== 'tall-grass.tsx');
const last = tilesets[tilesets.length - 1];
const lastCount = Number(readFileSync(`src/tiled/${last[2]}`, 'utf8').match(/tilecount="(\d+)"/)[1]);
const firstgid = Number(last[1]) + lastCount;
const grid = Array.from({ length: H }, () => Array(W).fill(0));
const report = [];
for (const z of ZONES) {
  let n = 0, sparse = 0;
  for (let ty = z.y0; ty <= z.y1; ty++) for (let tx = z.x0; tx <= z.x1; tx++) {
    if (blocked[ty][tx]) continue;
    const f = flowery(tx, ty);
    const hash = (tx * 7919 + ty * 104729) % (f ? VARIANTS - SPARSE_FROM : SPARSE_FROM);
    grid[ty][tx] = firstgid + (f ? SPARSE_FROM + hash : hash);
    n++; if (f) sparse++;
  }
  report.push(`${z.name}: ${n} tiles (${sparse} with flowers)`);
}
const csv = grid.map((row) => row.join(',') + ',').join('\n');
const layer = ` <layer id="15" name="TallGrass" width="${W}" height="${H}">\n  <data encoding="csv">\n${csv}\n</data>\n </layer>\n`;
tmx = tmx.replace(/ <layer id="15" name="TallGrass"[\s\S]*?<\/layer>\n/, '');
tmx = tmx.replace(/ <tileset firstgid="\d+" source="tall-grass.tsx" \/>\n/, '');
tmx = tmx.replace(/( <tileset firstgid="\d+" source="campfire-glow.tsx" \/>\n)/, `$1 <tileset firstgid="${firstgid}" source="tall-grass.tsx" />\n`);
tmx = tmx.replace(/( <layer id="5" name="Dressing"[\s\S]*?<\/layer>\n)/, `$1${layer}`);
tmx = tmx.replace(/<layer id="11" name="MeadowGlow" width="25" height="20">/, '<layer id="11" name="MeadowGlow" width="25" height="20" visible="0">');
writeFileSync(tmxPath, tmx);
console.log(report.join('\n'));
