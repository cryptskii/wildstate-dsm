/**
 * The wild zones are the tall-grass tiles of the map (scripts/tall-grass.mjs draws them; the
 * server meets creatures on exactly those): the meadow east of camp, clear of the garden fence,
 * and Rowan's field in the north-west, clear of its trees and the log.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@rpgjs/server', () => ({}));
vi.mock('../src/modules/main/lobby', () => ({ openLobby: vi.fn() }));
vi.mock('../src/modules/main/presence', () => ({ graphicOf: vi.fn(), isCurrentAvatar: () => true }));
vi.mock('../src/modules/main/patrol', () => ({ npcPosition: (_p: unknown, _id: string, at: { x: number; y: number }) => at, pauseNpc: vi.fn() }));
vi.mock('../src/modules/main/dialogue', () => ({ portraitDialogue: vi.fn(), talkToRowan: vi.fn(), readWayfindingSign: vi.fn(), isSpeaking: () => false }));
vi.mock('../src/modules/main/board', () => ({ readBulletinBoard: vi.fn(), gameReportList: vi.fn() }));
vi.mock('../src/modules/main/dsm', () => ({
  claimScarecrowGift: vi.fn(), onCommitted: vi.fn(), openMarket: vi.fn(), openShop: vi.fn(),
  useCommit: vi.fn(), useHudData: vi.fn(), useReadState: vi.fn(), walked: vi.fn(),
  walletCoins: () => null, walletWaiting: () => null, web2: vi.fn(),
}));
vi.mock('../src/modules/main/journey', () => ({ session: () => ({ read: () => ({}) }) }));

import { inTallGrass, wildTileCount } from '../src/modules/main/field';

const tmx = readFileSync('src/tiled/simplemap.tmx', 'utf8');
const layer = (name: string) => tmx.match(new RegExp(`name="${name}"[^>]*>\\s*<data encoding="csv">\\n([\\s\\S]*?)</data>`))![1]
  .trim().split('\n').map((r) => r.split(',').filter((c) => c !== '').map(Number));

describe('the tall grass', () => {
  it('covers the meadow and the north-west field, on walkable tiles only, and nowhere else', () => {
    const grass = layer('TallGrass'), blocked = layer('Collisions');
    const zones = [[14, 6, 19, 8], [16, 9, 19, 10], [1, 2, 6, 3], [1, 4, 3, 8]];
    const expected = new Set<string>();
    for (const [x0, y0, x1, y1] of zones) for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (!blocked[ty][tx]) expected.add(`${tx},${ty}`);
    const drawn = new Set<string>();
    grass.forEach((row, ty) => row.forEach((g, tx) => { if (g) drawn.add(`${tx},${ty}`); }));
    expect([...drawn].sort()).toEqual([...expected].sort());
    expect(wildTileCount()).toBe(expected.size);
  });
  it('is where creatures are met: in both zones, not in the garden, not on the path, not where the fence is', () => {
    expect(inTallGrass(464, 208)).toBe(true);   // the meadow
    expect(inTallGrass(464, 240)).toBe(true);   // a meadow tile with flowers is still wild
    expect(inTallGrass(464, 336)).toBe(false);  // the right garden's corner by the well
    expect(inTallGrass(48, 80)).toBe(true);     // the north-west strip under the trees
    expect(inTallGrass(48, 146)).toBe(true);    // where the stump was
    expect(inTallGrass(80, 146)).toBe(false);   // a tree
    expect(inTallGrass(368, 240)).toBe(false);  // the trail
  });
  it('replaces the painted glow around the meadow, which is kept hidden to revert to', () => {
    expect(tmx).toMatch(/name="MeadowGlow"[^>]*visible="0"/);
  });
});
