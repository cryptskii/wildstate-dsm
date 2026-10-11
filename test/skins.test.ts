import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { GameError, SKINS, initialState, newCreature, skinGraphic, stateSchema, transition, type Command, type GameState } from '../src/domain/game';

vi.mock('@rpgjs/server', () => ({}));
const { graphicOf } = await import('../src/modules/main/presence');

let n = 0;
const run = (s: GameState, command: Command) => transition(s, s.revision, `t/${n++}`, command);
const refused = (s: GameState, command: Command) => { try { run(s, command); return null; } catch (e) { return e instanceof GameError ? e.code : String(e); } };

describe('a Halloween skin bought from Bramble', () => {
  it('is granted for a payment the game account accepted, once per payment', () => {
    const s = run(initialState('W'), { type: 'grant-skin', skin: 'pumpkin', fact: 'tx-1' });
    expect(s.skins).toEqual(['pumpkin']);
    expect(s.skin).toBeNull(); // bought, not yet worn
    expect(refused(s, { type: 'grant-skin', skin: 'ghost', fact: 'tx-1' })).toBe('choice-consumed');
    expect(refused(initialState('W'), { type: 'grant-skin', skin: 'ghost', fact: ' ' })).toBe('choice-consumed');
  });
  it('is owned once: a second purchase is refused before the wallet is asked', () => {
    const s = run(initialState('W'), { type: 'grant-skin', skin: 'witch', fact: 'tx-1' });
    expect(refused(s, { type: 'grant-skin', skin: 'witch', fact: 'not yet paid' })).toBe('skin-owned');
  });
  it('can be worn and switched from the Bag, and taken off again', () => {
    let s = run(initialState('W'), { type: 'grant-skin', skin: 'vampire', fact: 'tx-1' });
    s = run(s, { type: 'grant-skin', skin: 'ghost', fact: 'tx-2' });
    s = run(s, { type: 'wear-skin', skin: 'vampire' });
    expect(s.skin).toBe('vampire');
    s = run(s, { type: 'wear-skin', skin: 'ghost' });
    expect(s.skin).toBe('ghost');
    s = run(s, { type: 'wear-skin', skin: null });
    expect(s.skin).toBeNull();
    expect(s.skins).toEqual(['vampire', 'ghost']);
  });
  it('cannot be worn unless owned, nor changed mid-battle', () => {
    expect(refused(initialState('W'), { type: 'wear-skin', skin: 'reaper' })).toBe('skin-not-owned');
    let s = run(initialState('W'), { type: 'grant-skin', skin: 'reaper', fact: 'tx-1' });
    s = { ...s, battle: { id: 'b', creatureId: s.creatures[0].id, wild: newCreature('w', 'mossling'), turn: 0, source: 'meadow', outcome: 'active', log: [], format: 'single', roster: [], bench: [], ko: { own: 0, foe: 0 }, events: [] } };
    expect(refused(s, { type: 'wear-skin', skin: 'reaper' })).toBe('battle-active');
  });
  it('a state wearing a skin it does not own is not a valid state', () => {
    const s = initialState('W');
    expect(stateSchema.safeParse({ ...s, skin: 'mummy' }).success).toBe(false);
    expect(stateSchema.safeParse({ ...s, skins: ['mummy'], skin: 'mummy' }).success).toBe(true);
  });
});

describe('the map sprite', () => {
  const player = (save: Partial<GameState>) => ({ creatureSave: () => JSON.stringify({ ...initialState('W'), ...save }) }) as never;
  it('is the worn skin, else the trainer\'s look', () => {
    expect(graphicOf(player({ skins: ['werewolf'], skin: 'werewolf' }))).toBe('skin-werewolf');
    expect(graphicOf(player({ skins: ['werewolf'], skin: null, look: 'curly' }))).toBe('hero-curly');
    expect(graphicOf(player({ skins: [], skin: 'werewolf' as never }))).toBe('hero'); // a save wearing what it does not own shows the look
  });
});

describe('every skin', () => {
  it('has a packed 3x4 walking sheet of the map\'s 32x40 frames, and a shop picture', () => {
    for (const skin of SKINS) {
      // A PNG's width and height are the first fields of its header chunk.
      const png = readFileSync(`public/spritesheets/${skinGraphic(skin)}-walk.png`);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([96, 160]);
      expect(existsSync(`public/skins/${skin}.png`)).toBe(true);
    }
  });
});
