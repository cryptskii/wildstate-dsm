import { expect, it } from 'vitest';
import { initialState, transition, stateSchema, SCARECROW_CAPSULES, SCARECROW_COOLDOWN_MS } from '../src/domain/game';
import { GameSession } from '../src/modules/main/session';
it('grants a fixed number of capsules once, without minting WILD, and persists cooldown',()=>{
 const s=initialState('alice'),now=1000;
 const gift=transition(s,s.revision,'gift/1',{type:'scarecrow-gift',now});
 expect(gift.inventory.capsules).toBe(s.inventory.capsules+SCARECROW_CAPSULES);expect(gift.coins).toBe(s.coins);
 const restored=new GameSession('alice',JSON.stringify(gift));
 expect(()=>restored.execute({type:'scarecrow-gift',now:now+SCARECROW_COOLDOWN_MS-1},gift.revision,'gift/2')).toThrow('gift-cooldown');
 expect(restored.read()).toEqual(gift);
 const next=restored.execute({type:'scarecrow-gift',now:now+SCARECROW_COOLDOWN_MS},gift.revision,'gift/2');expect(next.inventory.capsules).toBe(s.inventory.capsules+2*SCARECROW_CAPSULES);
});
it('rejects replays, invalid times and gifts during combat',()=>{
 const s=initialState('alice'),gift=transition(s,0,'gift/1',{type:'scarecrow-gift',now:1000});
 expect(()=>transition(gift,0,'gift/1',{type:'scarecrow-gift',now:2000})).toThrow('stale');
 for(const now of [-1,NaN,Infinity,1.5])expect(()=>transition(s,0,'gift',{type:'scarecrow-gift',now})).toThrow('invalid-command');
 const battle=transition(s,0,'battle',{type:'encounter'});expect(()=>transition(battle,1,'gift',{type:'scarecrow-gift',now:1000})).toThrow('battle-active');
});
it('loads existing profiles without a gift timer as eligible',()=>{
 const {scarecrowReadyAt,...old}=initialState('alice');expect(stateSchema.parse(old).scarecrowReadyAt).toBe(0);
});
