import "./randomUuid";
import { startGame, provideMmorpg, inject, RpgClientEngine } from "@rpgjs/client";
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
  ).then(fillScreen).finally(hideSplash);
});

/**
 * The map (800 x 640) is shorter than a phone screen is tall: at its own size it ends above the
 * screen's bottom edge and leaves a black band there, where the thumbstick sits. The camera zooms
 * just enough for the map to cover the whole screen, whatever its shape, and keeps it so on resize.
 */
function fillScreen(context: Parameters<typeof inject>[1]) {
  const engine = inject(RpgClientEngine, context) as unknown as { canvasApp?: { stage?: unknown } };
  type Camera = { worldWidth: number; worldHeight: number; screenWidth: number; screenHeight: number; scale: { x: number }; setZoom(z: number, center?: boolean): void };
  const find = (node: any): Camera | undefined => {
    if (!node) return undefined;
    if (typeof node.toWorld === 'function' && typeof node.setZoom === 'function') return node;
    for (const child of node.children ?? []) { const found = find(child); if (found) return found; }
    return undefined;
  };
  const fit = () => {
    const camera = find(engine.canvasApp?.stage);
    if (!camera || !camera.worldWidth || !camera.worldHeight) return;
    const zoom = Math.max(1, camera.screenHeight / camera.worldHeight, camera.screenWidth / camera.worldWidth);
    if (Math.abs(camera.scale.x - zoom) > 0.001) camera.setZoom(zoom, true);
  };
  // The phone's WebView debugger reads the scene through this (debug builds only expose it).
  if (import.meta.env.VITE_INSPECT) (globalThis as any).__wildstate = { engine };
  // The scene runs on its own loop, not the Pixi app's ticker: check on a timer instead.
  setInterval(fit, 250);
}
