import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Economy } from '../src/integrations/dsm/economy';
import { b32, type DsmHost } from '../src/integrations/dsm/host';
import { newCreature } from '../src/domain/game';
import { SPECIES_IDS, birthCreatureState, creatureRecord, creatureRecordDigest, creatureState, latestCreatureState } from '../src/domain/program';

// The account's authored objects, as the storage nodes would hold them: every payload published on
// each topic, in order. What a wallet reads before it locks a stake is exactly these.
function account() {
  const objects = new Map<string, Uint8Array[]>();
  const host = {
    async readAuthored(_author: Uint8Array, topic: Uint8Array) {
      return { complete: true, objects: (objects.get(b32(topic)) ?? []).map((payload) => ({ payload })) };
    },
    async publishAuthored(topic: Uint8Array, payload: Uint8Array) {
      objects.set(b32(topic), [...(objects.get(b32(topic)) ?? []), payload]);
      return { stored: true };
    },
  };
  const device = b32(new Uint8Array(32).fill(7));
  const economy = new Economy(host as unknown as DsmHost, join(mkdtempSync(join(tmpdir(), 'wildstate-')), 'record.json'), device);
  // The creatures this account issued, as issueCreature records them.
  economy.record.creatures[anchorText] = { species: 'mossling', serial: 1, ticker: 'MOS0001' };
  return { economy, objects };
}

const anchor = new Uint8Array(32).fill(9);
const anchorText = b32(anchor);

describe('a creature\'s published states', () => {
  it('publishes the birth state it was issued in, then a successor naming the latest only when the state changed', async () => {
    const { economy, objects } = account();
    const c = { ...newCreature('c1', 'mossling', undefined, 3), anchor: anchorText };
    const grown = creatureState(c, anchor);
    await economy.publishState(anchorText, grown);
    await economy.publishState(anchorText, grown);
    // Born at level 1 whatever it has played to (owner ruling 2026-10-06), then the grown state.
    const birth = creatureRecord(null, birthCreatureState(anchor, SPECIES_IDS.indexOf('mossling')));
    expect(objects.get(anchorText)).toEqual([birth, creatureRecord(creatureRecordDigest(birth), grown)]);
    c.hp -= 5; c.xp += 7;
    const hurt = creatureState(c, anchor);
    await economy.publishState(anchorText, hurt);
    const records = objects.get(anchorText)!;
    expect(records).toHaveLength(3);
    expect(records[2]).toEqual(creatureRecord(creatureRecordDigest(records[1]), hurt));
    // What a wallet reads: the tip of the one chain from birth is the state the game fields.
    expect(Buffer.from(latestCreatureState(anchor, records).state).equals(Buffer.from(hurt))).toBe(true);
  });

  it('publishes only the birth record for a creature still at its birth state', async () => {
    const { economy, objects } = account();
    const born = birthCreatureState(anchor, SPECIES_IDS.indexOf('mossling'));
    await economy.publishState(anchorText, born);
    expect(objects.get(anchorText)).toEqual([creatureRecord(null, born)]);
  });

  it('refuses to publish over two histories of one creature', async () => {
    const { economy, objects } = account();
    const c = { ...newCreature('c1', 'tidefin', undefined, 2), anchor: anchorText };
    const first = creatureState(c, anchor);
    c.hp -= 1;
    objects.set(anchorText, [creatureRecord(null, first), creatureRecord(null, creatureState(c, anchor))]);
    c.hp -= 1;
    await expect(economy.publishState(anchorText, creatureState(c, anchor))).rejects.toThrow(/two states it was issued with/);
  });

  it('publishes two states asked for at once one after the other, as one chain, never two successors of one record', async () => {
    const { economy, objects } = account();
    const c = { ...newCreature('c1', 'mossling', undefined, 3), anchor: anchorText };
    const grown = creatureState(c, anchor);
    c.hp -= 4;
    const hurt = creatureState(c, anchor);
    // Its first record after its delivery, and its state for a staked match, both under way.
    await Promise.all([economy.publishState(anchorText, grown), economy.publishState(anchorText, hurt)]);
    const records = objects.get(anchorText)!;
    expect(records).toHaveLength(3);
    expect(records[2]).toEqual(creatureRecord(creatureRecordDigest(records[1]), hurt));
    expect(Buffer.from(latestCreatureState(anchor, records).state).equals(Buffer.from(hurt))).toBe(true);
  });
});
