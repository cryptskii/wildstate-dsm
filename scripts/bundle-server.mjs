// The deployed game server is this one file: scripts/server.mjs and the built server module with
// the few packages they use, bundled. The runtime image installs nothing (deploy/game/Dockerfile).
import { build } from 'esbuild';

await build({
  entryPoints: ['scripts/server.mjs'],
  outfile: 'dist/backend/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // ws loads these native speedups only if present.
  external: ['bufferutil', 'utf-8-validate'],
  // Bundled CommonJS packages still call require() for Node built-ins.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'warning',
});
