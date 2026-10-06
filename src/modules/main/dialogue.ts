import { pauseNpc } from './patrol';
import type { RpgPlayer } from '@rpgjs/server';
import { LOOKS, lookPortrait } from '../../domain/game';
export type DialogueLine = { speaker: string; portrait: 'player' | 'mira' | 'rowan' | 'kade' | 'nessa' | null; message: string };
const speaking = new WeakSet<RpgPlayer>();
export const isSpeaking = (player: RpgPlayer) => speaking.has(player);
function ownPortrait(player: RpgPlayer): string {
  try {
    const look = JSON.parse((typeof player.creatureSave === 'function' && player.creatureSave()) || '{}').look;
    return lookPortrait(LOOKS.includes(look) ? look : 'classic');
  } catch { return lookPortrait('classic'); }
}
export async function portraitDialogue(player: RpgPlayer, lines: DialogueLine[]) {
  if (!lines.length || speaking.has(player)) return;
  const releases = [...new Set(lines.flatMap(line => line.portrait && line.portrait !== 'player' ? [line.portrait] : []))].map(name => pauseNpc(player, name));
  speaking.add(player);
  player.breakRoutes(true);
  const gui = player.gui('portrait-dialogue');
  let page = 0;
  // The player's own lines show the look they chose.
  const own = ownPortrait(player);
  const projection = () => ({ ...lines[page], portrait: lines[page].portrait === 'player' ? own : lines[page].portrait, page, last: page === lines.length - 1 });
  gui.on<{ page: number }>('next', data => {
    if (data?.page !== page) return;
    if (page === lines.length - 1) gui.close();
    else { page++; gui.update(projection()); }
  });
  try { await gui.open(projection(), { waitingAction: true, blockPlayerInput: true }); }
  finally { speaking.delete(player); releases.forEach(release => release()); }
}
export async function talkToRowan(player: RpgPlayer) {
  await portraitDialogue(player, [
    { speaker: 'Rowan · Expedition Ranger', portrait: 'rowan', message: 'Keep an eye out for Voltusk and Tidefin. The meadow has more surprises than it first lets on. Weaken a creature before throwing a capsule.' },
    { speaker: 'You', portrait: 'player', message: 'I’ll build my collection one encounter at a time—and bring everyone back to camp when they need rest.' },
    { speaker: 'Rowan · Expedition Ranger', portrait: 'rowan', message: 'That’s the spirit. Leave the meadow and walk back in for a new encounter. Mira will restore your creatures’ HP and special moves.' },
  ]);
}

export async function readWayfindingSign(player: RpgPlayer) {
  await portraitDialogue(player, [{ speaker: 'Wayfinding sign', portrait: null,
    message: 'East: The Glowing Meadow. Northeast: Bramble’s Trading Post. Southeast: The Pond.' }]);
}
