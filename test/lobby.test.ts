import { describe, expect, it } from 'vitest';
import { claimUsername, resolvePlayer, validateUsername, freshProfile, RENAME_COOLDOWN_MS, type Directory } from '../src/domain/username';
import { rate, expected, START_RATING } from '../src/domain/rating';
import { pair, window } from '../src/domain/matchmaker';
import { choose, expire, forfeit, firstToAct, startMatch, MISSES_TO_FORFEIT, TURN_MS, type Match } from '../src/domain/match';
import { newCreature, KO_TO_WIN } from '../src/domain/game';

const A = 'MJPG8P38E3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', B = '4BKF028R0BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const dir = (): Directory => ({ players: {}, usernames: {} });

describe('usernames bound to the DSM identity', () => {
  it('accepts 3-16 lowercase letters, digits and underscores, and refuses the game\'s own names', () => {
    expect(validateUsername('Kai_99')).toBeNull();
    expect(validateUsername('ab')).toBe('invalid-username');
    expect(validateUsername('no spaces')).toBe('invalid-username');
    expect(validateUsername('Bramble')).toBe('reserved-username');
  });
  it('keeps names unique, case-insensitively', () => {
    const d = dir();
    expect(claimUsername(d, A, 'Kai', 0)).toBeNull();
    expect(claimUsername(d, B, 'kai', 0)).toBe('username-taken');
    expect(claimUsername(d, A, 'KAI', 0)).toBeNull();
  });
  it('renames without touching rating or history, frees the old name, and limits renames to once a day', () => {
    const d = dir();
    claimUsername(d, A, 'kai', 0);
    d.players[A].rating = 1337; d.players[A].history.push({ matchId: 'm1', opponent: B, stake: 0, result: 'win', ratingDelta: 16, at: 1 });
    expect(claimUsername(d, A, 'kai2', 1000)).toBe('rename-cooldown');
    expect(claimUsername(d, A, 'kai2', RENAME_COOLDOWN_MS)).toBeNull();
    expect(d.players[A]).toMatchObject({ username: 'kai2', rating: 1337 });
    expect(d.players[A].history).toHaveLength(1);
    expect(d.usernames.kai).toBeUndefined();
    expect(claimUsername(d, B, 'kai', RENAME_COOLDOWN_MS)).toBeNull();
  });
  it('finds a player by name or by exact identity, and always answers with the identity', () => {
    const d = dir();
    claimUsername(d, A, 'kai', 0);
    d.players[B] = freshProfile();
    expect(resolvePlayer(d, 'Kai')).toBe(A);
    expect(resolvePlayer(d, '@kai')).toBe(A);
    expect(resolvePlayer(d, A.toLowerCase())).toBe(A);
    expect(resolvePlayer(d, B)).toBe(B);
    expect(resolvePlayer(d, 'nobody')).toBeNull();
  });
});

describe('rating', () => {
  it('moves equal players by half of K and favours upsets', () => {
    expect(rate({ rating: 1200, games: 20 }, { rating: 1200, games: 20 })).toEqual({ winner: 1216, loser: 1184 });
    const upset = rate({ rating: 1000, games: 20 }, { rating: 1400, games: 20 });
    expect(upset.winner - 1000).toBeGreaterThan(16);
    expect(expected(1400, 1000)).toBeGreaterThan(0.9);
    expect(rate({ rating: START_RATING, games: 0 }, { rating: START_RATING, games: 0 }).winner).toBe(1220);
  });
});

describe('matchmaker', () => {
  const t = (wallet: string, rating: number, stake: number, since: number) => ({ wallet, rating, stake, since });
  it('pairs only equal stakes and never a wallet with itself', () => {
    expect(pair([t(A, 1200, 100, 0), t(B, 1200, 500, 0)], 0)).toEqual([]);
    expect(pair([t(A, 1200, 5, 0), t(A, 1200, 5, 0)], 0)).toEqual([]);
    expect(pair([t(A, 1200, 5, 0), t(B, 1250, 5, 0)], 0)).toHaveLength(1);
  });
  it('widens the rating gap it accepts the longer players wait', () => {
    const q = [t(A, 1200, 0, 0), t(B, 1550, 0, 0)];
    expect(pair(q, 0)).toEqual([]);
    expect(window(50_000)).toBe(350);
    expect(pair(q, 50_000)).toHaveLength(1);
    expect(pair([t(A, 1000, 0, 0), t(B, 2400, 0, 0)], 60_000)).toHaveLength(1);
  });
  it('pairs each player with the closest rating it accepts', () => {
    const C = 'C'.repeat(52);
    const pairs = pair([t(A, 1200, 0, 0), t(B, 1290, 0, 1), t(C, 1210, 0, 2)], 3);
    expect(pairs.map(([x, y]) => [x.wallet, y.wallet])).toEqual([[A, C]]);
  });
});

