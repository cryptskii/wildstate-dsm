import { provideI18n, provideClientGlobalConfig, provideClientModules } from "@rpgjs/client";
import { Animation, Direction } from "@rpgjs/common";
import i18n from "../i18n";
import { provideTiledMap } from "@rpgjs/tiledmap/client";

import { provideVueGui, vueGui } from '@rpgjs/vue';
import Dialogue from '../gui/Dialogue.vue';
import Play from '../gui/Play.vue';
import Shop from '../gui/Shop.vue';
import DsmPanel from '../gui/DsmPanel.vue';
import DsmConnect from '../gui/DsmConnect.vue';
import Market from '../gui/Market.vue';
import Lobby from '../gui/Lobby.vue';

/**
 * RPG Maker character sheets (3 frames × 4 directions) with a full gait: step, pass, step, pass
 * (frames 0-1-2-1). The preset's three-frame loop ran the feet slower than the ground and skipped
 * the passing pose, so walking read as sliding.
 */
const ROW: Record<string, number> = { [Direction.Down]: 0, [Direction.Left]: 1, [Direction.Right]: 2, [Direction.Up]: 3 };
const STEP_TICKS = 8;
const walker = () => ({
  framesWidth: 3, framesHeight: 4,
  textures: {
    [Animation.Stand]: { animations: ({ direction }: { direction: string }) => [[{ time: 0, frameX: 1, frameY: ROW[direction] }]] },
    [Animation.Walk]: { animations: ({ direction }: { direction: string }) => [[
      ...[0, 1, 2, 1].map((frameX, i) => ({ time: i * STEP_TICKS, frameX, frameY: ROW[direction] })), { time: 4 * STEP_TICKS },
    ]] },
  },
});

export default {
  providers: [
    provideVueGui({ createIfNotFound: true }),
    provideTiledMap({
      basePath: "map",
    }),
    // Walking is the phone's: it moves at once and the server takes its reported position (walk.ts).
    provideClientGlobalConfig({ movementAuthority: 'client' }),
    provideI18n(i18n),
    provideClientModules([
      {
        // The phone catches up at most two fixed steps a frame, from at most 50 ms, as the server
        // does (src/modules/main/server.ts). RPGJS allows five from 250 ms: one slow frame on a phone
        // ran five steps, which made the next frame slower still, until walking stalled for a second
        // (phones, 2026-10-08: about 150 physics steps a second where 60 were due).
        sceneMap: {
          onAfterLoading(scene: unknown) {
            const map = scene as { maxFixedStepsPerTick: number; maxTickDeltaMs: number };
            map.maxFixedStepsPerTick = 2;
            map.maxTickDeltaMs = 50;
          },
        },
        gui: [
          vueGui({id: 'portrait-dialogue', component: Dialogue}), vueGui({id: 'field-hud', component: Play}), vueGui({id: 'creature-battle', component: Play}),
          // DSM mode: the wallet connect code, the market, and the overlay of what runs underneath.
          vueGui({id: 'dsm-connect', component: DsmConnect}), vueGui({id: 'dsm-market', component: Market}), vueGui({id: 'bramble-shop', component: Shop}), vueGui({id: 'dsm-panel', component: DsmPanel}), vueGui({id: 'lobby', component: Lobby}),
        ],
        spritesheets: [
          { id: 'ranger', image: 'spritesheets/rowan-walk-v4.png', ...walker() },
          // All five characters share 32×40px map frames and four-direction walk/stand animations.
          { id: 'kade', image: 'spritesheets/kade-walk-v4.png', ...walker() },
          { id: 'nessa', image: 'spritesheets/nessa-walk-v4.png', ...walker() },
          // Three 32px frames at 8 fps, looping while the fire stands.
          {
            id: 'campfire', image: 'fx/campfire.png', framesWidth: 3, framesHeight: 1,
            textures: { [Animation.Stand]: { animations: () => [[
              { time: 0, frameX: 0, frameY: 0 }, { time: 8, frameX: 1, frameY: 0 }, { time: 16, frameX: 2, frameY: 0 }, { time: 24 },
            ]] } },
          },
          { id: 'hero', image: 'spritesheets/player-walk-v4.png', ...walker() },
          // The trainer looks a player can pick (game.ts LOOKS): same frames, same gait.
          { id: 'hero-auburn', image: 'spritesheets/player-auburn-walk-v4.png', ...walker() },
          { id: 'hero-bearded', image: 'spritesheets/player-bearded-walk-v4.png', ...walker() },
          { id: 'hero-curly', image: 'spritesheets/player-curly-walk-v4.png', ...walker() },
          { id: 'female', image: 'spritesheets/mira-walk-v4.png', ...walker() }
        ]
      }
    ])
  ],
};
