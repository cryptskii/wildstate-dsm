import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Economy } from '../src/integrations/dsm/economy';
import type { DsmHost } from '../src/integrations/dsm/host';

// Adapter unit tests; fixtures do not establish DSM acceptance or ownership.
// A token's anchor follows from its policy, as DSM derives it: the same policy is the same token.
function issuingAccount() {
  const created: string[] = [];
  const host = {
    balances: async () => [{ tokenId: 'ERA', policyAnchorB32: 'NNG176RZ6ACTWCDPRNYHXZK2DCZ72SPA9Q6XWGRGQ9JGKZYTESG0', available: 1_000_000n }],
    createToken: async (p: { ticker: string; alias: string; supply: bigint; description: string }) => {
      // Both issuances are in flight before either is answered, as two players' starters were.
      await new Promise((r) => setTimeout(r, 5));
      created.push(p.ticker);
      return new Uint8Array(createHash('sha256').update(`${p.ticker}|${p.alias}|${p.supply}|${p.description}`).digest());
    },
  } as unknown as DsmHost;
  const economy = new Economy(host, join(tmpdir(), `issue-${crypto.randomUUID()}.json`), '0000000000000000000000000000000000000000000000000000');
  return { economy, created };
}

describe('issuing creatures', () => {
  it('two creatures issued at once are two objects, never one bound twice', async () => {
    const { economy, created } = issuingAccount();
    const [first, second] = await Promise.all([
      economy.issueCreature('embercub', () => {}),
      economy.issueCreature('embercub', () => {}),
    ]);
    expect(first).not.toBe(second);
    expect(new Set(created).size).toBe(2);
    expect(Object.keys(economy.record.creatures)).toHaveLength(2);
    expect(economy.record.nextSerial).toBe(3);
  });

  it('an anchor already issued to a creature is refused, not bound again', async () => {
    const { economy } = issuingAccount();
    const anchor = await economy.issueCreature('embercub', () => {});
    // The next issuance's policy is made to come out as the first one's.
    economy.record.nextSerial = economy.record.creatures[anchor].serial;
    await expect(economy.issueCreature('embercub', () => {})).rejects.toThrow('never issued to two creatures');
    expect(Object.keys(economy.record.creatures)).toEqual([anchor]);
  });
});
