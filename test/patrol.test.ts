import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@rpgjs/server', () => ({ Move: Object.fromEntries(['Right','Left','Down','Up'].map(dir => [dir.toLowerCase(), (pixels:number) => ({dir,pixels})])) }));
import { startPatrol, pauseNpc, npcPosition } from '../src/modules/main/patrol';
afterEach(() => vi.useRealTimers());
function fixture() {
 let x=100,y=200,live=true;
 const event:any={id:'npc',x:()=>x,y:()=>y,speed:0,changeDirection:vi.fn(),breakRoutes:vi.fn(),getCurrentMap:()=>map,moveRoutes:vi.fn(async(routes:any[])=>{for(const r of routes){x+=r.dir==='Right'?r.pixels:r.dir==='Left'?-r.pixels:0;y+=r.dir==='Down'?r.pixels:r.dir==='Up'?-r.pixels:0;}})};
 const map={getEvent:(id:string)=>live&&id==='npc'?event:undefined};
 const player:any={getCurrentMap:()=>map,x:()=>200,y:()=>200};
 return {event,player,place:()=>{x=300;y=400;},remove:()=>{live=false;}};
}
it('starts from the placed position, rests, walks, and stops when removed',async()=>{
 vi.useFakeTimers();const f=fixture();startPatrol(f.event,'mira');f.place();
 await vi.advanceTimersByTimeAsync(14200);expect(f.event.moveRoutes).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(400);expect(npcPosition(f.player,'mira',{x:0,y:0})).toEqual({x:316,y:384});
 f.remove();await vi.advanceTimersByTimeAsync(10000);expect(f.event.moveRoutes).toHaveBeenCalledTimes(1);
});
it('holds through overlapping interactions and resumes only after both release',async()=>{
 vi.useFakeTimers();const f=fixture();startPatrol(f.event,'mira');await vi.advanceTimersByTimeAsync(300);
 const a=pauseNpc(f.player,'mira'),b=pauseNpc(f.player,'mira');a();a();
 await vi.advanceTimersByTimeAsync(20000);expect(f.event.moveRoutes).not.toHaveBeenCalled();
 b();await vi.advanceTimersByTimeAsync(14500);expect(f.event.moveRoutes).toHaveBeenCalledTimes(1);f.remove();
});
