import { Direction } from '@rpgjs/common';

/** Below this share of the radius the thumb is resting: no direction. */
export const DEAD_ZONE = 0.15;
/**
 * Hysteresis past the diagonal: once walking along one axis, the thumb must lean this many degrees
 * past 45° toward the other axis before the direction switches, so it does not flicker.
 */
export const HYSTERESIS_DEG = 12;
const SWITCH = Math.tan(((45 + HYSTERESIS_DEG) * Math.PI) / 180);

/** The four-way direction a stick offset (dx right, dy down, in px) asks for. */
export function snapDirection(dx: number, dy: number, radius: number, current: Direction | null): Direction | null {
  if (Math.hypot(dx, dy) < DEAD_ZONE * radius) return null;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const horizontal = current === Direction.Left || current === Direction.Right;
  const vertical = current === Direction.Up || current === Direction.Down;
  const alongX = horizontal ? ay <= ax * SWITCH : vertical ? ax > ay * SWITCH : ax >= ay;
  return alongX ? (dx < 0 ? Direction.Left : Direction.Right) : (dy < 0 ? Direction.Up : Direction.Down);
}
