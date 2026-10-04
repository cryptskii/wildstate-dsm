/**
 * RPGJS's MMORPG client names its connection with `crypto.randomUUID`, which a
 * browser offers only on a secure origin (https, or localhost). A phone on the
 * LAN loads the game from plain http, where the call is missing and the game
 * never starts. The same version-4 UUID is drawn here from
 * `crypto.getRandomValues`, the same generator, which every origin has.
 */
type Uuid = `${string}-${string}-${string}-${string}-${string}`;

function randomUuid(): Uuid {
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const cryptoWithUuid = globalThis.crypto as Crypto & { randomUUID?: () => Uuid };
if (typeof cryptoWithUuid.randomUUID !== 'function') {
  cryptoWithUuid.randomUUID = randomUuid;
}

export {};
