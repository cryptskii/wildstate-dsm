import type { RpgPlayer } from '@rpgjs/server';

const owners = new Map<string, RpgPlayer>();
const inactive = new WeakSet<RpgPlayer>();
export const isCurrentAvatar = (player: RpgPlayer) => !inactive.has(player);

/** One visible, controllable avatar per wallet, including overlapping live tabs. */
export function activateAvatar(player: RpgPlayer, holder: string) {
  const previous = owners.get(holder);
  const candidates = new Set([previous, ...(player.getCurrentMap()?.getPlayers() ?? [])]);
  for (const other of candidates) {
    if (!other || other === player) continue;
    let sameWallet = other === previous;
    try { sameWallet ||= JSON.parse(saveOf(other) || '{}').holder === holder; } catch { /* No loaded profile. */ }
    if (!sameWallet) continue;
    inactive.add(other);
    other.breakRoutes(true);
    other.graphics.set([]);
    other._graphicScale.set(0);
    other.through = true;
    other.canMove = false;
    void other.getGui('field-hud')?.close();
  }
  owners.set(holder, player);
  inactive.delete(player);
  player._graphicScale.set(1);
  player.setGraphic('hero');
  player.through = false;
  player.canMove = true;
}

export function releaseAvatar(player: RpgPlayer) {
  inactive.add(player);
  for (const [holder, owner] of owners) if (owner === player) owners.delete(holder);
}

/** A player's game save, or '' for one that has none (a connection still setting up). */
const saveOf = (player: RpgPlayer) => (typeof player.creatureSave === 'function' ? player.creatureSave() : '');

/** Reconcile retained avatars even when no new map-join hook runs after a dropped connection. */
export function reconcileAvatars(players: RpgPlayer[]) {
  const visible = new Map<string, RpgPlayer>();
  for (const player of players) {
    // One odd connection must not stop the rest from being reconciled.
    try { reconcileOne(player, players, visible); } catch { /* reconciled again on the next step */ }
  }
}

function reconcileOne(player: RpgPlayer, players: RpgPlayer[], visible: Map<string, RpgPlayer>) {
  if (!player.isConnected() || !saveOf(player) || inactive.has(player)) {
    if (player.graphics().length) player.graphics.set([]);
    if (player._graphicScale() !== 0) player._graphicScale.set(0);
    player.through = true;
    if (!player.isConnected() || inactive.has(player)) player.canMove = false;
    return;
  }
  let holder: string;
  try { holder = JSON.parse(saveOf(player)).holder; } catch { return; }
  if (!holder) return;
  const registered = owners.get(holder);
  const owner = registered && players.includes(registered) && registered.isConnected()
    ? registered : visible.get(holder);
  if (owner && owner !== player) {
    inactive.add(player);
    player.breakRoutes(true);
    player.graphics.set([]);
    player._graphicScale.set(0);
    player.through = true;
    player.canMove = false;
    void player.getGui('field-hud')?.close();
  } else {
    visible.set(holder, player);
    owners.set(holder, player);
  }
}
