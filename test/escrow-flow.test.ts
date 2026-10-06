import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startMatch, type Match } from '../src/domain/match';
import { newCreature } from '../src/domain/game';

// The DSM side is mocked: what is checked here is what the game asks, in what order, and what it records.
const dsm = vi.hoisted(() => ({
  online: new Set<string>(),
  matches: {} as Record<string, Match>,
  failLockFor: null as string | null,
  calls: [] as string[],
}));
vi.mock('@rpgjs/server', () => ({ Components: { text: () => ({}) } }));
vi.mock('../src/modules/main/journey', () => ({ session: vi.fn() }));
vi.mock('../src/modules/main/field', () => ({ commit: vi.fn(), isFighting: () => false, setFighting: vi.fn() }));
vi.mock('../src/modules/main/dialogue', () => ({ isSpeaking: () => false }));
vi.mock('../src/modules/main/dsm', () => ({
  lobbyRecord: async () => ({ dir: { players: {}, usernames: {} }, matches: dsm.matches, save: () => {} }),
  playerOfWallet: (w: string) => (dsm.online.has(w) ? { id: w, getGui: () => undefined, gui: () => ({ on: vi.fn(), open: async () => {}, update: vi.fn(), close: vi.fn() }) } : null),
  walletOf: (p: { id: string }) => p.id,
  web2: vi.fn(),
  matchExternal: (id: string) => new TextEncoder().encode(id),
  lockStake: vi.fn(async (p: { id: string }, _x: Uint8Array, stake: number, side: string, opponent: string, counterpart?: string) => {
    dsm.calls.push(`lock ${side} ${p.id} ${stake} vs ${opponent}${counterpart ? ` on ${counterpart}` : ''}`);
    if (dsm.failLockFor === p.id) throw new Error('the wallet holds too little WILD');
    return { vault: `vault-${side}`, cell: 'cell' };
  }),
  decideMatch: vi.fn(async (vault: string, outcome: string) => { dsm.calls.push(`decide ${outcome} on ${vault}`); }),
  collectStakes: vi.fn(async (p: { id: string }, vaults: string[]) => { dsm.calls.push(`collect ${p.id} ${vaults.join('+')}`); }),
}));

import { collectWhatIsOwed, lockMatch, payOut } from '../src/modules/main/lobby';

const A = 'A'.repeat(52), B = 'B'.repeat(52);
function staked(stake = 100): Match {
  const team = (w: string) => [newCreature(`${w}/c0`, 'embercub', undefined, 5)];
  const m = startMatch('m1', stake, { wallet: A, name: 'alice', team: team(A) }, { wallet: B, name: 'bob', team: team(B) }, 0);
  m.phase = 'locking';
  m.escrow = { a: null, b: null, verdict: null, paid: false, refunded: { a: false, b: false }, problem: '' };
  dsm.matches[m.id] = m;
  return m;
}
beforeEach(() => { dsm.online = new Set([A, B]); dsm.matches = {}; dsm.failLockFor = null; dsm.calls = []; });

describe('a staked match', () => {
  it('locks A, then B against A\'s vault, and only then starts the battle', async () => {
    const m = staked();
    await lockMatch(m);
    expect(dsm.calls).toEqual([`lock a ${A} 100 vs ${B}`, `lock b ${B} 100 vs ${A} on vault-a`]);
    expect(m).toMatchObject({ phase: 'battle', escrow: { a: 'vault-a', b: 'vault-b', problem: '' } });
  });

  it('is void when a stake does not lock, and the stake that did goes back to its owner', async () => {
    const m = staked();
    dsm.failLockFor = B;
    await lockMatch(m);
    expect(m.phase).toBe('void');
    expect(m.escrow!.problem).toContain('too little WILD');
    expect(dsm.calls.slice(2)).toEqual(['decide void on vault-a', `collect ${A} vault-a`]);
    expect(m.escrow).toMatchObject({ verdict: 'void', refunded: { a: true, b: false } });
  });

  it('pays the winner both stakes: the game decides, the winner\'s wallet collects', async () => {
    const m = staked();
    await lockMatch(m);
    m.phase = 'done'; m.winner = 'b';
    await payOut(m);
    expect(dsm.calls.slice(2)).toEqual(['decide b-wins on vault-a', `collect ${B} vault-a+vault-b`]);
    expect(m.escrow).toMatchObject({ verdict: 'b-wins', paid: true });
    // Settled once: nothing more is asked.
    await payOut(m);
    expect(dsm.calls).toHaveLength(4);
  });

  it('keeps the winnings for a winner who is away, and collects them when they come back', async () => {
    const m = staked();
    await lockMatch(m);
    m.phase = 'done'; m.winner = 'a';
    dsm.online.delete(A);
    await payOut(m);
    expect(m.escrow).toMatchObject({ verdict: 'a-wins', paid: false });
    dsm.online.add(A);
    await collectWhatIsOwed(A);
    expect(dsm.calls.at(-1)).toBe(`collect ${A} vault-a+vault-b`);
    expect(m.escrow!.paid).toBe(true);
  });

  it('refunds both stakes of a match left void by a restart', async () => {
    const m = staked();
    await lockMatch(m);
    m.phase = 'void'; m.winner = null;
    await collectWhatIsOwed(B);
    expect(dsm.calls.slice(2)).toEqual(['decide void on vault-a', `collect ${A} vault-a`, `collect ${B} vault-b`]);
    expect(m.escrow!.refunded).toEqual({ a: true, b: true });
  });
});
