import { compatibility, type Compatibility } from './protocol';

/**
 * The game server. A build names it in VITE_GAME_HOST (HTTPS, unless it is
 * given as http://), as the web frontend and the Android app's bundled client
 * do; without one, the page's own origin serves the game, as in development.
 */
export function gameServer(configured: string | undefined, pageOrigin: string): URL {
  if (!configured) return new URL(pageOrigin);
  return new URL(/^https?:\/\//.test(configured) ? configured : `https://${configured}`);
}

export type Readiness = Compatibility | 'unreachable';

/** Before connecting: is the game server up, and does it speak this client's protocol? */
export async function readiness(server: URL, fetcher: typeof fetch = fetch): Promise<Readiness> {
  try {
    const response = await fetcher(new URL('/version', server), { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return 'unreachable';
    const { protocol } = await response.json();
    return Number.isInteger(protocol) ? compatibility(protocol) : 'unreachable';
  } catch {
    return 'unreachable';
  }
}
