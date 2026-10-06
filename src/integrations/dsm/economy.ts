/**
 * The game's economy on DSM (DSM Amendment A11, the §78 picture): the game
 * stays a Web2 game, and what a player owns lives in the player's wallet.
 *
 * - WILD, the game's coin: a token the game's account created; its whole
 *   supply is the account's, and it pays players from it.
 * - A WILD/ERA SoFi vault the account funds: the market players swap in.
 * - Each creature a state object: a token of supply one the account creates
 *   when the creature is caught. Its committed policy names the game as
 *   issuer, the species and the capture; its policy commitment is the
 *   creature's identity. HP and XP stay game data, keyed by that identity.
 *
 * This file is the game's own Web2 record of what it did on DSM (which
 * anchors are its coin and its creatures, its players' game profiles). It is
 * never evidence of ownership: holdings come from proofs the account verifies.
 */
import type { Directory } from '../../domain/username';
import type { Match } from '../../domain/match';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { SPECIES, type Creature, type GameState } from '../../domain/game';
import { creatureRecord, creatureRecordDigest } from '../../domain/program';
import { DsmHost, b32, fromB32, type Bytes } from './host';
import { COIN, MARKET } from './terms';

export type Species = Creature['species'];

/** The game's record of one creature it issued. */
export interface IssuedCreature {
  species: Species;
  serial: number;
  ticker: string;
}

/** What a browser's login names: the offer it was shown, and the session the wallet made of it. */
export interface Login {
  offer: string;
  session: string | null;
}

export interface EconomyRecord {
  /** The game's account (Base32 device id). */
  account: string;
  /** WILD's policy anchor (Base32). */
  wild: string | null;
  /** The WILD/ERA vault the account funds (Base32 vault id). */
  vault: string | null;
  creatures: Record<string, IssuedCreature>;
  nextSerial: number;
  /** Each player's game profile, by their wallet's account (Base32). */
  profiles: Record<string, GameState>;
  /** Game data of creatures that left a profile with their object, by anchor. */
  stats: Record<string, Creature>;
  /** Creature objects sent to each wallet that no holdings proof has shown yet, by wallet. */
  inFlight: Record<string, string[]>;
  /**
   * A browser's login token → the offer it was shown and the session that offer
   * became (Base32). A Web2 login, never DSM authority: a page that comes back
   * (from the wallet app, or a reload) picks up its connection with it.
   */
  resume: Record<string, Login>;
  /** Wallets the starting coin was paid to. */
  welcomed: string[];
  /** Lobby profiles (username, rating, history), keyed by the wallet's DSM identity. Game data. */
  players: Directory['players'];
  /** Username index into `players`: a human-friendly label bound to an identity. */
  usernames: Directory['usernames'];
  /** Player-vs-player matches by id: run by the game server (Web2), kept across restarts. */
  matches: Record<string, Match>;
  /**
   * The last state the account published for each creature (by anchor): the record's digest
   * (Base32) and the state's bytes (Base64). The published objects are what wallets read; this
   * only saves the account publishing a state again.
   */
  published: Record<string, { digest: string; state: string }>;
}

/** The fee a token's creation burns, in ERA base units (`TOKEN_CREATION_FEE_ERA`). */
export const CREATION_FEE_ERA = 1_000n;
/** ERA the account keeps before it creates anything: the coin, the market, a few creatures. */
// Fund the market and retain 200 ERA for issuing creatures, after WILD's creation fee.
const ERA_TO_START = BigInt(MARKET.era) * 100n + CREATION_FEE_ERA + 20_000n;

const CODE: Record<Species, string> = { embercub: 'EM', mossling: 'MS', tidefin: 'TF', voltusk: 'VT', leon: 'LN', rattlefin: 'RF', brineback: 'BB' };

export class Economy {
  record: EconomyRecord;
  /** ERA's policy anchor, as this account's balances name it. */
  eraAnchor = '';

