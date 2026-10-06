/**
 * The staked-match program, as the game server runs it: DSM's `wildstate-duel` outcome program
 * (crates/wildstate-duel), compiled to WebAssembly and vendored in src/vendor/wildstate-duel.
 * Every player-vs-player turn is resolved by these compiled rules, so a match's screen and the
 * escrow that settles it can never disagree. Wild and trainer battles stay on src/domain/duel.ts.
 *
 * Objects cross into the program as their canonical bytes; the game keeps them as Base64 in its
 * own record (Web2 game data). The program's views of those bytes are display only.
 */
import * as wasm from '../vendor/wildstate-duel/wildstate_duel_wasm.js';
import { ITEMS, SPECIES, type Creature, type UsableItem } from './game';
import { fromB32 } from '../integrations/dsm/host';

export type Side = 'a' | 'b';

/** Bytes this process owns (a plain ArrayBuffer), as protobuf fields and requests take them. */
export type Bytes = Uint8Array<ArrayBuffer>;
const own = (bytes: Uint8Array): Bytes => new Uint8Array(bytes);

/** `P`: the hash that pins the program a staked match is decided by. */
export const PROGRAM: Bytes = own(wasm.programHash());
/** The program's turn cap: after it, more team HP wins, and equal HP goes to the tiebreak seed. */
export const TURN_CAP = 60;
/** Species and items in the program's table order: the game's own tables, in their own order. */
export const SPECIES_IDS = Object.keys(SPECIES) as Creature['species'][];
export const ITEM_IDS = Object.keys(ITEMS) as UsableItem[];

export const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
export const unb64 = (text: string): Bytes => new Uint8Array(Buffer.from(text, 'base64'));

/** One side's opened move, as the program reads it. */
export type MoveView = { kind: 'move'; index: number } | { kind: 'item'; item: number; teamIndex: number } | { kind: 'pass' } | { kind: 'resign' };
export type FighterView = { species: string; xp: number; hp: number; charges: number[]; guard: 'up' | 'down'; statuses: { id: string; turns: number }[] };
export type SideView = { poultice: number; tonic: number; active: number; ko: number; team: FighterView[] };
export type End = 'knockouts' | 'resign' | 'hp' | 'tiebreak';
export type WinnerView = { winner: Side; end: End; turns: number };
export type StateView = { turn: number; winner: WinnerView | null; a: SideView; b: SideView };
export type ActionView = { side: Side; played: MoveView; dmg: number; multX4: number; status: string | null; burn: number; acted: 'acted' | 'held' };
export type EventView = { side: Side; kind: 'faint' | 'switch'; teamIndex: number };
export type LogView = { turn: number; first: Side | null; actions: ActionView[]; events: EventView[]; end: WinnerView | null };

/** An issued creature's anchor: its DSM identity, the policy commitment of its supply-one token. */
export function anchorBytes(c: Creature): Bytes {
  if (c.anchor === null) throw new Error(`creature ${c.id} has not been issued`);
  return fromB32(c.anchor);
}

/** A creature's state as the program reads it: one charge count per move of its species, in table order. */
export function creatureState(c: Creature, anchor: Uint8Array): Bytes {
  return own(wasm.encodeCreatureState({
    anchor,
    species: SPECIES_IDS.indexOf(c.species),
    xp: c.xp,
    hp: c.hp,
    charges: SPECIES[c.species].moves.map((m) => (m.max ? (c.charges[m.id] ?? 0) : 0)),
  }));
}

/** One side of a setup: who plays it, the session key its entries are signed with, its bag and its team. */
export interface SetupSide {
  genesis: Uint8Array;
  deviceId: Uint8Array;
  sessionKey: Uint8Array;
  poultice: number;
  tonic: number;
  /** Each fielded creature's canonical state (`creatureState`). */
  team: Uint8Array[];
}

/** The canonical setup of a match: the program, the nonce, the cap, the tiebreak both keys and the nonce derive, both sides. */
export function encodeSetup(nonce: Uint8Array, a: SetupSide, b: SetupSide): Bytes {
  const side = (s: SetupSide) => ({ genesis: s.genesis, deviceId: s.deviceId, sessionPublicKey: s.sessionKey, poultice: s.poultice, tonic: s.tonic, team: s.team });
  return own(wasm.encodeSetup({
    program: PROGRAM, matchNonce: nonce, turnCap: TURN_CAP,
    tiebreakSeed: wasm.tiebreakSeed(nonce, a.sessionKey, b.sessionKey),
    a: side(a), b: side(b),
  }));
}

export const startState = (setup: Uint8Array): Bytes => own(wasm.startState(setup));
export const stateView = (state: Uint8Array): StateView => wasm.stateView(state) as StateView;
export const encodeMove = (mv: MoveView): Bytes => own(wasm.encodeMove(mv));

/** One turn from both sides' openings exactly as revealed: bytes that are no move play as a pass. */
export function playTurn(state: Uint8Array, a: Uint8Array, b: Uint8Array): { state: Bytes; log: LogView } {
  const out = wasm.step(state, wasm.turnOfOpenings(a, b)) as { state: Uint8Array; log: LogView };
  return { state: own(out.state), log: out.log };
}

/** The move an opening plays (bytes that are no move play as a pass). */
export const playedMove = (opened: Uint8Array): MoveView => (wasm.turnView(wasm.turnOfOpenings(opened, opened)) as { a: MoveView }).a;

/** Transcript entries (DSM class 0x0068), as each player's wallet signs them. */
export const commitEntry = (index: number, side: Side, salt: Uint8Array, played: Uint8Array): Bytes => own(wasm.commitEntry(index, side, salt, played));
export const revealEntry = (index: number, side: Side, salt: Uint8Array, played: Uint8Array): Bytes => own(wasm.revealEntry(index, side, salt, played));
export const resignEntry = (index: number, side: Side): Bytes => own(wasm.resignEntry(index, side));

/** A creature's published state record, naming the record before it (null for the one it was issued with). */
export const creatureRecord = (parent: Uint8Array | null, state: Uint8Array): Bytes => own(wasm.creatureRecord(parent, state));
export const creatureRecordDigest = (record: Uint8Array): Bytes => own(wasm.creatureRecordDigest(record));
/** The latest state among a creature's published records: the tip of the one chain from issuance. */
export const latestCreatureState = (anchor: Uint8Array, records: Uint8Array[]): { state: Uint8Array; digest: Uint8Array } => wasm.latestCreatureState(anchor, records) as { state: Uint8Array; digest: Uint8Array };
