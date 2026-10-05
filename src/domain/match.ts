/**
 * A player-vs-player match: two teams of up to three, one creature out at a time, first to knock
 * out two wins. Both players choose a move each turn without seeing the other's; the turn resolves
 * once both are in, through the same exchange every battle uses (src/domain/duel.ts). The teams are
 * snapshots at full strength, so a match never changes the players' own creatures.
 *
 * Pure and deterministic: the game server runs it and sends each player only move ids' results.
 * The battle and its result are the game server's (Web2), never DSM evidence.
 */
import { exchange, type ExchangeEntry } from './duel';
import { KO_TO_WIN, SPECIES, level, newCreature, type Creature } from './game';

export type Side = 'a' | 'b';
export const other = (s: Side): Side => (s === 'a' ? 'b' : 'a');
/** Seconds a player has to choose each turn; a missed turn plays Strike, three in a row forfeit. */
export const TURN_MS = 30_000;
export const MISSES_TO_FORFEIT = 3;

export interface MatchSide {
  wallet: string;
  name: string;
  team: Creature[];
  active: number;
  ko: number;
  choice: string | null;
  misses: number;
}
export type MatchEvent = { side: Side; kind: 'faint' | 'switch'; creature: string };
export type MatchPhase = 'locking' | 'battle' | 'done' | 'void';
export interface Match {
  id: string;
  stake: number;
  phase: MatchPhase;
  turn: number;
  deadline: number;
  a: MatchSide;
  b: MatchSide;
  /** The last turn, in the order the creatures acted. */
  log: ({ side: Side } & ExchangeEntry)[];
  events: MatchEvent[];
  winner: Side | null;
  reason: 'knockouts' | 'forfeit' | 'timeout' | null;
}
export type MatchError = 'not-your-turn' | 'unknown-move' | 'no-charges' | 'match-over' | 'already-chosen';

/** A team snapshot: each creature at its level, full HP and charges, nothing carried in. */
export function snapshot(team: Creature[]): Creature[] {
  return team.map(c => { const s = newCreature(c.id, c.species, undefined, level(c)); s.nick = c.nick; s.anchor = c.anchor; return s; });
}

export function startMatch(id: string, stake: number, a: { wallet: string; name: string; team: Creature[] }, b: { wallet: string; name: string; team: Creature[] }, now: number): Match {
  const side = (p: typeof a): MatchSide => ({ wallet: p.wallet, name: p.name, team: snapshot(p.team), active: 0, ko: 0, choice: null, misses: 0 });
  return { id, stake, phase: 'battle', turn: 0, deadline: now + TURN_MS, a: side(a), b: side(b), log: [], events: [], winner: null, reason: null };
}

/** FNV-1a of a string: a fixed, platform-independent tie-break both client and server agree on. */
function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
/** Who acts first this turn: the higher-level creature, else a tie-break fixed by the match and turn. */
export function firstToAct(m: Match): Side {
  const la = level(m.a.team[m.a.active]), lb = level(m.b.team[m.b.active]);
  if (la !== lb) return la > lb ? 'a' : 'b';
  return fnv(`${m.id}|${m.turn}`) % 2 === 0 ? 'a' : 'b';
}

/** Records a player's move for this turn; resolves the turn when both are in. */
export function choose(m: Match, side: Side, move: string, now: number): MatchError | null {
  if (m.phase !== 'battle') return 'match-over';
  const me = m[side];
  if (me.choice !== null) return 'already-chosen';
  const c = me.team[me.active];
  const def = SPECIES[c.species].moves.find(x => x.id === move);
  if (!def) return 'unknown-move';
  if (def.max && (c.charges[def.id] ?? 0) === 0) return 'no-charges';
  me.choice = move; me.misses = 0;
  if (m[other(side)].choice !== null) resolve(m, now);
  return null;
}

/** At the deadline, a player who has not chosen plays Strike; three misses in a row forfeit. */
export function expire(m: Match, now: number): void {
  if (m.phase !== 'battle' || now < m.deadline) return;
  for (const s of ['a', 'b'] as const) {
    if (m[s].choice !== null) continue;
    m[s].misses += 1;
    if (m[s].misses >= MISSES_TO_FORFEIT) { finish(m, other(s), 'timeout'); return; }
    m[s].choice = 'strike';
  }
  resolve(m, now);
}

export function forfeit(m: Match, side: Side): void {
  if (m.phase === 'battle') finish(m, other(side), 'forfeit');
}

function finish(m: Match, winner: Side, reason: NonNullable<Match['reason']>) {
  m.phase = 'done'; m.winner = winner; m.reason = reason;
}

function resolve(m: Match, now: number) {
  const firstSide = firstToAct(m), secondSide = other(firstSide);
  const first = m[firstSide], second = m[secondSide];
  const fc = first.team[first.active], sc = second.team[second.active];
  const fm = SPECIES[fc.species].moves.find(x => x.id === first.choice)!;
  const sm = SPECIES[sc.species].moves.find(x => x.id === second.choice)!;
  const [fe, se] = exchange(fc, fm, sc, sm, { weaken: 0, landsStatus: true, spendsCharge: true });
  m.log = se ? [{ side: firstSide, ...fe }, { side: secondSide, ...se }] : [{ side: firstSide, ...fe }];
  m.events = [];
  m.turn += 1;
  m.a.choice = null; m.b.choice = null;
  // The second actor can only have fainted before acting; the first, at the turn's end.
  for (const s of [secondSide, firstSide]) {
    const side = m[s], c = side.team[side.active];
    if (c.hp > 0) continue;
    side.ko += 1;
    m.events.push({ side: s, kind: 'faint', creature: c.id });
    const next = side.ko < KO_TO_WIN ? side.team.findIndex(x => x.hp > 0) : -1;
    if (next < 0) { finish(m, other(s), 'knockouts'); return; }
    side.active = next;
    m.events.push({ side: s, kind: 'switch', creature: side.team[next].id });
  }
  m.deadline = now + TURN_MS;
}
