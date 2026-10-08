/**
 * The game's record on disk (phones, 2026-10-08): written at once, so an irreversible step that
 * follows a save finds it there, and compactly, not pretty-printed.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Economy } from '../src/integrations/dsm/economy';
import { b32 } from '../src/integrations/dsm/host';

describe('the record on disk', () => {
  it('writes each save at once, compactly', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'wildstate-record-')), 'record.json');
    const e = new Economy({} as never, path, b32(new Uint8Array(32).fill(1)));
    e.record.nextSerial = 7;
    e.save();
    expect(JSON.parse(readFileSync(path, 'utf8')).nextSerial).toBe(7);
    e.record.nextSerial = 8;
    e.save();
    const text = readFileSync(path, 'utf8');
    expect(JSON.parse(text).nextSerial).toBe(8);
    expect(text).not.toContain('\n');
  });
});
