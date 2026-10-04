import { expect, it, vi } from 'vitest';
import { readWayfindingSign } from '../src/modules/main/dialogue';
it('shows directions only in a closable sign-reading dialogue',async()=>{
 const gui={on:vi.fn((_event:string,_handler:any)=>{}),open:vi.fn(async(_data:any,_options:any)=>{}),close:vi.fn(),update:vi.fn()};
 const player:any={breakRoutes:vi.fn(),gui:()=>gui};
 await readWayfindingSign(player);
 expect(gui.open).toHaveBeenCalledWith(expect.objectContaining({speaker:'Wayfinding sign',portrait:null,last:true,
 message:expect.stringContaining('East: The Glowing Meadow')}),{waitingAction:true,blockPlayerInput:true});
 const data=gui.open.mock.calls[0][0] as any;
 expect(data.message).toContain('Northeast: Bramble’s Trading Post');expect(data.message).toContain('Southeast: The Pond');
 const next=gui.on.mock.calls[0][1] as any;next({page:0});expect(gui.close).toHaveBeenCalled();
});
