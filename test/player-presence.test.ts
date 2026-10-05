import { beforeEach, expect, it, vi } from 'vitest';
const wallet=vi.hoisted(()=>({bind:undefined as undefined|((state:any)=>void)}));
vi.mock('../src/modules/main/dsm',()=>({connectWallet:vi.fn(async(_p:any,b:any)=>{wallet.bind=b;}),leave:vi.fn(),openPanel:vi.fn()}));
vi.mock('../src/modules/main/field',()=>({fieldHud:vi.fn(),checkEncounter:vi.fn(),commit:vi.fn()}));
vi.mock('../src/modules/main/journey',()=>({openJourney:vi.fn(),session:vi.fn()}));
vi.mock('../src/modules/main/lobby',()=>({leaveLobby:vi.fn(),rejoin:vi.fn(async()=>{})}));
import { reconcileAvatars } from '../src/modules/main/presence';
import { player } from '../src/modules/main/player';
function fixture(){let save='',connected=true;const creatureSave:any=()=>save;creatureSave.set=(v:string)=>{save=v;};return {id:'current',t:()=>'',name:'',through:false,throughEvent:false,_graphicScale:Object.assign(()=>1,{set:vi.fn()}),graphics:Object.assign(()=>['hero'],{set:vi.fn()}),setGraphic:vi.fn(),setHitbox:vi.fn(),getGui:()=>undefined,breakRoutes:vi.fn(),changeMap:vi.fn(async()=>{}),getCurrentMap:()=>({getPlayers:()=>[]}),creatureSave,isConnected:()=>connected,disconnect:()=>{connected=false;}} as any;}
beforeEach(()=>{wallet.bind=undefined;});
it('shows one avatar only after wallet connection, and clears it on disconnect',async()=>{
 const p=fixture();await player.onConnected!(p);player.onJoinMap!(p,p.getCurrentMap());
 expect(p.setGraphic).not.toHaveBeenCalled();expect(p.through).toBe(true);
 wallet.bind!({revision:0});expect(p.setGraphic).toHaveBeenCalledExactlyOnceWith('hero');expect(p.through).toBe(false);
 p.disconnect();player.onDisconnected!(p);expect(p.graphics.set).toHaveBeenLastCalledWith([]);expect(p.breakRoutes).toHaveBeenCalled();
});
it('does not resurrect a disconnected avatar when a wallet callback arrives late',()=>{
 const p=fixture();player.onJoinMap!(p,p.getCurrentMap());p.disconnect();wallet.bind!({revision:0});expect(p.setGraphic).not.toHaveBeenCalled();
});

it('uses a compact footprint with clearance in the one-tile gateway',async()=>{
 const p=fixture();await player.onConnected!(p);
 expect(p.setHitbox).toHaveBeenCalledWith(16,16);
 expect(p.changeMap).toHaveBeenCalledWith('simplemap',{x:360,y:168});
});

it('replaces an overlapping live avatar for the same wallet without hiding another wallet',()=>{
 const old=fixture(), current=fixture(), stranger=fixture();
 old.id='old';stranger.id='stranger';
 old.creatureSave.set(JSON.stringify({holder:'same-wallet'}));
 stranger.creatureSave.set(JSON.stringify({holder:'other-wallet'}));
 current.getCurrentMap=()=>({getPlayers:()=>[old,current,stranger]});
 player.onJoinMap!(current,current.getCurrentMap());wallet.bind!({holder:'same-wallet',revision:0});
 expect(old.graphics.set).toHaveBeenLastCalledWith([]);
 expect(old._graphicScale.set).toHaveBeenLastCalledWith(0);expect(current._graphicScale.set).toHaveBeenLastCalledWith(1);expect(old.through).toBe(true);expect(old.canMove).toBe(false);expect(old.breakRoutes).toHaveBeenCalled();
 expect(current.setGraphic).toHaveBeenCalledExactlyOnceWith('hero');expect(current.canMove).toBe(true);
 expect(stranger.graphics.set).not.toHaveBeenCalled();
 // A late disconnect for the old page must not hide the current character.
 player.onDisconnected!(old);expect(current.graphics.set).toHaveBeenCalledTimes(1);
});
it('uses the responsive player walking speed',async()=>{const p=fixture();await player.onConnected!(p);expect(p.speed).toBe(1.8);});

it('restores the player walking pace when rejoining with an old snapshot',()=>{
 const p=fixture();p.speed=4;player.onJoinMap!(p,p.getCurrentMap());expect(p.speed).toBe(1.8);
});

it('clears a retained starting avatar after a lost connection without another join',()=>{
 const stale=fixture();stale.creatureSave.set(JSON.stringify({holder:'lost-wallet'}));stale.disconnect();
 reconcileAvatars([stale]);expect(stale.graphics.set).toHaveBeenLastCalledWith([]);
 expect(stale.through).toBe(true);expect(stale.canMove).toBe(false);
});
it('repairs overlapping retained wallet avatars without hiding a different player',()=>{
 const a=fixture(),b=fixture(),other=fixture();a.id='a';b.id='b';other.id='other';
 a.creatureSave.set(JSON.stringify({holder:'retained-wallet'}));b.creatureSave.set(JSON.stringify({holder:'retained-wallet'}));other.creatureSave.set(JSON.stringify({holder:'unrelated-wallet'}));
 reconcileAvatars([a,b,other]);expect(b.graphics.set).toHaveBeenLastCalledWith([]);expect(b.canMove).toBe(false);
 expect(a.graphics.set).not.toHaveBeenCalled();expect(other.graphics.set).not.toHaveBeenCalled();
});
it('clears an old facing/animation lock when reconnecting',()=>{
 const p=fixture();p.directionFixed=true;p.animationFixed=true;player.onJoinMap!(p,p.getCurrentMap());
 expect(p.directionFixed).toBe(false);expect(p.animationFixed).toBe(false);
});
