import { provideI18n, provideClientGlobalConfig, provideClientModules, Presets } from "@rpgjs/client";
import { Animation } from "@rpgjs/common";
import i18n from "../i18n";
import { provideTiledMap } from "@rpgjs/tiledmap/client";

import { provideVueGui, vueGui } from '@rpgjs/vue';
import Dialogue from '../gui/Dialogue.vue';
import Play from '../gui/Play.vue';
import Shop from '../gui/Shop.vue';
import DsmPanel from '../gui/DsmPanel.vue';
import DsmConnect from '../gui/DsmConnect.vue';
import Market from '../gui/Market.vue';

export default {
  providers: [
    provideVueGui({ createIfNotFound: true }),
    provideTiledMap({
      basePath: "map",
    }),
    provideClientGlobalConfig(),
    provideI18n(i18n),
    provideClientModules([
      {
        gui: [
          vueGui({id: 'portrait-dialogue', component: Dialogue}), vueGui({id: 'field-hud', component: Play}), vueGui({id: 'creature-battle', component: Play}),
          // DSM mode: the wallet connect code, the market, and the overlay of what runs underneath.
          vueGui({id: 'dsm-connect', component: DsmConnect}), vueGui({id: 'dsm-market', component: Market}), vueGui({id: 'bramble-shop', component: Shop}), vueGui({id: 'dsm-panel', component: DsmPanel}),
        ],
        spritesheets: [
          { id: 'ranger', image: 'spritesheets/rowan-walk-v4.png', ...Presets.RMSpritesheet(3, 4) },
          // All five characters share 32×40px map frames and four-direction walk/stand animations.
          { id: 'kade', image: 'spritesheets/kade-walk-v4.png', ...Presets.RMSpritesheet(3, 4) },
          { id: 'nessa', image: 'spritesheets/nessa-walk-v4.png', ...Presets.RMSpritesheet(3, 4) },
          // Three 32px frames at 8 fps, looping while the fire stands.
          {
            id: 'campfire', image: 'fx/campfire.png', framesWidth: 3, framesHeight: 1,
            textures: { [Animation.Stand]: { animations: () => [[
              { time: 0, frameX: 0, frameY: 0 }, { time: 8, frameX: 1, frameY: 0 }, { time: 16, frameX: 2, frameY: 0 }, { time: 24 },
            ]] } },
          },
          { id: 'hero', image: 'spritesheets/player-walk-v4.png', ...Presets.RMSpritesheet(3, 4) },
          { id: 'female', image: 'spritesheets/mira-walk-v4.png', ...Presets.RMSpritesheet(3, 4) }
        ]
      }
    ])
  ],
};
