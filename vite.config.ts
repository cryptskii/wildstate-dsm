import { defineConfig } from 'vite';
import { rpgjs, tiledMapFolderPlugin } from '@rpgjs/vite';
import vue from '@vitejs/plugin-vue';
import startServer from './src/server';

export default defineConfig(({ command }) => {
  // Wildstate runs on DSM: what a player owns is in their wallet, and the game's
  // own account (dsm-app-host) is how the game reaches it. No account, no game.
  if (command === 'serve' && !process.env.DSM_APP_HOST) {
    throw new Error('Wildstate runs on DSM: set DSM_APP_HOST to the game account host (dsm-app-host), e.g. http://127.0.0.1:8787');
  }
  return {
    optimizeDeps: {
      include: ['pixi.js > @xmldom/xmldom']
    },
    plugins: [vue(),
      tiledMapFolderPlugin({
        sourceFolder: './src/tiled',      // Folder containing your TMX files
        publicPath: '/map',               // Public URL path for maps
        allowedExtensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
        buildOutputPath: 'map'            // Match the runtime Tiled URL prefix
      }),
      ...rpgjs({
        server: startServer
      })
    ],
  };
});
