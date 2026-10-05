import "./randomUuid";
import { startGame, provideMmorpg } from "@rpgjs/client";
import configClient from "./config/config.client";
import { mergeConfig } from "@signe/di";

startGame(
  mergeConfig(configClient, {
    providers: [provideMmorpg({
      host: import.meta.env.VITE_GAME_HOST || undefined,
      socketOptions: { maxRetries: 10 },
    })],
  }) 
);
