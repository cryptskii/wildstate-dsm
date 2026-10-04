import { startPatrol } from './patrol';
import { type EventDefinition } from '@rpgjs/server';
import { restAtCamp, talkToScarecrow } from './field';
import { talkToRowan, readWayfindingSign } from './dialogue';
export function Npc(): EventDefinition {
  return {
    onInit() { this.setGraphic('female'); startPatrol(this, 'mira'); },
    async onAction(player) { await restAtCamp(player); },
  };
}

/** The camp's fire: the logs and stones are in the map image; the flames are this sprite. */
export function Campfire(): EventDefinition {
  return { mass: 0, pushable: false, onInit() { this.setGraphic('campfire'); this.setMass(0); this.pushable = false; } };
}
/** A trainer standing on the map; TALK beside them starts the challenge (field.ts). */
export function Trainer(graphic: string): EventDefinition {
  return { onInit() { this.setGraphic(graphic); startPatrol(this, graphic); } };
}
export function Ranger(): EventDefinition {
  return { onInit() { this.setGraphic('ranger'); startPatrol(this, 'rowan'); }, async onAction(player) { await talkToRowan(player); } };
}

/** The scarecrow is already painted into the map; its event supplies interaction only. */
export function Scarecrow(): EventDefinition {
  return { mass: 0, pushable: false, async onAction(player) { await talkToScarecrow(player); } };
}

/** Wooden sign is drawn by its Tiled layer, not a moving actor. */
export function WayfindingSign(): EventDefinition {
  return { mass: 0, pushable: false, async onAction(player) { await readWayfindingSign(player); } };
}
