import { afterEach, expect, it, vi } from 'vitest';
import { heldDirection } from '../src/gui/held-direction';
afterEach(()=>vi.useRealTimers());
it('holds the native repeating control and releases it without route heartbeats',()=>{
 const applyControl=vi.fn(async()=>{}), hold=heldDirection(()=>({applyControl}));
 hold.start('right');expect(applyControl.mock.calls).toEqual([['right',true]]);
 hold.stop();expect(applyControl.mock.calls).toEqual([['right',true],['right',false]]);
 hold.stop();expect(applyControl).toHaveBeenCalledTimes(2);
});
it('releases the previous direction before turning',()=>{
 const applyControl=vi.fn(async()=>{}),hold=heldDirection(()=>({applyControl}));
 hold.start('up');hold.start('left');hold.stop();
 expect(applyControl.mock.calls).toEqual([['up',true],['up',false],['left',true],['left',false]]);
});
it('releases the original control if the engine replaces the player on reconnect',()=>{
 const old={applyControl:vi.fn(async()=>{})},fresh={applyControl:vi.fn(async()=>{})};let current=old;
 const hold=heldDirection(()=>current);hold.start('down');current=fresh;hold.stop();
 expect(old.applyControl).toHaveBeenLastCalledWith('down',false);expect(fresh.applyControl).not.toHaveBeenCalled();
});
it('does not queue movement before controls are ready',()=>{const hold=heldDirection(()=>null);hold.start('up');hold.stop();});

it('renews a held input after a render clears its keyboard state and stops on release',()=>{
 vi.useFakeTimers();let pressed=false;const control={applyControl:vi.fn(async(_name:string,down?:boolean)=>{pressed=!!down;})};
 const hold=heldDirection(()=>control);hold.start('right');pressed=false;
 vi.advanceTimersByTime(16);expect(pressed).toBe(true);
 hold.stop();expect(pressed).toBe(false);const count=control.applyControl.mock.calls.length;
 vi.advanceTimersByTime(100);expect(control.applyControl).toHaveBeenCalledTimes(count);
});
it('continues a held direction on a replacement directive',()=>{
 vi.useFakeTimers();const old={applyControl:vi.fn(async()=>{})},fresh={applyControl:vi.fn(async()=>{})};let current=old;
 const hold=heldDirection(()=>current);hold.start('up');current=fresh;vi.advanceTimersByTime(16);
 expect(old.applyControl).toHaveBeenLastCalledWith('up',false);expect(fresh.applyControl).toHaveBeenLastCalledWith('up',true);
 hold.stop();expect(fresh.applyControl).toHaveBeenLastCalledWith('up',false);
});
