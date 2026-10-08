import { expect, it } from 'vitest';
import { gameServer, readiness } from '../src/gameServer';
import { PROTOCOL } from '../src/protocol';

const server = new URL('https://game.example');
const answering = (status: number, body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status });

it('reaches a named game server over HTTPS unless told http://, and otherwise the page itself', () => {
  expect(gameServer('game.example', 'https://appassets.androidplatform.net').href).toBe('https://game.example/');
  expect(gameServer('http://192.168.4.46:5173', 'https://appassets.androidplatform.net').href).toBe('http://192.168.4.46:5173/');
  expect(gameServer(undefined, 'http://192.168.4.46:5173').href).toBe('http://192.168.4.46:5173/');
  expect(gameServer('', 'http://localhost:5173').host).toBe('localhost:5173');
});

it('starts only against a server speaking the same protocol', async () => {
  expect(await readiness(server, answering(200, { protocol: PROTOCOL }))).toBe('ok');
  expect(await readiness(server, answering(200, { protocol: PROTOCOL + 1 }))).toBe('update-client');
  expect(await readiness(server, answering(200, { protocol: PROTOCOL - 1 }))).toBe('server-behind');
});

it('treats a server that is down, starting, or answering nonsense as unreachable', async () => {
  expect(await readiness(server, async () => { throw new TypeError('Failed to fetch'); })).toBe('unreachable');
  expect(await readiness(server, answering(503, 'starting'))).toBe('unreachable');
  expect(await readiness(server, answering(200, { protocol: '1' }))).toBe('unreachable');
  expect(await readiness(server, async () => new Response('<!doctype html>', { status: 200 }))).toBe('unreachable');
});
