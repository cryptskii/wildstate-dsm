/**
 * The matchmaker pairs players waiting at the same stake whose ratings are close. The allowed
 * rating gap widens the longer either of them has waited, so nobody waits forever: after a minute
 * anyone at the same stake will do. Pure: the same queue and time always pair the same way.
 */
/** Stakes players can wager, in WILD; 0 is a free match. */
export const STAKE_TIERS = [0, 5, 10, 25] as const;
export type Stake = (typeof STAKE_TIERS)[number];

export interface Ticket { wallet: string; rating: number; stake: number; since: number }

/** The rating gap a player who has waited `ms` accepts. */
export function window(ms: number): number {
  if (ms >= 60_000) return Number.POSITIVE_INFINITY;
  return Math.min(600, 100 + 50 * Math.floor(ms / 10_000));
}

/** Pairs as many tickets as it can, longest-waiting first, each with the closest-rated partner it accepts. */
export function pair(queue: Ticket[], now: number): [Ticket, Ticket][] {
  const waiting = [...queue].sort((x, y) => x.since - y.since || (x.wallet < y.wallet ? -1 : 1));
  const taken = new Set<string>();
  const pairs: [Ticket, Ticket][] = [];
  for (const t of waiting) {
    if (taken.has(t.wallet)) continue;
    let best: Ticket | undefined;
    for (const o of waiting) {
      if (o.wallet === t.wallet || taken.has(o.wallet) || o.stake !== t.stake) continue;
      const gap = Math.abs(o.rating - t.rating);
      if (gap > Math.max(window(now - t.since), window(now - o.since))) continue;
      if (!best || gap < Math.abs(best.rating - t.rating)) best = o;
    }
    if (best) { taken.add(t.wallet); taken.add(best.wallet); pairs.push([t, best]); }
  }
  return pairs;
}
