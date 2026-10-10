/**
 * Phones, 2026-10-10: in an arena match, HP jumped back up and fainted creatures stood again. A DSM
 * task committing mid-match (a holdings proof, say) handed the battle screen the player's own game
 * state, whose creatures are at their real HP, in place of the match's snapshot of the teams. A
 * match's screen is only ever given the match; a wild or trainer battle, which is the player's own
 * state, still is.
 */
import { describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ commit: null as null | ((player: unknown, command: unknown) => unknown) }));
vi.mock('@rpgjs/server', () => ({}));
vi.mock('../src/modules/main/lobby', () => ({ openLobby: vi.fn() }));
vi.mock('../src/modules/main/presence', () => ({ graphicOf: vi.fn(), isCurrentAvatar: () => true }));
vi.mock('../src/modules/main/patrol', () => ({ npcPosition: (_p: unknown, _id: string, at: { x: number; y: number }) => at, pauseNpc: vi.fn() }));
vi.mock('../src/modules/main/dialogue', () => ({ portraitDialogue: vi.fn(), talkToRowan: vi.fn(), readWayfindingSign: vi.fn(), isSpeaking: () => false }));
vi.mock('../src/modules/main/board', () => ({ readBulletinBoard: vi.fn() }));
vi.mock('../src/modules/main/dsm', () => ({
  claimScarecrowGift: vi.fn(), onCommitted: vi.fn(), openMarket: vi.fn(), openShop: vi.fn(),
  useCommit: (fn: (player: unknown, command: unknown) => unknown) => { hooks.commit = fn; },
  useHudData: vi.fn(), useReadState: vi.fn(), walked: vi.fn(),
  walletCoins: () => null, walletWaiting: () => null, web2: vi.fn(),
}));
// The player's own game state: their creature at full HP, as it is outside any match.
const own = { revision: 7, lead: 0, team: ['c'], creatures: [{ id: 'c', species: 'embercub', xp: 0, hp: 30, charges: {}, statuses: [], guard: false }], trainersBeaten: [], inventory: {} };
vi.mock('../src/modules/main/journey', () => ({
  session: () => ({ read: () => own, execute: () => own, snapshot: () => '{}' }),
}));

import { setInMatch } from '../src/modules/main/field';

/** A player whose screens record every update they are handed, by screen. */
function player() {
  const handed: Record<string, unknown[]> = {};
  const p = {
    creatureSave: { set: vi.fn() },
    x: () => 0, y: () => 0,
    getGui: (id: string) => ({ update: (data: unknown) => { (handed[id] ??= []).push(data); } }),
  };
  return { p: p as never, handed };
}

describe('a DSM task committing while a battle screen is open', () => {
  it('leaves a match screen showing the match, not the player\'s own creatures', () => {
    const { p, handed } = player();
    setInMatch(p, true);
    hooks.commit!(p, { type: 'noop' });
    expect(handed['creature-battle']).toBeUndefined();
  });

  it('hands a wild or trainer battle the new state, once the player is in no match', () => {
    const { p, handed } = player();
    setInMatch(p, true);
    setInMatch(p, false);
    hooks.commit!(p, { type: 'noop' });
    expect(handed['creature-battle']).toEqual([{ state: own, mode: 'battle', lastAction: 'sync', error: '' }]);
  });
});
