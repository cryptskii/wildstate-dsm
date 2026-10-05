import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { createRpgServerTransport, createSqliteNodeRoomStorage } from '@rpgjs/server/node';
import ServerModule from '../dist/server/server.js';

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const account = new URL(required('DSM_APP_HOST'));
// The account's spending ingress is never a public service.
if (account.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(account.hostname)) {
  throw new Error('DSM_APP_HOST must point to the private, local account host');
}
const origins = new Set(required('WILDSTATE_ALLOWED_ORIGINS').split(',').map(value => new URL(value.trim()).origin));
const mapUpdateToken = required('RPGJS_MAP_UPDATE_TOKEN');
const dataDir = resolve(required('WILDSTATE_DATA_DIR'));
process.env.DSM_GAME_RECORD ??= resolve(dataDir, 'dsm-game.json');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid');
const transport = createRpgServerTransport(ServerModule, {
  initializeMaps: false,
  mapUpdateToken,
  tiledBasePaths: ['src/tiled'],
  storage: createSqliteNodeRoomStorage({ databasePath: resolve(dataDir, 'rooms.sqlite') }),
});
let ready = false;
const server = http.createServer((request, response) => {
  const origin = request.headers.origin;
  if (origin && !origins.has(origin)) {
    response.writeHead(403).end('Origin refused');
    return;
  }
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.writeHead(204).end();
    return;
  }
  if (request.url === '/healthz') {
    response.writeHead(ready ? 200 : 503, { 'Content-Type': 'text/plain' }).end(ready ? 'ok' : 'starting');
    return;
  }
  void transport.handleNodeRequest(request, response, () => response.writeHead(404).end()).catch(error => {
    console.error('HTTP transport failed:', error.message);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});
const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
server.on('upgrade', (request, socket, head) => {
  if (!ready || !origins.has(request.headers.origin)) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  void transport.handleUpgrade(sockets, request, socket, head).then(handled => {
    if (!handled) socket.destroy();
  }).catch(error => {
    console.error('WebSocket transport failed:', error.message);
    socket.destroy();
  });
});
server.listen(port, '127.0.0.1', async () => {
  try {
    // Map publication uses trusted source files and the private local listener.
    const published = await transport.publishMap('simplemap', { target: `http://127.0.0.1:${port}` });
    if (!published.ok) throw new Error(`Map publication failed: ${published.status} ${await published.text()}`);
    const status = await fetch(new URL('/activity/0', account), { signal: AbortSignal.timeout(10000) });
    if (!status.ok) throw new Error(`DSM account unavailable: ${status.status}`);
    ready = true;
    console.log('Wildstate backend ready; map published and private DSM account reachable');
  } catch (error) {
    console.error('Startup failed:', error.message);
    process.exit(1);
  }
});
function stop() {
  ready = false;
  for (const socket of sockets.clients) socket.close(1001, 'Server restarting');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
