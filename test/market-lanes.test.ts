/**
 * The market divided into lanes (owner direction 2026-10-07): the single vault's reserves split
 * exactly across MARKET_VAULTS labelled vaults, every step written before the next, a restart
 * resuming where it stopped, and only this market's labels ever recognized.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Economy, splitExact } from '../src/integrations/dsm/economy';
import { b32 } from '../src/integrations/dsm/host';
import * as pb from '../src/integrations/dsm/proto/dsm_app_pb';
import { MARKET_VAULTS } from '../src/integrations/dsm/terms';

const ACCOUNT = b32(new Uint8Array(32).fill(1));
const WILD = new Uint8Array(32).fill(2);
const ERA = new Uint8Array(32).fill(3);
const LEGACY = new Uint8Array(32).fill(9);

/** The account, as far as the market needs it: its vaults, a close, a create, its ERA row. */
class FixtureHost {
  vaultsHeld: pb.SofiOwnedVaultV1[] = [];
  created: { wild: string; era: string; label: string }[] = [];
  closed: string[] = [];
  /** Throw on the create after this many, as a process killed mid-migration would stop. */
  failAfter = Number.POSITIVE_INFINITY;

  async balances() {
    return [{ tokenId: 'ERA', available: 10_000_000n, policyAnchorB32: b32(ERA) }];
  }

  async vaults() {
    return this.vaultsHeld;
  }

  async close(vaultId: Uint8Array) {
    this.closed.push(b32(vaultId));
    for (const v of this.vaultsHeld) if (b32(v.vaultId) === b32(vaultId)) v.status = pb.SofiVaultStatus.RETIRED;
  }

  async createVault(
    a: Uint8Array<ArrayBuffer>,
    reserveA: string,
    b: Uint8Array<ArrayBuffer>,
    reserveB: string,
    feeBps: number,
    label = '',
  ) {
    if (this.created.length >= this.failAfter) throw new Error('the account stopped');
    const wildFirst = b32(a) === b32(WILD);
    const vaultId = new Uint8Array(32).fill(0x40 + this.vaultsHeld.length);
    this.created.push({ wild: wildFirst ? reserveA : reserveB, era: wildFirst ? reserveB : reserveA, label });
    this.vaultsHeld.push(
      new pb.SofiOwnedVaultV1({ vaultId, tokenAPolicyCommit: a, tokenBPolicyCommit: b, feeBps, status: pb.SofiVaultStatus.ACTIVE, label }),
    );
    return new pb.SofiVaultCreatedResponse({ vaultId, position: 1n });
  }
}

function legacyVault(wild: bigint, eraBase: bigint) {
  return new pb.SofiOwnedVaultV1({
    vaultId: LEGACY,
    tokenAPolicyCommit: WILD,
    tokenBPolicyCommit: ERA,
    reserveA: wild,
    reserveB: eraBase,
    status: pb.SofiVaultStatus.ACTIVE,
  });
}

function economyOver(host: FixtureHost): Economy {
  const path = join(mkdtempSync(join(tmpdir(), 'market-lanes-')), 'record.json');
  const economy = new Economy(host as never, path, ACCOUNT);
  economy.record.wild = b32(WILD);
  economy.record.vault = b32(LEGACY);
  return economy;
}

const say = () => {};
const base = (whole: string, decimals: number) =>
  decimals === 0 ? BigInt(whole) : BigInt(whole.replace('.', ''));

describe('the market in lanes', () => {
  it('splits every total exactly, to the base unit', () => {
    for (const total of [0n, 1n, 4n, 5n, 6n, 49_997n, 100_003n, 123_456_789n]) {
      const parts = splitExact(total, MARKET_VAULTS);
      expect(parts).toHaveLength(MARKET_VAULTS);
      expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
      expect(Math.max(...parts.map(Number)) - Math.min(...parts.map(Number))).toBeLessThanOrEqual(1);
    }
  });

  it('closes the single vault and opens five labelled lanes holding exactly its reserves', async () => {
    const host = new FixtureHost();
    host.vaultsHeld.push(legacyVault(49_997n, 100_003n));
    const economy = economyOver(host);
    await economy.setUpMarket(say);
    expect(host.closed).toEqual([b32(LEGACY)]);
    expect(host.created).toHaveLength(MARKET_VAULTS);
    expect(host.created.reduce((t, c) => t + base(c.wild, 0), 0n)).toBe(49_997n);
    expect(host.created.reduce((t, c) => t + base(c.era, 2), 0n)).toBe(100_003n);
    expect(host.created.map((c) => c.label)).toEqual(Array.from({ length: MARKET_VAULTS }, (_, i) => economy.laneLabel(i)));
    expect(economy.record.market?.lanes.every((lane) => lane !== null)).toBe(true);
  });

  it('resumes a migration that stopped, opening only the lanes still missing', async () => {
    const host = new FixtureHost();
    host.vaultsHeld.push(legacyVault(50_000n, 100_000n));
    host.failAfter = 2;
    const economy = economyOver(host);
    await expect(economy.setUpMarket(say)).rejects.toThrow('the account stopped');
    expect(economy.record.market?.legacyClosed).toBe(true);
    host.failAfter = Number.POSITIVE_INFINITY;
    await economy.setUpMarket(say);
    expect(host.closed).toHaveLength(1);
    expect(host.created).toHaveLength(MARKET_VAULTS);
    expect(new Set(economy.record.market?.lanes).size).toBe(MARKET_VAULTS);
  });

  it('recognizes a lane opened before a restart by its label, and never a foreign vault of the pair', async () => {
    const host = new FixtureHost();
    host.vaultsHeld.push(legacyVault(50_000n, 100_000n));
    const economy = economyOver(host);
    // Another vault of the same tokens, unlabelled, and one labelled as another pool's lane 0.
    host.vaultsHeld.push(
      new pb.SofiOwnedVaultV1({ vaultId: new Uint8Array(32).fill(0x70), tokenAPolicyCommit: WILD, tokenBPolicyCommit: ERA, status: pb.SofiVaultStatus.ACTIVE }),
      new pb.SofiOwnedVaultV1({ vaultId: new Uint8Array(32).fill(0x71), tokenAPolicyCommit: WILD, tokenBPolicyCommit: ERA, status: pb.SofiVaultStatus.ACTIVE, label: 'wildstate:market:v1:other:pool:30:lane:0' }),
    );
    host.failAfter = 1;
    await expect(economy.setUpMarket(say)).rejects.toThrow('the account stopped');
    // The record lost the lane it had just opened: the label finds it again.
    economy.record.market!.lanes[0] = null;
    host.failAfter = Number.POSITIVE_INFINITY;
    await economy.setUpMarket(say);
    const lanes = economy.record.market!.lanes;
    expect(lanes).not.toContain(b32(new Uint8Array(32).fill(0x70)));
    expect(lanes).not.toContain(b32(new Uint8Array(32).fill(0x71)));
    expect(host.created).toHaveLength(MARKET_VAULTS);
  });

  it('opens a new market as five exact slices of its starting terms', async () => {
    const host = new FixtureHost();
    const economy = economyOver(host);
    economy.record.vault = null;
    await economy.setUpMarket(say);
    expect(host.closed).toHaveLength(0);
    expect(host.created.reduce((t, c) => t + base(c.wild, 0), 0n)).toBe(50_000n);
    expect(host.created.reduce((t, c) => t + base(c.era, 2), 0n)).toBe(100_000n);
  });
});
