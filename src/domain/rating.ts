/**
 * Skill rating for matchmaking: Elo. New players move faster (K=40 for their first 10 rated games,
 * then 32). Applied once per finished match, keyed to the DSM identity; voided matches are not rated.
 */
export const START_RATING = 1200;
const k = (games: number) => (games < 10 ? 40 : 32);

/** The chance Elo gives a player rated `a` of beating one rated `b`. */
export const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

/** New ratings after a decided match between a winner and a loser, with their games played so far. */
export function rate(winner: { rating: number; games: number }, loser: { rating: number; games: number }): { winner: number; loser: number } {
  return {
    winner: Math.round(winner.rating + k(winner.games) * (1 - expected(winner.rating, loser.rating))),
    loser: Math.round(loser.rating + k(loser.games) * (0 - expected(loser.rating, winner.rating))),
  };
}
