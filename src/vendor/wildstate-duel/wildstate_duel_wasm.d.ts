/* tslint:disable */
/* eslint-disable */

/**
 * Transcript entry `index` (DSM class 0x0068): `side` commits to `played`
 * under `salt`.
 */
export function commitEntry(index: number, side: string, salt: Uint8Array, played: Uint8Array): Uint8Array;

/**
 * The frozen vectors as setups under this program:
 * `[{ label, setup, turns, winner, end, finalState }]`.
 */
export function conformanceVectors(): Array<any>;

/**
 * A creature's published state record: `parent` the digest of the record
 * before it, or `null` for the record it was issued with.
 */
export function creatureRecord(parent: any, state: Uint8Array): Uint8Array;

/**
 * The digest a successor names a record by.
 */
export function creatureRecordDigest(record: Uint8Array): Uint8Array;

/**
 * The canonical bytes of one creature's state, `{ anchor, species, xp, hp,
 * charges }` (charges one per move of the species, in table order).
 */
export function encodeCreatureState(c: any): Uint8Array;

/**
 * The canonical bytes of one move: `{ kind: 'move', index }`, `{ kind:
 * 'item', item, teamIndex }`, `{ kind: 'pass' }` or `{ kind: 'resign' }`.
 */
export function encodeMove(mv: any): Uint8Array;

/**
 * The canonical setup bytes of `{ program, matchNonce, turnCap, tiebreakSeed,
 * a, b }`; a side is `{ genesis, deviceId, sessionPublicKey, poultice, tonic,
 * team }` and a creature `{ anchor, species, xp, hp, charges }`.
 */
export function encodeSetup(setup: any): Uint8Array;

/**
 * A turn's canonical bytes from both sides' move bytes.
 */
export function encodeTurn(a: Uint8Array, b: Uint8Array): Uint8Array;

/**
 * The latest state of creature `anchor` among its issuer's published
 * records: `{ state, digest }`, the tip of the one chain from issuance.
 */
export function latestCreatureState(anchor: Uint8Array, records: Array<any>): any;

/**
 * `H(DSM/escrow/move-commit/v1 ‖ salt ‖ u32be(|move|) ‖ move)`.
 */
export function moveCommitment(salt: Uint8Array, played: Uint8Array): Uint8Array;

/**
 * The decided result of a complete transcript: `{ winner, end, turns }`.
 */
export function outcome(setup: Uint8Array, turns: Array<any>): any;

/**
 * The canonical bytes of the move an opening plays: the move it is the
 * canonical encoding of, and a pass for any other bytes.
 */
export function playedMove(opened: Uint8Array): Uint8Array;

export function programHash(): Uint8Array;

/**
 * Every turn's log of a transcript (which may stop before the match is decided).
 */
export function replay(setup: Uint8Array, turns: Array<any>): Array<any>;

/**
 * Transcript entry `index`: `side` resigns.
 */
export function resignEntry(index: number, side: string): Uint8Array;

/**
 * Transcript entry `index`: `side` opens the move it committed to under `salt`.
 */
export function revealEntry(index: number, side: string, salt: Uint8Array, played: Uint8Array): Uint8Array;

/**
 * The state before turn 0 of a setup that pins this program.
 */
export function startState(setup: Uint8Array): Uint8Array;

/**
 * The state digest of kept state bytes.
 */
export function stateDigest(state: Uint8Array): Uint8Array;

/**
 * A display view of kept state bytes.
 */
export function stateView(state: Uint8Array): any;

/**
 * One turn on a kept state: `{ state, log }`.
 */
export function step(state: Uint8Array, turn: Uint8Array): any;

export function tablesDigest(): Uint8Array;

/**
 * The tables digest of tables bytes encoded elsewhere (the game's own tables).
 */
export function tablesDigestOf(ccb: Uint8Array): Uint8Array;

/**
 * The canonical tables bytes the tables digest is taken over.
 */
export function tablesEncoding(): Uint8Array;

/**
 * The tiebreak seed a staked match's setup commits, from its nonce and both
 * sides' session public keys (`wildstate_duel::tiebreak_seed`).
 */
export function tiebreakSeed(match_nonce: Uint8Array, session_a: Uint8Array, session_b: Uint8Array): Uint8Array;

/**
 * The turn's canonical bytes the rules play from both sides' openings,
 * exactly as revealed: each plays as `playedMove` reads it.
 */
export function turnOfOpenings(a: Uint8Array, b: Uint8Array): Uint8Array;

/**
 * A display view of a turn's bytes: `{ a, b }`, each as `encodeMove` takes it.
 */
export function turnView(turn: Uint8Array): any;

/**
 * Runs the frozen vectors; their count when every one reproduces.
 */
export function verifyConformance(): number;
