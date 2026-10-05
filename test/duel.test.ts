import { expect, it } from 'vitest';
import { initialState, transition, newCreature, SPECIES, type Command, type GameState } from '../src/domain/game';

const step = (s: GameState, c: Command) => transition(s, s.revision, `command/${s.revision}`, c);

/** Plays wild battles with every starter species and a fixed script of moves, recording every state. */
function scriptedWildBattles(): unknown[] {
  const out: unknown[] = [];
  for (const species of Object.keys(SPECIES) as (keyof typeof SPECIES)[]) {
    for (const source of ['encounter', 'cast'] as const) {
      let s = initialState(`golden-${species}-${source}`);
      s.creatures[0] = newCreature(s.creatures[0].id, species, undefined, 3);
      s = step(s, { type: source });
      const moves = SPECIES[species].moves.map(m => m.id);
      for (let turn = 0; turn < 12 && s.battle?.outcome === 'active'; turn++) {
        const move = moves[[1, 2, 0, 3, 1, 0][turn % 6]];
        try { s = step(s, { type: 'move', move }); } catch (e) { out.push({ species, source, turn, error: String((e as Error).message) }); s = step(s, { type: 'move', move: 'strike' }); }
        // The fields battles had before team battles existed: these must play exactly as before.
        const { format: _f, roster: _r, bench: _b, ko: _k, events: _e, ...before } = s.battle!;
        out.push({ species, source, turn, battle: before, own: s.creatures[0] });
      }
    }
  }
  return out;
}

it('keeps every wild and pond battle exactly as it played before the shared turn engine', () => {
  // Proven against the pre-refactor reducer (same 46 turns); undefined fields dropped so both encode alike.
  expect(JSON.parse(JSON.stringify(scriptedWildBattles()))).toMatchSnapshot();
});