describe('player-vs-player match', () => {
  const team = (w: string, species: Parameters<typeof newCreature>[1][], lvl = 5) => species.map((s, i) => newCreature(`${w}/c${i}`, s, undefined, lvl));
  const fresh = (now = 0): Match => startMatch('m1', 0, { wallet: A, name: 'kai', team: team(A, ['embercub', 'mossling', 'tidefin']) }, { wallet: B, name: 'ren', team: team(B, ['voltusk', 'leon', 'brineback']) }, now);
  it('waits for both choices, then resolves the turn in a fixed order', () => {
    const m = fresh();
    expect(choose(m, 'a', 'strike', 1)).toBeNull();
    expect(m.turn).toBe(0);
    expect(choose(m, 'a', 'flare', 1)).toBe('already-chosen');
    expect(choose(m, 'b', 'strike', 2)).toBeNull();
    expect(m.turn).toBe(1);
    expect(m.log.map(e => e.side)).toEqual([firstToAct({ ...fresh(), turn: 0 }), firstToAct({ ...fresh(), turn: 0 }) === 'a' ? 'b' : 'a']);
    expect(m.deadline).toBe(2 + TURN_MS);
  });
  it('is deterministic: the same choices give the same match', () => {
    const play = () => { const m = fresh(); for (let i = 0; i < 40 && m.phase === 'battle'; i++) { choose(m, 'a', 'flare', i); choose(m, 'b', 'volt-charge', i); if (m.phase !== 'battle') break; } return m; };
    expect(play()).toEqual(play());
  });
  it('switches in the next creature on a knockout and ends at two', () => {
    const m = fresh();
    const seen: string[] = [];
    for (let i = 0; i < 80 && m.phase === 'battle'; i++) {
      const moveA = m.a.team[m.a.active].charges.flare ? 'flare' : 'strike';
      choose(m, 'a', m.a.team[m.a.active].species === 'embercub' ? moveA : 'strike', i);
      choose(m, 'b', 'strike', i);
      seen.push(...m.events.map(e => `${e.side}:${e.kind}`));
    }
    expect(m.phase).toBe('done');
    expect(m.reason).toBe('knockouts');
    expect(m[m.winner === 'a' ? 'b' : 'a'].ko).toBe(KO_TO_WIN);
    expect(seen).toContain(`${m.winner === 'a' ? 'b' : 'a'}:switch`);
  });
  it('plays Strike for a missed turn and forfeits after three misses', () => {
    const m = fresh();
    choose(m, 'a', 'strike', 0);
    expire(m, TURN_MS);
    expect(m.turn).toBe(1);
    expect(m.b.misses).toBe(1);
    for (let i = 1; i < MISSES_TO_FORFEIT; i++) { choose(m, 'a', 'strike', m.deadline); expire(m, m.deadline); }
    expect(m).toMatchObject({ phase: 'done', winner: 'a', reason: 'timeout' });
  });
  it('lets a player forfeit, and leaves the players\' own creatures untouched', () => {
    const own = team(A, ['embercub', 'mossling', 'tidefin']);
    own[0].hp = 3;
    const m = startMatch('m2', 0, { wallet: A, name: 'kai', team: own }, { wallet: B, name: 'ren', team: team(B, ['voltusk']) }, 0);
    // The team fights as the player prepared it, and the match never writes back.
    expect(m.a.team[0].hp).toBe(3);
    choose(m, 'a', 'strike', 0); choose(m, 'b', 'strike', 0);
    expect(own[0].hp).toBe(3);
    expect(own[0].statuses).toEqual([]);
    forfeit(m, 'b');
    expect(m).toMatchObject({ phase: 'done', winner: 'a', reason: 'forfeit' });
    expect(choose(m, 'a', 'strike', 1)).toBe('match-over');
  });
  it('refuses unknown moves and spent charges', () => {
    const m = fresh();
    expect(choose(m, 'a', 'tide-lash', 0)).toBe('unknown-move');
    m.a.team[0].charges.flare = 0;
    expect(choose(m, 'a', 'flare', 0)).toBe('no-charges');
  });
});

describe('stakes', () => {
  it('offers matchmaker tiers from free to 2,000 WILD, and any whole amount up to the cap for friends', async () => {
    const { STAKE_TIERS, validStake, MAX_STAKE } = await import('../src/domain/matchmaker');
    expect(STAKE_TIERS).toEqual([0, 10, 100, 500, 1000, 2000]);
    expect(validStake(1234)).toBe(true);
    expect(validStake(MAX_STAKE + 1)).toBe(false);
    expect(validStake(2.5)).toBe(false);
    expect(validStake(-1)).toBe(false);
  });
});

describe('items in a match', () => {
  it('spend the turn and the match\'s item; the opponent still acts', () => {
    const own = [newCreature(`${A}/c0`, 'embercub', undefined, 5)];
    own[0].hp = 10;
    const m = startMatch('mi', 0, { wallet: A, name: 'kai', team: own, items: { poultice: 1 } }, { wallet: B, name: 'ren', team: [newCreature(`${B}/c0`, 'voltusk', undefined, 5)] }, 0);
    expect(choose(m, 'a', `item:poultice:${A}/c0`, 0)).toBeNull();
    expect(m.a.items.poultice).toBe(0);
    choose(m, 'b', 'strike', 0);
    expect(m.log.map(e => e.move)).toEqual(expect.arrayContaining(['item:poultice', 'strike']));
    expect(m.a.team[0].hp).toBe(10 + 15 - m.log.find(e => e.side === 'b')!.dmg);
    expect(choose(m, 'a', `item:poultice:${A}/c0`, 1)).toBe('no-item');
    expect(choose(m, 'a', `item:tonic:nobody`, 1)).toBe('no-item');
  });
});
