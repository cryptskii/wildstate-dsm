import "./randomUuid";
import { startGame, provideMmorpg } from "@rpgjs/client";
import configClient from "./config/config.client";
import { mergeConfig } from "@signe/di";
import { gameServer, readiness } from "./gameServer";
import { showNotice } from "./gui/notice";

const server = gameServer(import.meta.env.VITE_GAME_HOST, window.location.origin);

// The logo splash (index.html) shows from the first frame; it fades once the game or a notice is up,
// after at least a moment, so it reads as a title card rather than a flicker.
const openedAt = performance.now();
function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  setTimeout(() => { splash.classList.add('out'); setTimeout(() => splash.remove(), 600); }, Math.max(0, 1800 - (performance.now() - openedAt)));
}

readiness(server).then((state) => {
  if (state !== 'ok') { showNotice(state); hideSplash(); return; }
  startGame(
    mergeConfig(configClient, {
      providers: [provideMmorpg({
        host: server.host,
        socketOptions: { maxRetries: 10, protocol: server.protocol === 'https:' ? 'wss' : 'ws' },
      })],
    })
  ).finally(hideSplash);
});
