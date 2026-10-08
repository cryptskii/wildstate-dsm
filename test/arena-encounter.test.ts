/**
 * Phones, 2026-10-08: a player's taps on the arena lobby walked their character into the meadow
 * beneath it, and a wild creature appeared while the lobby was still on screen. The map under the
 * lobby starts no encounter.
 */
import { describe, expect, it, vi } from 'vitest';

const updates: unknown[] = [];
vi.mock('@rpgjs/server', () => ({}));
vi.mock('../src/modules/main/lobby', () => ({ openLobby: vi.fn() }));
vi.mock('../src/modules/main/presence', () => ({ graphicOf: vi.fn(), isCurrentAvatar: () => true }));
vi.mock('../src/modules/main/patrol', () => ({ npcPosition: (_p: unknown, _id: string, at: { x: number; y: number }) => at, pauseNpc: vi.fn() }));
vi.mock('../src/modules/main/dialogue', () => ({ portraitDialogue: vi.fn(), talkToRowan: vi.fn(), readWayfindingSign: vi.fn(), isSpeaking: () => false }));
vi.mock('../src/modules/main/dsm', () => ({
  claimScarecrowGift: vi.fn(), onCommitted: vi.fn(), openMarket: vi.fn(), openShop: vi.fn(),
  useCommit: vi.fn(), useHudData: vi.fn(), useReadState: vi.fn(), walked: vi.fn(),
  walletCoins: () => null, walletWaiting: () => null, web2: vi.fn(),
}));
// A lead with no HP: an encounter that starts says so on the HUD and goes no further.
vi.mock('../src/modules/main/journey', () => ({
  session: () => ({ read: () => ({ lead: 0, creatures: [{ id: 'c', species: 'embercub', hp: 0 }], trainersBeaten: [] }) }),
}));

import { checkEncounter, MEADOW, setInArena } from '../src/modules/main/field';

/** A player standing in the meadow. */
function inMeadow() {
  return {
    x: () => MEADOW.x0 + 40,
    y: () => MEADOW.y0 + 40,
    creatureSave: () => '{}',
    breakRoutes: vi.fn(),
    getGui: () => ({ update: (data: unknown) => updates.push(data) }),
  } as never;
}
const encountered = () => updates.some((u) => typeof u === 'object' && u !== null && String((u as { notice?: string }).notice ?? '').includes('needs rest'));

describe('the meadow under the arena lobby', () => {
  it('starts no encounter while the player is in the lobby', async () => {
    updates.length = 0;
    const player = inMeadow();
    setInArena(player, true);
    await checkEncounter(player);
    expect(encountered()).toBe(false);
  });

  it('starts one for the same step once the lobby is closed', async () => {
    updates.length = 0;
    const player = inMeadow();
    setInArena(player, true);
    setInArena(player, false);
    await checkEncounter(player);
    expect(encountered()).toBe(true);
  });
});
