/**
 * One exchange of a battle turn: the first creature acts, the second's statuses tick, the second
 * acts (unless it fainted), then the first's statuses tick. Shared by every battle the reducer runs
 * (wild, trainer team battles) and by player-vs-player matches, so the rules are written once.
 * Pure and deterministic: the same creatures and moves always give the same result.
 */
import { SPECIES, STATUSES, damageBonus, maxHp, multiplier, type Creature, type MoveDef, type StatusId } from './game';

export type ExchangeEntry = { move: string; dmg: number; mult: number; status?: string; burn: number; skipped: boolean };
/** A creature's action this turn: a move, or its trainer spent the turn on an item (already applied, `item:<id>`). */
export type Action = MoveDef | { item: string };
const isItem = (a: Action): a is { item: string } => 'item' in a;

/** How the second actor plays: a wild creature is weakened and lands no status; a trainer or a player's does. */
export type SecondRules = {
  /** Damage taken off the second actor's move (a wild creature's handicap). */
  weaken: number;
  /** Whether the second actor's status moves land a status. */
  landsStatus: boolean;
  /** Whether the second actor's move spends a charge (a player's does; an AI's does not). */
  spendsCharge: boolean;
};

export function damage(attacker: Creature, target: Creature, move: MoveDef): { dmg: number; mult: number } {
  const mult = multiplier(move.el, SPECIES[target.species].el);
  let d = (move.dmg! + damageBonus(attacker)) * mult;
  if (attacker.statuses.some(x => x.id === 'soaked')) d = Math.max(1, d - 2);
  if (target.guard) { d = d / 2; target.guard = false; }
  return { dmg: Math.max(0, Math.round(d)), mult };
}
/** Ticks the holder's statuses once; returns burn damage to apply. */
export function tick(c: Creature): number {
  let burn = 0;
  c.statuses = c.statuses.map(x => ({ ...x, turns: x.turns - 1 })).filter(x => { if (x.id === 'burn') burn += 3; return x.turns > 0; });
  return burn;
}
export function applyStatus(target: Creature, id: StatusId) {
  if (id === 'soaked') target.statuses = target.statuses.filter(x => x.id !== 'burn');
  if (!target.statuses.some(x => x.id === id)) target.statuses.push({ id, turns: STATUSES[id].turns });
}
const held = (c: Creature) => c.statuses.some(x => x.id === 'root' || x.id === 'stun');

/**
 * Resolves one exchange in place on `first` and `second`. `firstMove` was validated by the caller
 * (known move, charge available). Returns the first actor's entry and, unless the second fainted
 * before acting, the second's.
 */
export function exchange(first: Creature, firstAction: Action, second: Creature, secondAction: Action, rules: SecondRules): [ExchangeEntry, ExchangeEntry?] {
  // An item spends the trainer's turn: the creature does nothing else (and a root or stun cannot stop it).
  if (isItem(firstAction)) return finishExchange(first, { move: `item:${firstAction.item}`, dmg: 0, mult: 1, burn: 0, skipped: false }, second, secondAction, rules);
  const firstMove = firstAction;
  // A root or stun landed last turn costs this action, and no charge.
  const skipFirst = held(first);
  if (firstMove.max && !skipFirst) first.charges[firstMove.id] -= 1;
  const a: ExchangeEntry = { move: firstMove.id, dmg: 0, mult: 1, burn: 0, skipped: skipFirst };
  if (!skipFirst) {
    if (firstMove.guard) first.guard = true;
    else if (firstMove.heal) first.hp = Math.min(maxHp(first), first.hp + firstMove.heal);
    else {
      const r = damage(first, second, firstMove); a.dmg = r.dmg; a.mult = r.mult;
      second.hp = Math.max(0, second.hp - r.dmg);
      if (firstMove.status && second.hp > 0) { applyStatus(second, firstMove.status); a.status = firstMove.status; }
    }
  }
  return finishExchange(first, a, second, secondAction, rules);
}

/** The rest of an exchange once the first actor has acted: the second's statuses tick, it acts, the first's tick. */
function finishExchange(first: Creature, a: ExchangeEntry, second: Creature, secondAction: Action, rules: SecondRules): [ExchangeEntry, ExchangeEntry?] {
  const skipSecond = held(second);
  const secondBurn = second.hp > 0 ? tick(second) : 0;
  if (secondBurn) { a.burn = secondBurn; second.hp = Math.max(0, second.hp - secondBurn); }
  if (second.hp === 0) return [a];
  if (isItem(secondAction)) {
    const b: ExchangeEntry = { move: `item:${secondAction.item}`, dmg: 0, mult: 1, burn: 0, skipped: false };
    const firstBurn = first.hp > 0 ? tick(first) : 0;
    if (firstBurn) { b.burn = firstBurn; first.hp = Math.max(0, first.hp - firstBurn); }
    return [a, b];
  }
  const secondMove = secondAction;
  if (rules.spendsCharge && secondMove.max && !skipSecond) second.charges[secondMove.id] = Math.max(0, (second.charges[secondMove.id] ?? 0) - 1);
  const b: ExchangeEntry = { move: secondMove.id, dmg: 0, mult: 1, burn: 0, skipped: skipSecond };
  let landed: StatusId | undefined;
  if (!skipSecond) {
    if (secondMove.guard) second.guard = true;
    else if (secondMove.heal) second.hp = Math.min(maxHp(second), second.hp + secondMove.heal);
    else {
      const r = damage(second, first, rules.weaken ? { ...secondMove, dmg: secondMove.dmg! - rules.weaken } : secondMove); b.dmg = r.dmg; b.mult = r.mult;
      if (rules.landsStatus && secondMove.status && first.hp - r.dmg > 0) { landed = secondMove.status; b.status = secondMove.status; }
      first.hp = Math.max(0, first.hp - r.dmg);
    }
  }
  // The first actor's statuses tick at the end of the turn; one landed this turn holds into the next.
  const firstBurn = first.hp > 0 ? tick(first) : 0;
  if (firstBurn) { b.burn = firstBurn; first.hp = Math.max(0, first.hp - firstBurn); }
  if (landed && first.hp > 0) applyStatus(first, landed);
  return [a, b];
}
