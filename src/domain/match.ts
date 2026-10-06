/**
 * A player-vs-player match: two teams of up to three, one creature out at a time, whoever knocks
 * out all of the other side's creatures wins. Both players choose a move each turn without seeing the other's; the turn resolves
 * once both are in, through the same exchange every battle uses (src/domain/duel.ts). Each team is a
 * snapshot of the creatures as the player prepared them (HP and charges, so healing and charging
 * beforehand matters); the match never writes back to the players' own creatures.
 *
 * Pure and deterministic: the game server runs it and sends each player only move ids' results.
 * The battle and its result are the game server's (Web2), never DSM evidence.
 */
import { exchange, type Action, type ExchangeEntry } from './duel';
import { ITEMS, SPECIES, applyItem, level, type Creature, type UsableItem } from './game';

export type Side = 'a' | 'b';
export const other = (s: Side): Side => (s === 'a' ? 'b' : 'a');
/** Seconds a player has to choose each turn; a missed turn passes (does nothing), three in a row forfeit. */
export const TURN_MS = 30_000;
export const MISSES_TO_FORFEIT = 3;

export interface MatchSide {
  wallet: string;
  name: string;
  team: Creature[];
  active: number;
  ko: number;
  /** A move id, `item:<poultice|tonic>:<creature id>` (the turn spent on a bag item), or `pass` (a turn let run out). */
  choice: string | null;
  misses: number;
  /** Bag items brought into the match; spending one here also spends it from the player's bag. */
  items: Record<UsableItem, number>;
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
  /** A staked match's escrow on DSM: what the game has seen happen to it, step by step. */
  escrow?: MatchEscrow;
}
/**
 * The stakes are each player's own, locked in their own vault on one verdict cell (DSM A12); the
 * game only records what its account saw: each side's vault once locked, the verdict it decided as
 * the referee, and whether the winnings (or, for a void match, each stake) went back to a wallet.
 */
export interface MatchEscrow {
  a: string | null;
  b: string | null;
  verdict: 'a-wins' | 'b-wins' | 'void' | null;
  paid: boolean;
  refunded: { a: boolean; b: boolean };
  /** The last thing that went wrong, for the players; empty when nothing did. */
  problem: string;
}
export type MatchError = 'not-your-turn' | 'unknown-move' | 'no-charges' | 'match-over' | 'already-chosen' | 'no-item' | 'unknown-creature';

/** A team snapshot: each creature as prepared (HP and charges), with battle-only effects cleared. */
export function snapshot(team: Creature[]): Creature[] {
  return team.map(c => ({ ...structuredClone(c), guard: false, statuses: [] }));
}

type Entrant = { wallet: string; name: string; team: Creature[]; items?: Partial<Record<UsableItem, number>> };
export function startMatch(id: string, stake: number, a: Entrant, b: Entrant, now: number): Match {
  const side = (p: Entrant): MatchSide => ({ wallet: p.wallet, name: p.name, team: snapshot(p.team), active: 0, ko: 0, choice: null, misses: 0,
    items: { poultice: p.items?.poultice ?? 0, tonic: p.items?.tonic ?? 0 } });
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
  const item = parseItem(move);
  if (item) {
    const target = me.team.find(x => x.id === item.creatureId);
    if (!(item.item in ITEMS) || me.items[item.item] === 0) return 'no-item';
    if (!target || target.hp === 0) return 'unknown-creature';
    me.items[item.item] -= 1;
    me.choice = move; me.misses = 0;
    if (m[other(side)].choice !== null) resolve(m, now);
    return null;
  }
  const c = me.team[me.active];
  const def = SPECIES[c.species].moves.find(x => x.id === move);
  if (!def) return 'unknown-move';
  if (def.max && (c.charges[def.id] ?? 0) === 0) return 'no-charges';
  me.choice = move; me.misses = 0;
  if (m[other(side)].choice !== null) resolve(m, now);
  return null;
}

/** At the deadline, a player who has not chosen passes: their creature does nothing. Three misses in a row forfeit. */
export function expire(m: Match, now: number): void {
  if (m.phase !== 'battle' || now < m.deadline) return;
  for (const s of ['a', 'b'] as const) {
    if (m[s].choice !== null) continue;
    m[s].misses += 1;
    if (m[s].misses >= MISSES_TO_FORFEIT) { finish(m, other(s), 'timeout'); return; }
    m[s].choice = 'pass';
  }
  resolve(m, now);
}

export function forfeit(m: Match, side: Side): void {
  if (m.phase === 'battle') finish(m, other(side), 'forfeit');
}

/** `item:<poultice|tonic>:<creature id>` names a bag item spent on one of the side's creatures. */
export function parseItem(choice: string): { item: UsableItem; creatureId: string } | null {
  const [kind, item, ...rest] = choice.split(':');
  if (kind !== 'item' || (item !== 'poultice' && item !== 'tonic') || !rest.length) return null;
  return { item, creatureId: rest.join(':') };
}
/** A side's action: an item takes effect now and spends the turn; a move waits for the exchange. */
function actionOf(side: MatchSide): Action {
  if (side.choice === 'pass') return { pass: true };
  const item = parseItem(side.choice!);
  if (item) { applyItem(side.team.find(x => x.id === item.creatureId)!, item.item); return { item: item.item }; }
  const c = side.team[side.active];
  return SPECIES[c.species].moves.find(x => x.id === side.choice)!;
}

function finish(m: Match, winner: Side, reason: NonNullable<Match['reason']>) {
  m.phase = 'done'; m.winner = winner; m.reason = reason;
}

function resolve(m: Match, now: number) {
  const firstSide = firstToAct(m), secondSide = other(firstSide);
  const first = m[firstSide], second = m[secondSide];
  const fc = first.team[first.active], sc = second.team[second.active];
  const [fe, se] = exchange(fc, actionOf(first), sc, actionOf(second), { weaken: 0, landsStatus: true, spendsCharge: true });
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
    const next = side.team.findIndex(x => x.hp > 0);
    if (next < 0) { finish(m, other(s), 'knockouts'); return; }
    side.active = next;
    m.events.push({ side: s, kind: 'switch', creature: side.team[next].id });
  }
  m.deadline = now + TURN_MS;
}
