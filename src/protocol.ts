/**
 * What a client and the game server must agree on. The Android app carries its
 * client, and a server update cannot change a client already installed: bump
 * this when a server change would break installed clients, and they ask for an
 * update instead of playing against a server they no longer understand.
 */
export const PROTOCOL = 2;

/** What a client makes of the protocol the game server reports. */
export type Compatibility = 'ok' | 'update-client' | 'server-behind';

export function compatibility(server: number): Compatibility {
  return server === PROTOCOL ? 'ok' : server > PROTOCOL ? 'update-client' : 'server-behind';
}
