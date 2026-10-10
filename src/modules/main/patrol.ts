import { Move, type RpgEvent, type RpgPlayer } from '@rpgjs/server';
import { Direction } from '@rpgjs/common';
type Stop = { dx: number; dy: number; pause: number; face: Direction };
const LOOPS: Record<string, Stop[]> = {
 // Patrols remain on grass away from the north/south path and fence opening.
 // Mira keeps the camp from just below the fire, facing it, and stays put: the bulletin board's front stays clear.
 mira: [{dx:0,dy:0,pause:20,face:Direction.Up}],
 rowan: [{dx:0,dy:0,pause:12,face:Direction.Right},{dx:-32,dy:0,pause:18,face:Direction.Up}],
 kade: [{dx:0,dy:0,pause:16,face:Direction.Down},{dx:32,dy:0,pause:18,face:Direction.Left}],
 nessa: [{dx:0,dy:0,pause:20,face:Direction.Left},{dx:0,dy:-32,pause:14,face:Direction.Down}],
};
const EVENT_IDS: Record<string,string> = {mira:'npc',rowan:'rowan',kade:'trainer-kade',nessa:'trainer-nessa'};
const holds = new WeakMap<RpgEvent,number>();
const delay = (ms:number) => new Promise<void>(resolve => { const timer=setTimeout(resolve,ms); timer.unref?.(); });
export function npcFor(player:RpgPlayer, name:string):RpgEvent|undefined {
 return player.getCurrentMap?.()?.getEvent(EVENT_IDS[name] ?? name);
}
export function npcPosition(player:RpgPlayer,name:string,fallback:{x:number;y:number}) {
 const event=npcFor(player,name);
 return event ? {x:event.x()+16,y:event.y()+16} : fallback;
}
export function pauseNpc(player:RpgPlayer,name:string):()=>void {
 const event=npcFor(player,name);
 if(!event)return ()=>{};
 holds.set(event,(holds.get(event)??0)+1);
 event.breakRoutes(true);
 const dx=player.x()-event.x(),dy=player.y()-event.y();
 event.changeDirection(Math.abs(dx)>Math.abs(dy) ? dx>0?Direction.Right:Direction.Left : dy>0?Direction.Down:Direction.Up);
 let released=false;
 return ()=>{if(released)return;released=true;holds.set(event,Math.max(0,(holds.get(event)??1)-1));};
}
/** Absolute stops keep interrupted routes from drifting. Movement uses RPGJS collision handling. */
export function startPatrol(event:RpgEvent,name:string) {
 const stops=LOOPS[name];if(!stops)return;
 event.speed=1;
 event.through=false; // Solid NPCs; their routes stay clear of the gate and main path.
 const exists=()=>event.getCurrentMap()?.getEvent(event.id)===event;
 void (async()=>{
  await delay(300); // Event placement finishes after onInit.
  const origin={x:event.x(),y:event.y()};
  let index=0;
  while(exists()){
   if(holds.get(event)){await delay(150);continue;}
   const stop=stops[index],target={x:origin.x+stop.dx,y:origin.y+stop.dy};
   const dx=target.x-event.x(),dy=target.y-event.y();
   const routes=[];
   if(Math.abs(dx)>1)routes.push(dx>0?Move.right(Math.ceil(dx/event.speed)):Move.left(Math.ceil(-dx/event.speed)));
   if(Math.abs(dy)>1)routes.push(dy>0?Move.down(Math.ceil(dy/event.speed)):Move.up(Math.ceil(-dy/event.speed)));
   if(routes.length)await event.moveRoutes(routes,{onStuck:()=>false,stuckTimeout:600});
   if(!exists())break;
   if(holds.get(event))continue;
   event.changeDirection(stop.face);
   const until=Date.now()+stop.pause*1000;
   while(exists()&&Date.now()<until&&!holds.get(event))await delay(150);
   if(holds.get(event))continue;
   index=(index+1)%stops.length;
  }
 })().catch(error=>console.warn('NPC patrol stopped',name,error));
}

