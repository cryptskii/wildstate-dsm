import { describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Economy } from '../src/integrations/dsm/economy';
import type { DsmHost } from '../src/integrations/dsm/host';

// Adapter unit tests; fixtures do not establish DSM acceptance or ownership.
function fundingAccount(start: bigint, delta = 10_000n, success = true) {
  let available = start;
  const claimFaucet = vi.fn(async () => {
    if (success) available += delta;
    return { success, message: 'fixture refusal' };
  });
  const host = {
    balances: async () => [{ tokenId: 'ERA', policyAnchorB32: 'NNG176RZ6ACTWCDPRNYHXZK2DCZ72SPA9Q6XWGRGQ9JGKZYTESG0', available }],
    claimFaucet,
  } as unknown as DsmHost;
  const economy = new Economy(host, join(tmpdir(), `funding-${crypto.randomUUID()}.json`), '0000000000000000000000000000000000000000000000000000');
  return { economy, claimFaucet };
}

describe('liquidity funding uses observed host balances', () => {
  it('claims repeatedly until the requested amount is covered', async () => {
    const { economy, claimFaucet } = fundingAccount(0n);
    await economy.ensureEra(25_000n, () => {});
    expect(claimFaucet).toHaveBeenCalledTimes(3);
    expect(await economy.era()).toBe(30_000n);
  });
  it('does not claim when the account is already funded', async () => {
    const { economy, claimFaucet } = fundingAccount(30_000n);
    await economy.ensureEra(25_000n, () => {});
    expect(claimFaucet).not.toHaveBeenCalled();
  });
  it('stops after a refusal rather than continuing to request funds', async () => {
    const { economy, claimFaucet } = fundingAccount(0n, 10_000n, false);
    await expect(economy.ensureEra(25_000n, () => {})).rejects.toThrow('fixture refusal');
    expect(claimFaucet).toHaveBeenCalledTimes(1);
  });
  it('stops if a success response is not reflected in the available balance', async () => {
    const { economy, claimFaucet } = fundingAccount(0n, 0n);
    await expect(economy.ensureEra(25_000n, () => {})).rejects.toThrow('did not increase');
    expect(claimFaucet).toHaveBeenCalledTimes(1);
  });
});
