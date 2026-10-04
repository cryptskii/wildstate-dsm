import { expect, it, vi } from 'vitest';
vi.mock('../src/modules/main/patrol',()=>({startPatrol:vi.fn()}));
vi.mock('../src/modules/main/field',()=>({restAtCamp:vi.fn()}));
vi.mock('../src/modules/main/dialogue',()=>({talkToRowan:vi.fn()}));
import { Campfire } from '../src/modules/main/event';
it('anchors the animated fire so collisions cannot displace it',()=>{
 const definition:any=Campfire();const fire:any={setGraphic:vi.fn(),setMass:vi.fn(),pushable:true};
 expect(definition.mass).toBe(0);expect(definition.pushable).toBe(false);
 definition.onInit.call(fire);expect(fire.setMass).toHaveBeenCalledWith(0);expect(fire.pushable).toBe(false);
});
