import { expect, it, vi } from 'vitest';
import { followReportedPositions, withinReach } from '../src/modules/main/walk';

function fakeMap(at: { x: number; y: number }, pendingInputs: unknown[]) {
  let x = at.x, y = at.y, dir = 'down';
  const player: any = {
    pendingInputs,
    x: () => x, y: () => y, direction: () => dir,
    teleport: vi.fn(async (p: { x: number; y: number }) => { x = p.x; y = p.y; }),
    changeDirection: vi.fn((d: string) => { dir = d; }),
  };
  const map: any = { getPlayers: () => [player], stopMovement: vi.fn(), getTick: () => 42 };
  return { map, player };
}

it('accepts walking-distance reports and refuses jumps', () => {
  expect(withinReach({ x: 0, y: 0 }, { x: 0, y: 60 }, 100)).toBe(true);
  expect(withinReach({ x: 0, y: 0 }, { x: 0, y: 400 }, 100)).toBe(false);
  // A long idle gap does not license a teleport.
  expect(withinReach({ x: 0, y: 0 }, { x: 0, y: 2000 }, 60_000)).toBe(false);
});

it('places the player where the phone last reported, acknowledges it, and drops the replay queue', async () => {
  const { map, player } = fakeMap({ x: 100, y: 100 }, [
    { frame: 7, input: 'down', clientState: { x: 100, y: 104, direction: 'down' } },
    { frame: 9, input: 'down', clientState: { x: 100, y: 112, direction: 'down' } },
    { frame: 8, input: 'down', clientState: { x: 100, y: 108, direction: 'down' } },
  ]);
  await followReportedPositions(map);
  expect([player.x(), player.y()]).toEqual([100, 112]);
  expect(player.pendingInputs).toEqual([]);
  expect(map.stopMovement).toHaveBeenCalledWith(player);
  expect(player._lastFramePositions).toEqual({ frame: 9, position: { x: 100, y: 112, direction: 'down' }, serverTick: 42 });
});

it('keeps the server position, and acknowledges it, when a report is out of reach', async () => {
  const { map, player } = fakeMap({ x: 100, y: 100 }, [{ frame: 3, input: 'up', clientState: { x: 900, y: 900 } }]);
  await followReportedPositions(map);
  expect(player.teleport).not.toHaveBeenCalled();
  expect(player._lastFramePositions.position).toMatchObject({ x: 100, y: 100 });
});