  constructor(readonly host: DsmHost, readonly path: string, account: string) {
    this.record = existsSync(path)
      ? (JSON.parse(readFileSync(path, 'utf8')) as EconomyRecord)
      : { account, wild: null, vault: null, creatures: {}, nextSerial: 1, profiles: {}, stats: {}, inFlight: {}, resume: {}, welcomed: [], players: {}, usernames: {}, matches: {}, published: {} };
    this.record.inFlight ??= {};
    this.record.resume ??= {};
    // Logins kept before they named their offer named only a session.
    for (const [token, login] of Object.entries(this.record.resume as Record<string, Login | string>)) {
      if (typeof login === 'string') this.record.resume[token] = { offer: '', session: login };
    }
    this.record.welcomed ??= [];
    this.record.players ??= {};
    this.record.usernames ??= {};
    this.record.matches ??= {};
    this.record.published ??= {};
    if (this.record.account !== account) {
      throw new Error(`${path} is the record of account ${this.record.account}, not of ${account}`);
    }
  }

  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const next = `${this.path}.next`;
    writeFileSync(next, JSON.stringify(this.record, null, 2));
    renameSync(next, this.path);
  }

  get wild(): Bytes {
    if (!this.record.wild) throw new Error('the game has not created its coin yet');
    return fromB32(this.record.wild);
  }

  /** The account's ERA row: its balance in base units and its anchor. */
  async eraRow(): Promise<{ available: bigint; anchor: string }> {
    const era = (await this.host.balances()).find((b) => b.tokenId === 'ERA');
    if (!era || !era.policyAnchorB32) throw new Error('the game account lists no ERA');
    this.eraAnchor = era.policyAnchorB32;
    return { available: era.available, anchor: era.policyAnchorB32 };
  }

  async era(): Promise<bigint> {
    return (await this.eraRow()).available;
  }

  get eraCommit(): Bytes {
    if (!this.eraAnchor) throw new Error('ERA has not been read yet');
    return fromB32(this.eraAnchor);
  }

  /** ERA enough for `needed` base units: a faucet claim when the account holds less. */
  async ensureEra(needed: bigint, say: (line: string) => void): Promise<void> {
    let available = await this.era();
    while (available < needed) {
      say('The game account claims ERA from the network faucet for liquidity and token creation fees');
      const claimed = await this.host.claimFaucet(fromB32(this.record.account));
      if (!claimed.success) throw new Error(`faucet.claim: ${claimed.message}`);
      const next = await this.era();
      if (next <= available) throw new Error('the accepted faucet claim did not increase available ERA');
      available = next;
    }
  }

  /** The coin and the market, once. */
  async setUp(say: (line: string) => void): Promise<void> {
    if (!this.record.wild) {
      await this.ensureEra(ERA_TO_START, say);
      say(`Creating ${COIN.ticker}, the game's coin: a token of fixed supply ${COIN.supply}`);
      const anchor = await this.host.createToken({
        ticker: COIN.ticker,
        alias: COIN.alias,
        supply: COIN.supply,
        description: 'Wildstate coin: paid by the game for victories, spent on capsules, traded against ERA.',
      });
      this.record.wild = b32(anchor);
      this.save();
    }
    if (!this.record.vault) {
      say(`Opening the WILD/ERA market: ${MARKET.wild} WILD against ${MARKET.era} ERA, ${MARKET.feeBps} bps`);
      await this.eraRow();
      const created = await this.host.createVault(this.wild, MARKET.wild, this.eraCommit, MARKET.era, MARKET.feeBps);
      this.record.vault = b32(created.vaultId);
      this.save();
    }
  }

  /**
   * The creature `anchor`'s state `state` (canonical bytes), published as its latest: the record it
   * was issued with when the account has published none, else a successor naming the last record.
   * Publishing the state already latest publishes nothing. Resolves with the state published.
   */
  async publishState(anchor: string, state: Uint8Array): Promise<Uint8Array> {
    const last = this.record.published[anchor];
    const stateText = Buffer.from(state).toString('base64');
    if (last && last.state === stateText) return state;
    const record = creatureRecord(last ? fromB32(last.digest) : null, state);
    const published = await this.host.publishAuthored(fromB32(anchor), new Uint8Array(record));
    if (!published.stored) throw new Error(`the state of creature ${anchor.slice(0, 8)} did not store at the storage nodes`);
    this.record.published[anchor] = { digest: b32(creatureRecordDigest(record)), state: stateText };
    this.save();
    return state;
  }

  /** A new creature object: a token of supply one whose policy says what it is. */
  async issueCreature(species: Species, say: (line: string) => void): Promise<string> {
    await this.ensureEra(CREATION_FEE_ERA, say);
    const serial = this.record.nextSerial;
    const ticker = `${CODE[species]}${String(serial).padStart(4, '0')}`;
    const name = `${SPECIES[species].name} #${serial}`;
    const anchor = b32(
      await this.host.createToken({
        ticker,
        alias: name,
        supply: 1n,
        description: `Wildstate creature: ${species}, capture ${serial}, issued by the Wildstate game account`,
      }),
    );
    this.record.creatures[anchor] = { species, serial, ticker };
    this.record.nextSerial = serial + 1;
    this.save();
    return anchor;
  }
}

