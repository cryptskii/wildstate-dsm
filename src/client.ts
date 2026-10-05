import "./randomUuid";
import { startGame, provideMmorpg } from "@rpgjs/client";
import configClient from "./config/config.client";
import { mergeConfig } from "@signe/di";
import { gameServer, readiness } from "./gameServer";
import { showNotice } from "./gui/notice";

const server = gameServer(import.meta.env.VITE_GAME_HOST, window.location.origin);

readiness(server).then((state) => {
  if (state !== 'ok') return showNotice(state);
  startGame(
    mergeConfig(configClient, {
      providers: [provideMmorpg({
        host: server.host,
        socketOptions: { maxRetries: 10, protocol: server.protocol === 'https:' ? 'wss' : 'ws' },
      })],
    })
  );
});
