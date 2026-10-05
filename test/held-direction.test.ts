import { afterEach, expect, it, vi } from 'vitest';
import { heldDirection, type MovementControls } from '../src/gui/held-direction';
afterEach(() => vi.useRealTimers());
function directive() {
 const down = vi.fn(), up = vi.fn(), fanout = vi.fn();
 const bindings = Object.fromEntries(['up','down','left','right'].map(actionName => [actionName, {actionName, options: {keyDown: () => down(actionName), keyUp: () => up(actionName)}}]));
 return {getControls: () => bindings, applyControl: fanout, down, up};
}
it('samples one input per tick without keyboard/gamepad/joystick fan-out', () => {
 vi.useFakeTimers(); const control = directive(), hold = heldDirection(() => control);
 hold.start('down'); vi.advanceTimersByTime(1000);
 expect(control.down.mock.calls.length).toBeGreaterThanOrEqual(60);
 expect(control.down.mock.calls.length).toBeLessThanOrEqual(64);
 expect(control.down.mock.calls.every(([direction]) => direction === 'down')).toBe(true);
 expect(control.applyControl).not.toHaveBeenCalled();
 hold.stop(); const count = control.down.mock.calls.length;
 vi.advanceTimersByTime(1000); expect(control.down).toHaveBeenCalledTimes(count);
 expect(control.up.mock.calls).toEqual([['down']]); hold.stop(); expect(control.up).toHaveBeenCalledTimes(1);
});
it('releases the previous direction before turning', () => {
 const control = directive(), events: string[] = [];
 control.down.mockImplementation(direction => events.push(`press:${direction}`));
 control.up.mockImplementation(direction => events.push(`release:${direction}`));
 const hold = heldDirection(() => control); hold.start('up'); hold.start('left'); hold.stop();
 expect(events).toEqual(['press:up','release:up','press:left','release:left']);
});
it('moves a hold to replacement controls and releases both correctly', () => {
 vi.useFakeTimers(); const old = directive(), fresh = directive(); let current = old;
 const hold = heldDirection(() => current); hold.start('right'); current = fresh; vi.advanceTimersByTime(20);
 expect(old.up).toHaveBeenCalledWith('right'); expect(fresh.down).toHaveBeenCalledWith('right');
 hold.stop(); expect(fresh.up).toHaveBeenCalledWith('right');
});
it('stops when controls disappear instead of replaying movement after reconnection', () => {
 vi.useFakeTimers(); const control = directive(); let current: MovementControls | null = control;
 const hold = heldDirection(() => current); hold.start('down'); current = null; vi.advanceTimersByTime(20);
 current = control; vi.advanceTimersByTime(100);
 expect(control.down).toHaveBeenCalledTimes(1); expect(control.up).toHaveBeenCalledTimes(1);
});
it('does not queue movement before controls are ready', () => {
 const hold = heldDirection(() => null); hold.start('up'); hold.stop();
});
it('steps every displayed frame where frames exist, since phones starve timers', () => {
 vi.useFakeTimers(); let frames = 0;
 vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => { frames++; cb(performance.now()); }, 24));
 vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
 try {
  const control = directive(), hold = heldDirection(() => control);
  hold.start('down'); vi.advanceTimersByTime(240);
  expect(control.down).toHaveBeenCalledTimes(1 + frames);
  hold.stop(); const count = control.down.mock.calls.length;
  vi.advanceTimersByTime(240); expect(control.down).toHaveBeenCalledTimes(count);
 } finally { vi.unstubAllGlobals(); }
});
it('holds a direction through repeated set() and stops on set(null)', () => {
 vi.useFakeTimers(); const control = directive(), hold = heldDirection(() => control);
 hold.set('left'); vi.advanceTimersByTime(100); hold.set('left'); vi.advanceTimersByTime(100);
 expect(control.up).not.toHaveBeenCalled();
 hold.set('up'); expect(control.up).toHaveBeenCalledWith('left');
 hold.set(null); expect(control.up).toHaveBeenLastCalledWith('up');
 const count = control.down.mock.calls.length; vi.advanceTimersByTime(200); expect(control.down).toHaveBeenCalledTimes(count);
});
