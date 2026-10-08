/**
 * How long a character's drawn position takes to reach a new position, in ms. Stands in for
 * @rpgjs/client's RecoilSmoothing (vite.config.ts swaps it in), which glides only during a
 * knockback and otherwise draws each step at once.
 *
 * Drawn at once, a walk stutters: the body moves in whole pixels, one step per rendered frame,
 * so on a phone at ~30 fps it jumps 1, 2, 1, 2 px at uneven moments, and another player's
 * character jumps several pixels with each network update. Gliding over each short step draws
 * one even motion. Only the picture moves this way; the body, and every position the game
 * reports, stays where it is.
 */
const GLIDE_MS = 80;
/** A jump this far is a teleport or a map change: drawn at once, never slid across the map. */
const TELEPORT_PX = 128;

export class RecoilSmoothing {
  /** The same glide for a knockback as for a step, so the client's knockback flag changes nothing. */
  duration(_knockback: boolean, current: number, target: number, _now: number): number {
    return Math.abs(target - current) > TELEPORT_PX ? 0 : GLIDE_MS;
  }
}
