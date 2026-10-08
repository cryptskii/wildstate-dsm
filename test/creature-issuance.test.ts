/**
 * Creatures issued for two players at once (phones, 2026-10-08): both players connected together,
 * each wallet's queue issued its starter, and the one account refused the second token creation
 * while the first was still advancing its state. The second starter never reached its wallet, and
 * a staked match waited for it forever. The account's own operations now run one at a time.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Economy } from '../src/integrations/dsm/economy';
import { b32 } from '../src/integrations/dsm/host';

const ACCOUNT = b32(new Uint8Array(32).fill(1));
const ERA = new Uint8Array(32).fill(3);

/** One account: a token creation is refused while another is still in flight, as its chain refuses it. */
class OneChainHost {
  inFlight = 0;
  created: string[] = [];

  async balances() {
    return [{ tokenId: 'ERA', available: 10_000_000n, policyAnchorB32: b32(ERA) }];
  }

  async createToken(args: { ticker: string }) {
    if (this.inFlight > 0) throw new Error('token.create: a previous operation is still advancing this device');
    this.inFlight += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.inFlight -= 1;
    this.created.push(args.ticker);
    return new TextEncoder().encode(args.ticker.padEnd(32, '.'));
  }
}

function economy(host: OneChainHost): Economy {
  const dir = mkdtempSync(join(tmpdir(), 'wildstate-issuance-'));
  const e = new Economy(host as never, join(dir, 'record.json'), ACCOUNT);
  e.eraAnchor = b32(ERA);
  return e;
}

describe('creature issuance', () => {
  it('issues two starters asked for at once, each its own object', async () => {
    const host = new OneChainHost();
    const e = economy(host);
    const say = () => {};
    const [first, second] = await Promise.all([
      e.issueCreature('embercub', say, 'wallet-a/starter'),
      e.issueCreature('embercub', say, 'wallet-b/starter'),
    ]);
    expect(first).not.toBe(second);
    expect(host.created).toHaveLength(2);
    expect(Object.values(e.record.creatures).map((c) => c.creature).sort()).toEqual(['wallet-a/starter', 'wallet-b/starter']);
  });

  it('goes on issuing after one issuance fails', async () => {
    const host = new OneChainHost();
    const e = economy(host);
    const say = () => {};
    const create = host.createToken.bind(host);
    let calls = 0;
    host.createToken = async (args) => {
      calls += 1;
      if (calls === 1) throw new Error('token.create: refused once');
      return create(args);
    };
    const [first, second] = await Promise.allSettled([
      e.issueCreature('embercub', say, 'wallet-a/starter'),
      e.issueCreature('embercub', say, 'wallet-b/starter'),
    ]);
    expect(first.status).toBe('rejected');
    expect(second.status).toBe('fulfilled');
  });
});
