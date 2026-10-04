import { type RpgPlayer, type RpgWritableSignal } from '@rpgjs/server';
import { GameError, SPECIES, level, score, type Command, type GameState } from '../../domain/game';
import { GameSession } from './session';

declare module '@rpgjs/server' {
  interface RpgPlayer { creatureSave: RpgWritableSignal<string>; }
}
const busy = new WeakSet<RpgPlayer>();
/** The player's game data: loaded once their wallet connected (`connectWallet` binds it). */
export function session(player: RpgPlayer): GameSession {
  const saved = player.creatureSave();
  if (!saved) throw new Error('no game profile yet: the wallet is not connected');
  return new GameSession(JSON.parse(saved).holder, saved);
}
const chargeSummary = (c: { species: string; charges: Record<string, number> }) =>
  SPECIES[c.species].moves.filter(m => m.max).map(m => `${m.name} ${c.charges[m.id] ?? 0}/${m.max}`).join(', ');
/** `commit` is the field's: every command goes through the reducer and then to DSM. */
export async function openJourney(player: RpgPlayer, commit: (player: RpgPlayer, command: Command, revision: number) => GameState) {
  if (busy.has(player)) return;
  busy.add(player);
  try {
    while (true) {
      const local = session(player);
      const state = local.read();
      const battle = state.battle;
      let command: Command | undefined;
      if (battle?.outcome === 'active') {
        const own = state.creatures.find(c => c.id === battle.creatureId)!;
        const choice = await player.showChoices(player.t('game.battle', {
          turn: battle.turn + 1, species: player.t(`game.species.${battle.wild.species}`),
          hp: battle.wild.hp, ownHp: own.hp, charges: chargeSummary(own),
        }), [
          ...SPECIES[own.species].moves.map(m => ({ text: m.max ? `${m.name} (${own.charges[m.id] ?? 0}/${m.max})` : m.name, value: m.id })),
          { text: player.t('game.capture'), value: 'capture' },
          { text: player.t('game.escape'), value: 'escape' },
        ]);
        if (!choice) return;
        const picked = choice.value;
        if (typeof picked === 'string' && SPECIES[own.species].moves.some(m => m.id === picked)) command = { type: 'move', move: picked };
        if (choice.value === 'capture') command = { type: 'capture' };
        if (choice.value === 'escape') command = { type: 'escape' };
      } else {
        const party = state.creatures.map(c => player.t('game.creature', {
          species: c.nick ? `${c.nick} (${player.t(`game.species.${c.species}`)})` : player.t(`game.species.${c.species}`),
          level: level(c), hp: c.hp, charges: chargeSummary(c),
        })).join('; ');
        const choice = await player.showChoices(player.t('game.status', {
          party, capsules: state.inventory.capsules, coins: state.coins, score: score(state),
          branch: player.t(`game.branch.${state.campaign.branch}`),
        }), [
          { text: player.t('game.explore'), value: 'encounter' },
          { text: player.t('game.heal'), value: 'heal' },
          { text: player.t('game.campaign'), value: 'campaign' },
          { text: player.t('game.leave'), value: 'leave' },
        ]);
        if (!choice || choice.value === 'leave') return;
        if (choice.value === 'campaign') {
          const path = await player.showChoices(player.t('game.choice'), [
            { text: player.t('game.sanctuary'), value: 'sanctuary' },
            { text: player.t('game.rangers'), value: 'rangers' },
          ]);
          if (path?.value === 'sanctuary' || path?.value === 'rangers') command = { type: 'campaign', branch: path.value };
        } else if (choice.value === 'encounter' || choice.value === 'heal') {
          command = { type: choice.value };
        }
      }
      if (!command) continue;
      try {
        // The revision read before the dialog: another accepted action cannot be overwritten.
        const next = commit(player, command, state.revision);
        if (next.battle && next.battle.outcome !== 'active' && battle?.outcome === 'active') {
          await player.showText(player.t('game.outcome', { outcome: player.t(`game.outcome.${next.battle.outcome}`) }));
        } else if (command.type === 'heal') await player.showText(player.t('game.restored'));
        else if (command.type === 'campaign') await player.showText(player.t('game.committed', { branch: player.t(`game.branch.${command.branch}`) }));
      } catch (error) {
        if (!(error instanceof GameError)) throw error;
        await player.showText(player.t(`game.error.${error.code}`));
      }
    }
  } finally { busy.delete(player); }
}
