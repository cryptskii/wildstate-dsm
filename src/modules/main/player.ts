import { type RpgPlayerHooks } from '@rpgjs/server';
import { openJourney, session } from './journey';
import { fieldHud, checkEncounter, commit } from './field';
import { activateAvatar, isCurrentAvatar, releaseAvatar } from './presence';
import { connectWallet, leave, openPanel } from './dsm';
import { leaveLobby, rejoin } from './lobby';

export const player: RpgPlayerHooks = {
  props: { creatureSave: String },
  async onConnected(player) {
    player.speed = 1.8; // Responsive player pace; NPC patrol speed stays at 1.
    player.setHitbox(16, 16); // Footprint leaves eight pixels of clearance on each side of the gate.
    player.throughEvent = false; // Characters remain solid; NPC routes avoid the main path.
    player.name = player.t('game.name'); player.graphics.set([]);
    player.through = true; // A connection waiting for a wallet has no map avatar.
    // Centre the smaller footprint on the map start at (368,176).
    await player.changeMap('simplemap', { x: 360, y: 168 });
  },
  onJoinMap(player) {
    player.animationFixed = false;
    player.directionFixed = false;
    player.breakRoutes(true);
    player.speed = 1.8; // Reapply after a reconnect restores the player snapshot.
    player.setHitbox(16, 16);
    player.graphics.set([]);
    player.through = true;
    // The engine retains disconnected sessions for reconnection. Hide their avatars.
    for (const other of player.getCurrentMap()?.getPlayers() ?? []) {
      if (other.id !== player.id && (!other.isConnected() || !other.creatureSave())) {
        other.graphics.set([]);
        other.through = true;
      }
    }
    // The player's wallet first: its account keys the game profile.
    openPanel(player);
    if (player.creatureSave()) { activateAvatar(player, JSON.parse(player.creatureSave()).holder); fieldHud(player); void rejoin(player); return; }
    connectWallet(player, (state) => {
      if (!player.isConnected()) return;
      player.creatureSave.set(JSON.stringify(state));
      activateAvatar(player, state.holder);
      fieldHud(player);
      void rejoin(player);
    }).catch((e) => {
      player.gui('dsm-connect').update({ code: '', status: `Connecting failed: ${e instanceof Error ? e.message : String(e)}` });
    });
  },
  async onMove(player) { if (isCurrentAvatar(player)) await checkEncounter(player); },
  async onInput(player, { action }) {
    if (!isCurrentAvatar(player) || !player.creatureSave()) return;
    if (action === 'escape' && session(player).read().battle?.outcome !== 'active') { await openJourney(player, commit); fieldHud(player); }
  },
  onDisconnected(player) {
    leaveLobby(player);
    releaseAvatar(player);
    player.breakRoutes(true);
    player.graphics.set([]);
    player.through = true;
    leave(player);
  },
};
