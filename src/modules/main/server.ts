import { defineModule } from "@rpgjs/common";
import { RpgServer, type RpgMap } from "@rpgjs/server";
import { reconcileAvatars } from './presence';
import { followReportedPositions } from './walk';
import { player } from './player'
import { Npc, Ranger, Campfire, Trainer, Scarecrow, WayfindingSign } from "./event";
import { MIRA, ROWAN, TRAINER_SPOTS, SCARECROW, WAY_SIGN } from './field';

/** The prototype centres each character on its tile; RPGJS places an event by its hitbox's top-left. */
const onTile = (p: { x: number; y: number }) => ({ x: p.x - 16, y: p.y - 16 });

/**
 * A map behind on its fixed steps catches up at most two a tick, from at most 50 ms of lag. RPGJS
 * allows five from 250 ms: on a starved two-core server each late tick ran five steps, which made
 * the next one later still, until the game held both cores and starved everything beside it.
 * Walking is the client's own, so a dropped step costs nothing a player sees.
 */
const caught = new WeakSet<object>();
function boundCatchUp(map: RpgMap): void {
  if (caught.has(map)) return;
  const tick = map as unknown as { maxFixedStepsPerTick: number; maxTickDeltaMs: number };
  tick.maxFixedStepsPerTick = 2;
  tick.maxTickDeltaMs = 50;
  caught.add(map);
}

export default defineModule<RpgServer>({
  player,
  engine: {
    async onStep(engine) {
      const map = engine.getCurrentRoom<RpgMap>();
      if (!map || typeof map.getPlayers !== 'function') return;
      boundCatchUp(map);
      await followReportedPositions(map);
      reconcileAvatars(map.getPlayers());
    },
  },
  maps: [{
    id: 'simplemap',
    events: [
      { id: 'npc', ...onTile(MIRA), event: Npc() },
      { id: 'wayfinding-sign', ...onTile(WAY_SIGN), event: WayfindingSign() },
      { id: 'scarecrow', ...onTile(SCARECROW), event: Scarecrow() },
      { id: 'rowan', ...onTile(ROWAN), event: Ranger() },
      // The `campfire` object in simplemap.tmx's Objects layer.
      { id: 'campfire', x: 256, y: 416, event: Campfire() },
      ...Object.entries(TRAINER_SPOTS).map(([id, p]) => ({ id: `trainer-${id}`, ...onTile(p), event: Trainer(id) })),
    ],
  }],
});
