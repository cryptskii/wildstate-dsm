import { expect, it } from 'vitest';
import { Direction } from '@rpgjs/common';
import { snapDirection } from '../src/gui/stick';

const R = 50;
it('stays still in the dead zone and walks the dominant axis outside it', () => {
  expect(snapDirection(3, 4, R, null)).toBeNull();
  expect(snapDirection(40, 5, R, null)).toBe(Direction.Right);
  expect(snapDirection(-40, 5, R, null)).toBe(Direction.Left);
  expect(snapDirection(5, -40, R, null)).toBe(Direction.Up);
  expect(snapDirection(5, 40, R, null)).toBe(Direction.Down);
});

it('does not flicker at the diagonal: switching axis needs a clear lean past 45°', () => {
  // 50° from the x axis: past the diagonal, but within the hysteresis band.
  const dx = Math.cos((50 * Math.PI) / 180) * 40, dy = Math.sin((50 * Math.PI) / 180) * 40;
  expect(snapDirection(dx, dy, R, Direction.Right)).toBe(Direction.Right);
  expect(snapDirection(dx, dy, R, null)).toBe(Direction.Down);
  // 65°: clearly vertical.
  expect(snapDirection(Math.cos((65 * Math.PI) / 180) * 40, Math.sin((65 * Math.PI) / 180) * 40, R, Direction.Right)).toBe(Direction.Down);
  // And back: from down, 40° is still down; 25° switches to right.
  expect(snapDirection(Math.cos((40 * Math.PI) / 180) * 40, Math.sin((40 * Math.PI) / 180) * 40, R, Direction.Down)).toBe(Direction.Down);
  expect(snapDirection(Math.cos((25 * Math.PI) / 180) * 40, Math.sin((25 * Math.PI) / 180) * 40, R, Direction.Down)).toBe(Direction.Right);
});
