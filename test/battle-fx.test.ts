import { describe, expect, it } from 'vitest';
import { SPECIES } from '../src/domain/game';
import { MOVE_DRAWINGS } from '../src/gui/battle-fx';
import { SFX_NAMES } from '../src/gui/battle-sfx';

const moves = [...new Set(Object.values(SPECIES).flatMap((s) => s.moves.map((m) => m.id)))];

describe('every move of every species', () => {
  it('is drawn as itself, by name', () => {
    for (const id of moves) expect(MOVE_DRAWINGS, id).toContain(id);
  });
  it('has its own sound', () => {
    for (const id of moves) expect(SFX_NAMES, id).toContain(id);
  });
  it('names no move the game does not have', () => {
    for (const id of MOVE_DRAWINGS) expect(moves, id).toContain(id);
  });
});
