/**
 * DSM underneath the game (DSM Amendment A11).
 *
 * The game stays what it was: walking, encounters and battles run here on
 * the game server and never touch DSM. What a player owns lives in the
 * player's DSM wallet on their phone: WILD, the game's coin, and each caught
 * creature, a state object of supply one. The player connects the wallet
 * once by scanning a code; after that the game asks the wallet for what the
 * player granted (accept a creature, pay for a capsule, quote and swap in the
 * market, prove holdings) with no going back and forth to the phone.
 *
 * Nothing a wallet answers is evidence. The game grants a capsule only when
 * its own account accepted the payment, and takes coins and creatures only
 * from holdings proofs its account verified (`connect.app.status`).
 *
 * The overlay shows both lanes as they happen: what the game server did
 * (Web2) and what DSM did underneath, as the game's account recorded it.
 */
import type { RpgPlayer } from '@rpgjs/server';
import { stateSchema, SCARECROW_CAPSULES, SPECIES, SHOP_QTY_MAX, TRAINERS, displayName, newCreature, initialState, salePrice, type Command, type Creature, type GameState } from '../../domain/game';
import { DsmHost, HostError, b32, fromB32, own, short, type Bytes } from '../../integrations/dsm/host';
import type { Economy, Login, Species } from '../../integrations/dsm/economy';
import { COIN, ITEM_PRICES, MARKET, TRAINER_REWARD, VICTORY_REWARD, WELCOME_COINS, type ShopItem } from '../../integrations/dsm/terms';
import * as pb from '../../integrations/dsm/proto/dsm_app_pb';

/** The game's DSM account (`dsm-app-host`): the game does not run without it. */
export const DSM_HOST_URL: string | undefined = process.env.DSM_APP_HOST;
const RECORD_PATH = process.env.DSM_GAME_RECORD ? process.env.DSM_GAME_RECORD : 'data/dsm-game.json';

// ------------------------------- the overlay -------------------------------

export type Tone = 'info' | 'ok' | 'wait' | 'fail';
export interface OverlayEntry {
  id: number;
  lane: 'web2' | 'dsm';
  title: string;
  detail: string;
  tone: Tone;
  /** How long the step took, seen from the game (Web2 timing, display only). */
  ms?: number;
  dsm?: {
    route: string;
    positionBefore?: string;
    positionAfter?: string;
    econRoot?: string;
    deviceTree?: string;
  };
}

export interface PanelData {
  /** This browser's resume token, for it to keep: reopening the game resumes the connection. */
  resumeToken: string | null;
  entries: OverlayEntry[];
  account: { device: string; storageSet: string; signatureBytes: number } | null;
  wallet: string | null;
  coins: string | null;
  era: string | null;
  provenAt: string | null;
}

/** A WILD amount, as base units of a 0-decimal token. */
const wildText = (n: bigint) => `${n} WILD`;
/** An ERA amount: ERA has two decimals. */
const eraText = (base: bigint) => `${base / 100n}.${String(base % 100n).padStart(2, '0')} ERA`;

// -------------------------------- the world --------------------------------

interface World {
  host: DsmHost;
  economy: Economy;
  meta: pb.AppHostActivityV1;
}

let worldReady: Promise<World> | null = null;
/** Lines said while the game account is set up, shown to every player. */
const setupLines: OverlayEntry[] = [];
let nextEntry = 1;

function entry(lane: OverlayEntry['lane'], title: string, detail: string, tone: Tone, ms?: number): OverlayEntry {
  return { id: nextEntry++, lane, title, detail, tone, ms };
}

export function world(): Promise<World> {
  if (!DSM_HOST_URL) return Promise.reject(new Error('the game was started without DSM_APP_HOST'));
  if (!worldReady) {
    worldReady = (async () => {
      const host = new DsmHost(DSM_HOST_URL as string);
      const meta = await host.activity(0n);
      // Node only: the game's record lives on the game server's disk.
      const { Economy } = await import('../../integrations/dsm/economy');
      const economy = new Economy(host, RECORD_PATH, b32(meta.deviceId));
      await economy.eraRow();
      await economy.setUp((line) => {
        const e = entry('dsm', 'Setting up the game account', line, 'wait');
        setupLines.push(e);
        for (const seat of allSeats()) pushEntries(seat, [e]);
      });
      startActivityPump(host);
      return { host, economy, meta };
    })();
    worldReady.catch((e) => {
      worldReady = null;
      const failed = entry('dsm', 'The game account could not be set up', String(e), 'fail');
      setupLines.push(failed);
      for (const seat of allSeats()) pushEntries(seat, [failed]);
    });
  }
  return worldReady;
}

// --------------------------------- seats ---------------------------------

interface Seat {
  player: RpgPlayer;
  feed: OverlayEntry[];
  session: Bytes | null;
  wallet: string | null;
  offerDigest: string | null;
  coins: bigint | null;
  era: bigint | null;
  provenAt: bigint | null;
  lastWalk: number;
  resumeToken: string | null;
}

const seats = new Map<string, Seat>();
const allSeats = () => [...seats.values()];

function seatOf(player: RpgPlayer): Seat {
  let seat = seats.get(player.id);
  if (!seat) {
    seat = {
      player, feed: [...setupLines], session: null, wallet: null, offerDigest: null,
      coins: null, era: null, provenAt: null, lastWalk: 0, resumeToken: null,
    };
    seats.set(player.id, seat);
  }
  return seat;
}

/** A wallet's DSM panel history, kept while its page is away, so coming back does not empty it. */
const feeds = new Map<string, OverlayEntry[]>();

export function leave(player: RpgPlayer): void {
  const seat = seats.get(player.id);
  if (seat?.wallet) feeds.set(seat.wallet, seat.feed);
  seats.delete(player.id);
}

/** The wallet session a request goes over. A page that has just come back may not have it yet. */
function sessionOf(seat: Seat): Bytes {
  if (!seat.session) throw new Error('Your wallet is reconnecting; try again in a moment.');
  return seat.session;
}

/**
 * A page that comes back with its game already loaded (the phone switched to the wallet app and
 * back, or the network dropped) still has its wallet's session on the game's account: the
 * connection the wallet approved outlives the page's socket. Pick it up again, so requests keep
 * going over it; false when there is none to pick up and the wallet must connect afresh.
 */
export async function resumeWallet(player: RpgPlayer, holder: string): Promise<boolean> {
  const seat = seatOf(player);
  if (seat.session && seat.wallet === holder) return true;
  const w = await world();
  const live = (await w.host.sessions())
    .filter((s) => b32(s.peerDeviceId) === holder && s.status !== pb.ConnectSessionStatus.DISCONNECTED)
    // The one in use most recently: the wallet answers on every session it approved.
    .sort((a, b) => (a.lastSeq < b.lastSeq ? 1 : a.lastSeq > b.lastSeq ? -1 : 0));
  if (!live.length || !seats.has(player.id)) return false;
  seat.session = own(live[0].sessionId);
  seat.wallet = holder;
  const kept = feeds.get(holder);
  if (kept) { seat.feed = kept; feeds.delete(holder); }
  seat.offerDigest = b32(live[0].offerDigest);
  pushEntries(seat, [entry('web2', 'Connection resumed', `The page came back; it goes on with wallet ${short(holder)}'s session. Nothing about DSM changed`, 'ok')]);
  enqueue(player, 'Proving your holdings', () => refreshHoldings(player));
  return true;
}

function panel(seat: Seat): PanelData {
  const meta = worldMeta;
  return {
    resumeToken: seat.resumeToken,
    entries: seat.feed.slice(-120),
    account: meta
      ? { device: b32(meta.deviceId), storageSet: b32(meta.storageSetId), signatureBytes: meta.signatureBytes }
      : null,
    wallet: seat.wallet,
    coins: seat.coins === null ? null : wildText(seat.coins),
    era: seat.era === null ? null : eraText(seat.era),
    provenAt: seat.provenAt === null ? null : String(seat.provenAt),
  };
}

function pushEntries(seat: Seat, entries: OverlayEntry[]): void {
  seat.feed.push(...entries);
  if (seat.feed.length > 400) seat.feed.splice(0, seat.feed.length - 400);
  seat.player.getGui('dsm-panel')?.update(panel(seat));
}

/** A Web2 event: something the game server did on its own. */
export function web2(player: RpgPlayer, title: string, detail: string, tone: Tone = 'info'): void {
  pushEntries(seatOf(player), [entry('web2', title, detail, tone)]);
}

/** Walking is Web2: say so now and then, not every step. */
export function walked(player: RpgPlayer): void {
  const seat = seatOf(player);
  const now = Date.now();
  if (now - seat.lastWalk < 6000) return;
  seat.lastWalk = now;
  web2(player, 'Walking', `(${Math.round(player.x())}, ${Math.round(player.y())}): movement runs on the game server and never touches DSM`);
}

/** The panel, open beside the game. Its toggle is the player's, on the client. */
export function openPanel(player: RpgPlayer): void {
  const seat = seatOf(player);
  const gui = player.gui('dsm-panel');
  void gui.open(panel(seat));
}

// ---------------------- the host's record, as it happens ----------------------

let worldMeta: pb.AppHostActivityV1 | null = null;

/** Whether the game's account answered the last read, and since when it has not. */
let hostDownSince: number | null = null;

function startActivityPump(host: DsmHost): void {
  let after = 0n;
  const tick = async () => {
    try {
      const feed = await host.activity(after);
      worldMeta = feed;
      if (hostDownSince !== null) {
        const back = entry('dsm', 'The game account is back', 'Its record continues where it stopped', 'ok', Date.now() - hostDownSince);
        for (const seat of allSeats()) pushEntries(seat, [back]);
        hostDownSince = null;
      }
      if (feed.entries.length > 0) {
        after = feed.entries[feed.entries.length - 1].seq;
        const entries = feed.entries.map(dsmEntry);
        for (const seat of allSeats()) pushEntries(seat, entries);
      }
    } catch (e) {
      // One line per outage, not one per read.
      if (hostDownSince === null) {
        hostDownSince = Date.now();
        const failed = entry('dsm', 'The game account is unreachable', String(e), 'fail');
        for (const seat of allSeats()) pushEntries(seat, [failed]);
      }
    }
    setTimeout(tick, 1000);
  };
  void tick();
}

/**
 * `ask`, once the game's account answers. While it is away (a fetch that
 * never reached it) the screen says so and the game waits; when it answers
 * again the screen shows `shown` once more. A refusal from the account is
 * not an absence: it is thrown.
 */
async function whenReachable<T>(
  player: RpgPlayer,
  gui: { update: (data: object) => void },
  shown: () => object,
  ask: () => Promise<T>,
): Promise<T> {
  let missed = 0;
  for (;;) {
    try {
      const answer = await ask();
      if (missed > 0) gui.update(shown());
      return answer;
    } catch (e) {
      if (!(e instanceof TypeError) || !seats.has(player.id)) throw e;
      missed += 1;
      gui.update({ ...shown(), status: `The game account is unreachable (${e.message}); waiting for it.` });
      await sleep(2000);
    }
  }
}

function dsmEntry(e: pb.AppHostActivityEntryV1): OverlayEntry {
  const failed = e.error.length > 0;
  const moved = e.positionBefore !== undefined && e.positionAfter !== undefined && e.positionAfter !== e.positionBefore;
  return {
    id: nextEntry++,
    lane: 'dsm',
    title: e.kind === pb.AppHostActivityKind.RELAY ? `${e.name}` : `${e.name}`,
    detail: [e.summary, failed ? e.error : e.result].filter((x) => x.length > 0).join(' → '),
    tone: failed ? 'fail' : moved ? 'ok' : 'info',
    dsm: {
      route: e.name,
      positionBefore: e.positionBefore === undefined ? undefined : String(e.positionBefore),
      positionAfter: e.positionAfter === undefined ? undefined : String(e.positionAfter),
      econRoot: e.econRootAfter.length ? short(e.econRootAfter) : undefined,
      deviceTree: e.deviceTreeAfter.length ? short(e.deviceTreeAfter) : undefined,
    },
  };
}

// ------------------------------- connecting -------------------------------

/** What the game asks a wallet for, once, at connect. */
function scopes(w: World): pb.ConnectScopeV1[] {
  const wild = w.economy.wild;
  const era = w.economy.eraCommit;
  const cap = (policyCommit: Bytes, perRequest: bigint, total: bigint) =>
    new pb.ConnectCapV1({ policyCommit, perRequest, total });
  return [
    new pb.ConnectScopeV1({ kind: pb.ConnectScopeKind.ACCEPT_ISSUED }),
    new pb.ConnectScopeV1({ kind: pb.ConnectScopeKind.PAY, caps: [cap(wild, 10n, 300n)] }),
    new pb.ConnectScopeV1({
      kind: pb.ConnectScopeKind.SWAP,
      policyCommits: [wild, era],
      caps: [cap(wild, 1_000n, 5_000n), cap(era, 2_000n, 10_000n)],
    }),
    new pb.ConnectScopeV1({ kind: pb.ConnectScopeKind.HOLDINGS, policyCommits: [wild, era] }),
  ];
}

/**
 * Show the player a connect code and wait for their wallet. Resolves once the
 * wallet accepted and the game's account added it as a contact.
 */
export async function connectWallet(player: RpgPlayer, bound: (state: GameState) => void): Promise<void> {
  const seat = seatOf(player);
  openPanel(player);
  const gui = player.gui('dsm-connect');
  // A page that comes back (from the wallet app, which the phone brings to the
  // front, or a reload) sends the login token it was given with its code.
  let offered: string | null = null;
  gui.on<{ token?: unknown }>('resume', ({ token }) => {
    if (typeof token === 'string') offered = token;
  });
  const shown = { code: '', status: 'Setting up the game account on DSM…', resumeToken: null as string | null };
  void gui.open(shown, { blockPlayerInput: true });
  const w = await world();
  // Give a returning page a moment to send its token before making a new offer.
  for (let i = 0; i < 10 && offered === null; i++) await sleep(200);

  let sessions = await whenReachable(player, gui, () => shown, () => w.host.sessions());
  const held = (login: Login) =>
    sessions.find((s) => (login.session !== null && b32(s.sessionId) === login.session) || b32(s.offerDigest) === login.offer);

  /** The login this page goes on with: the one it brought, or a new offer and token. */
  const loginFor = async (token: string | null): Promise<[string, Login]> => {
    const brought = token === null ? undefined : w.economy.record.resume[token];
    if (token !== null && brought !== undefined && brought.offer !== '' && (brought.session === null || held(brought))) {
      if (brought.session === null) {
        // The code shown before: the player may be approving it in the wallet now.
        const offer = await whenReachable(player, gui, () => shown, () => w.host.offerOf(fromB32(brought.offer)));
        shown.code = offer.code;
      }
      return [token, brought];
    }
    if (token !== null && brought !== undefined && brought.session !== null && held(brought)) return [token, brought];
    const offer = await whenReachable(player, gui, () => shown, () => w.host.offer('Wildstate', scopes(w), [w.economy.wild]));
    const fresh = b32(globalThis.crypto.getRandomValues(new Uint8Array(32)));
    const login: Login = { offer: b32(offer.offerDigest), session: null };
    w.economy.record.resume[fresh] = login;
    w.economy.save();
    shown.code = offer.code;
    web2(player, 'Connect code shown', 'The game server asked its DSM account for an offer and shows its code');
    return [fresh, login];
  };

  let [token, login] = await loginFor(offered);
  const resumedSession = login.session;
  seat.offerDigest = login.offer;
  seat.resumeToken = token;
  shown.resumeToken = token;
  shown.status = 'Scan this with your DSM wallet: Apps → SCAN CODE.';
  gui.update(shown);
  const started = Date.now();
  for (;;) {
    const mine = held(login);
    if (mine) {
      seat.session = own(mine.sessionId);
      seat.wallet = b32(mine.peerDeviceId);
      if (login.session === null) {
        login.session = b32(mine.sessionId);
        w.economy.save();
      }
      break;
    }
    if (!seats.has(player.id)) return;
    await sleep(1500);
    // A token that arrived late names the code this page showed before.
    if (offered !== null && offered !== token && w.economy.record.resume[offered] !== undefined) {
      [token, login] = await loginFor(offered);
      seat.offerDigest = login.offer;
      seat.resumeToken = token;
      shown.resumeToken = token;
      gui.update(shown);
    }
    sessions = await whenReachable(player, gui, () => shown, () => w.host.sessions());
  }
  pushEntries(seat, [
    resumedSession !== null && resumedSession === login.session
      ? entry('web2', 'Connection resumed', `This browser's game login resumed the session with wallet ${short(seat.wallet!)}; nothing about DSM changed`, 'ok', Date.now() - started)
      : entry('dsm', 'Wallet connected', `Wallet ${short(seat.wallet!)} approved the grant; the game account added it as a contact`, 'ok', Date.now() - started),
  ]);
  void gui.close();
  const known = w.economy.record.profiles[seat.wallet!];
  const profile = known ?? initialState(seat.wallet!);
  bound(profile);
  web2(player, 'Profile loaded', `The game's own record for wallet ${short(seat.wallet!)}: progress, HP and XP are game data`);
  // Every creature not yet issued, then every object the account issued and still holds: a
  // delivery a restart or a lost session cut off goes on from where it stopped.
  for (const c of profile.creatures.filter((c) => c.anchor === null)) {
    enqueue(player, `Delivering ${displayName(c)}`, () => deliverCreature(player, c.id, c.species));
  }
  enqueue(player, 'Resuming deliveries', async () => {
    for (const anchor of await onTheWay(player)) {
      const issued = w.economy.record.creatures[anchor];
      enqueue(player, `Delivering ${SPECIES[issued.species].name} #${issued.serial}`, () => handOver(player, anchor));
    }
  });
  if (!w.economy.record.welcomed.includes(seat.wallet!)) {
    enqueue(player, 'Paying your starting coin', async () => {
      await payReward(player, WELCOME_COINS, 'welcome');
      w.economy.record.welcomed.push(seat.wallet!);
      w.economy.save();
    });
  }
  enqueue(player, 'Proving your holdings', () => refreshHoldings(player));
}

// ---------------------------------- tasks ----------------------------------

type Commit = (player: RpgPlayer, command: Command) => GameState;
let commitFn: Commit | null = null;
/** How a DSM task changes the game state: through the reducer, like any command. */
export function useCommit(commit: Commit): void {
  commitFn = commit;
}

function commit(player: RpgPlayer, command: Command): GameState {
  if (!commitFn) throw new Error('the game state is not wired to DSM tasks');
  const next = commitFn(player, command);
  const seat = seatOf(player);
  if (seat.wallet) {
    void world().then((w) => {
      w.economy.record.profiles[seat.wallet!] = { ...next, scarecrowReadyAt: Math.max(next.scarecrowReadyAt, w.economy.record.profiles[seat.wallet!]?.scarecrowReadyAt ?? 0) };
      w.economy.save();
    });
  }
  return next;
}

/** Keep the player's profile in the game's record after any command. */
export function persist(player: RpgPlayer, state: GameState): void {
  const seat = seats.get(player.id);
  if (!seat?.wallet) return;
  void world().then((w) => {
    w.economy.record.profiles[seat.wallet!] = { ...state, scarecrowReadyAt: Math.max(state.scarecrowReadyAt, w.economy.record.profiles[seat.wallet!]?.scarecrowReadyAt ?? 0) };
    w.economy.save();
  });
}

/** Free game items, timed by the game server and persisted per connected wallet. */
export async function claimScarecrowGift(player: RpgPlayer): Promise<number> {
  const seat = seatOf(player);
  if (!seat.wallet) throw new Error('Connect your wallet before collecting capsules.');
  const w = await world();
  const current = readState(player);
  const stored = w.economy.record.profiles[seat.wallet];
  const latest = stored && stored.revision > current.revision ? stateSchema.parse(stored) : current;
  const readyAt = Math.max(current.scarecrowReadyAt, stored?.scarecrowReadyAt ?? 0);
  const now = Date.now();
  if (now < readyAt) return readyAt - now;
  player.creatureSave.set(JSON.stringify({ ...latest, scarecrowReadyAt: readyAt }));
  const next = commit(player, { type: 'scarecrow-gift', now });
  // No await between checking the shared profile and installing the result: two sessions
  // for the same wallet cannot both claim. Save before showing the gift dialogue.
  w.economy.record.profiles[seat.wallet] = next;
  w.economy.save();
  for (const other of allSeats()) if (other.wallet === seat.wallet && other.player !== player) {
    other.player.creatureSave.set(JSON.stringify(next));
    other.player.getGui('field-hud')?.update(hudData(other.player));
    other.player.getGui('creature-battle')?.update({ state: next, mode: 'battle', lastAction: 'sync', error: '' });
  }
  web2(player, 'Scarecrow gift', `${SCARECROW_CAPSULES} free capture capsules; next gift in four hours. Game items, no WILD issued.`);
  return 0;
}

/**
 * DSM work runs one task at a time per wallet (not per connection): two pages of one wallet must
 * never send over the same relationship at once.
 */
const walletQueues = new Map<string, Promise<void>>();
function enqueue(player: RpgPlayer, title: string, task: () => Promise<void>): void {
  const seat = seatOf(player);
  const key = seat.wallet ?? `seat/${player.id}`;
  const run = (walletQueues.get(key) ?? Promise.resolve()).then(async () => {
    const started = Date.now();
    try {
      await task();
    } catch (e) {
      // Shown in the DSM panel only; the field stays clear.
      pushEntries(seat, [entry('web2', `${title}: not done`, e instanceof Error ? e.message : String(e), 'fail', Date.now() - started)]);
    }
  });
  walletQueues.set(key, run);
}

// --------------------------------- lobby ---------------------------------

/** The connected wallet's DSM identity (Base32), or null before it connects. */
export function walletOf(player: RpgPlayer): string | null {
  return seats.get(player.id)?.wallet ?? null;
}
/** The connected player of a wallet, if one is online. */
export function playerOfWallet(wallet: string): RpgPlayer | null {
  return allSeats().find((s) => s.wallet === wallet && s.session !== null)?.player ?? null;
}
/** The lobby's records, kept in the game's own record (Web2 game data, never DSM evidence). */
export async function lobbyRecord() {
  const w = await world();
  return { dir: { players: w.economy.record.players, usernames: w.economy.record.usernames }, matches: w.economy.record.matches, save: () => w.economy.save() };
}

let hudData: (player: RpgPlayer) => Record<string, unknown> = () => ({});
export function useHudData(f: (player: RpgPlayer) => Record<string, unknown>): void {
  hudData = f;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll request `seq` until `done`, saying once when it waits for the player. */
async function settle(
  player: RpgPlayer,
  seq: bigint,
  done: (s: pb.ConnectAppStatusV1) => boolean,
  what: string,
  onWaiting?: () => void,
): Promise<pb.ConnectAppStatusV1> {
  // The request's own session: a page that drops and comes back mid-wait gets a fresh seat.
  const session = sessionOf(seatOf(player));
  const w = await world();
  let saidWaiting = false;
  for (let round = 0; round < 240; round++) {
    const s = await w.host.status(session, seq);
    if (done(s)) {
      // Once more, into the record: what the account established.
      return w.host.status(session, seq, true);
    }
    if (s.answered && (s.outcome === pb.ConnectOutcome.FAILED || s.outcome === pb.ConnectOutcome.DECLINED)) {
      throw new Error(`${what}: the wallet answered ${pb.ConnectOutcome[s.outcome]}${s.reason ? ` (${s.reason})` : ''}`);
    }
    if (!saidWaiting && s.outcome === pb.ConnectOutcome.AWAITING_APPROVAL) {
      saidWaiting = true;
      web2(player, `${what}: waiting for you`, 'Outside what you approved: approve it on the phone (Apps → Waiting)', 'wait');
      onWaiting?.();
    }
    await sleep(1500);
  }
  throw new Error(`${what}: still not settled; it stays pending`);
}

/** An online transfer from the game's account, retried while its relationship settles. */
async function sendFromGame(player: RpgPlayer, ticker: string, amount: string, memo: string): Promise<void> {
  const seat = seatOf(player);
  const w = await world();
  for (let round = 0; ; round++) {
    try {
      await w.host.send(fromB32(seat.wallet!), ticker, amount, memo);
      return;
    } catch (e) {
      const settling = e instanceof HostError && /not send-ready|pending online transition/.test(e.message);
      if (!settling || round >= 40) throw e;
      if (round === 0) web2(player, 'Waiting to send', 'The relationship with your wallet is settling a previous transfer', 'wait');
      // Take in the wallet's countersign now, as the account's inbox poller would.
      await w.host.sync();
      await sleep(2000);
    }
  }
}

/** A caught creature becomes a state object in the player's wallet. */
async function deliverCreature(player: RpgPlayer, creatureId: string, species: Species): Promise<void> {
  const w = await world();
  const started = Date.now();
  const anchor = await w.economy.issueCreature(species, (line) => web2(player, 'Game account', line, 'wait'));
  commit(player, { type: 'bind-creature', creatureId, anchor });
  await handOver(player, anchor, started);
}

/**
 * Objects the game's account issued for this player's creatures and still holds: on their way
 * to the wallet. The account's own balances say so, not the game's record of what it meant to do.
 */
async function onTheWay(player: RpgPlayer): Promise<string[]> {
  const w = await world();
  const held = new Set((await w.host.balances()).filter((b) => b.available === 1n).map((b) => b.policyAnchorB32));
  return readState(player).creatures.flatMap((c) =>
    c.anchor !== null && w.economy.record.creatures[c.anchor] !== undefined && held.has(c.anchor) ? [c.anchor] : [],
  );
}

/** An issued creature object goes to the player's wallet: the wallet roots it, then the account sends it. */
async function handOver(player: RpgPlayer, anchor: string, started = Date.now()): Promise<void> {
  const w = await world();
  const seat = seatOf(player);
  const issued = w.economy.record.creatures[anchor];
  const species = issued.species;
  const seq = await w.host.request(sessionOf(seat), {
    case: 'acceptIssued',
    value: new pb.ConnectAcceptIssuedV1({ anchor: fromB32(anchor) }),
  });
  await settle(player, seq, (s) => s.answered && s.outcome === pb.ConnectOutcome.CARRIED_OUT, 'Accepting the creature');
  await sendFromGame(player, issued.ticker, '1', `${SPECIES[species].name} #${issued.serial}`);
  // Sent: it stays in the party until a proof shows the wallet holding it.
  w.economy.record.inFlight[seat.wallet!] = [...(w.economy.record.inFlight[seat.wallet!] ?? []), anchor];
  w.economy.save();
  pushEntries(seat, [
    entry('dsm', `${SPECIES[species].name} #${issued.serial} delivered`, `State object ${short(anchor)}: supply 1, issued by the game account, now in wallet ${short(seat.wallet!)}`, 'ok', Date.now() - started),
  ]);
  proveLater(player);
}

/** A victory's reward: WILD from the game's account. */
async function payReward(player: RpgPlayer, amount: bigint, why: string): Promise<void> {
  const started = Date.now();
  await sendFromGame(player, COIN.ticker, String(amount), why);
  pushEntries(seatOf(player), [entry('dsm', `${why[0].toUpperCase()}${why.slice(1)}: ${wildText(amount)}`, 'An online transfer from the game account to your wallet', 'ok', Date.now() - started)]);
  proveLater(player);
}

const ITEM_NAMES: Record<ShopItem, string> = { capsule: 'Capture Capsule', poultice: 'Herb Poultice', tonic: 'Charge Tonic', map: 'Ranger’s Map' };
/** Bramble's lines after a purchase and after a sale, as the design's Shop page has them. */
const BRAMBLE = { bought: 'Capsules go fast after a meadow rush. Stock up.', sold: 'Selling a creature transfers it for good. Think it over.' };

/** `n` items from Bramble's board in one payment from the wallet, granted only once the game's account accepted it. */
async function buyItem(player: RpgPlayer, item: ShopItem, n: number): Promise<void> {
  const w = await world();
  const seat = seatOf(player);
  const started = Date.now();
  const cost = ITEM_PRICES[item] * BigInt(n);
  const what = `${n} × ${ITEM_NAMES[item]}`;
  const seq = await w.host.request(sessionOf(seat), {
    case: 'pay',
    value: new pb.ConnectPayV1({ policyCommit: w.economy.wild, amount: cost, memo: what.toLowerCase() }),
  });
  const paid = await settle(player, seq, (s) => s.fact === pb.ConnectFact.PAID, `Paying for ${what.toLowerCase()}`,
    () => shopShow(player, { status: 'Approve the payment on your phone: Apps → Waiting' }));
  commit(player, { type: 'grant-item', item, qty: n, fact: new TextDecoder().decode(paid.paidTx) });
  // The wallet paid: show the balance the proof will confirm, so the board does not lag behind the purchase.
  if (seat.coins !== null) seat.coins -= cost;
  pushEntries(seat, [entry('dsm', `${what} paid: ${wildText(cost)}`, 'Granted on the transfer the game account accepted, never on the wallet\'s word', 'ok', Date.now() - started)]);
  shopShow(player, { busy: false, status: `${what} in your bag · ${wildText(cost)} paid from your wallet`, say: BRAMBLE.bought, delta: `-${cost}`, deltaAt: Date.now() });
  player.getGui('field-hud')?.update(hudData(player));
  proveLater(player);
}

/**
 * A creature for Bramble: its state object moves from the wallet to the game's account, then
 * the game's account pays for it. The grant covers paying WILD, not handing over a creature,
 * so the wallet asks the player on the phone; the sale counts once the account accepted the object.
 */
async function sellCreature(player: RpgPlayer, creatureId: string): Promise<void> {
  const w = await world();
  const seat = seatOf(player);
  const started = Date.now();
  const c = readState(player).creatures.find((x) => x.id === creatureId);
  if (!c) throw new Error('That creature is not in your party');
  if (c.anchor === null) throw new Error(`${displayName(c)} is still on its way to your wallet`);
  const anchor = c.anchor;
  const name = displayName(c);
  const price = BigInt(salePrice(c));
  const seq = await w.host.request(sessionOf(seat), {
    case: 'pay',
    value: new pb.ConnectPayV1({ policyCommit: fromB32(anchor), amount: 1n, memo: `${name} to Bramble` }),
  });
  const paid = await settle(player, seq, (s) => s.fact === pb.ConnectFact.PAID, `Handing ${name} to Bramble`,
    () => shopShow(player, { status: 'Approve the sale on your phone: Apps → Waiting' }));
  // Its game data stays with its object, as for any creature that leaves a party.
  w.economy.record.stats[anchor] = c;
  w.economy.save();
  commit(player, { type: 'sell', creatureId, fact: new TextDecoder().decode(paid.paidTx) });
  shopShow(player, { status: `${name} is Bramble’s now · paying ${wildText(price)}…` });
  await sendFromGame(player, COIN.ticker, String(price), `Bramble bought ${name}`);
  pushEntries(seat, [entry('dsm', `Sold ${name}: ${wildText(price)}`, `Its state object ${short(anchor)} reached the game account, which paid for it`, 'ok', Date.now() - started)]);
  shopShow(player, { busy: false, status: `${name} sold · ${wildText(price)} on its way to your wallet`, say: BRAMBLE.sold, delta: `+${price}`, deltaAt: Date.now() });
  player.getGui('field-hud')?.update(hudData(player));
  proveLater(player);
}

/** What Bramble's screen shows besides the game state: the step DSM is on and his last line. */
interface ShopView { busy: boolean; status: string; say: string; delta: string; deltaAt: number }
const shopViews = new Map<string, ShopView>();
const quietShop = (): ShopView => ({ busy: false, status: '', say: '', delta: '', deltaAt: 0 });
function shopData(player: RpgPlayer) {
  return { state: readState(player), coins: walletCoins(player), ...(shopViews.get(player.id) ?? quietShop()) };
}
function shopShow(player: RpgPlayer, change: Partial<ShopView>): void {
  const view = shopViews.get(player.id);
  if (!view) return;
  shopViews.set(player.id, { ...view, ...change });
  player.getGui('bramble-shop')?.update(shopData(player));
}
/** A task that reports its failure on Bramble's screen as well as in the panel. */
function shopTask(player: RpgPlayer, title: string, task: () => Promise<void>): void {
  enqueue(player, title, async () => {
    try { await task(); }
    catch (e) { shopShow(player, { busy: false, status: `${title}: ${e instanceof Error ? e.message : String(e)}` }); throw e; }
  });
}

/** Bramble's Trading Post, open until the player leaves it. */
export async function openShop(player: RpgPlayer): Promise<void> {
  if (!seatOf(player).session) return;
  shopViews.set(player.id, { ...quietShop(), status: 'Prices in WILD, paid from your DSM wallet' });
  const gui = player.gui('bramble-shop');
  gui.on<{ action: string; item?: string; qty?: number; creatureId?: string }>('shop', ({ action, item, qty, creatureId }) => {
    if (action === 'leave') { gui.close(); return; }
    if (shopViews.get(player.id)?.busy) return;
    if (action === 'buy' && item !== undefined && item in ITEM_PRICES) {
      const it = item as ShopItem;
      const n = Math.max(1, Math.min(SHOP_QTY_MAX, Math.floor(Number(qty) || 1)));
      shopShow(player, { busy: true, say: '', status: `Asking your wallet for ${wildText(ITEM_PRICES[it] * BigInt(n))}…` });
      web2(player, 'Bramble’s board', `${n} × ${ITEM_NAMES[it]}: the game asks your wallet for the payment`);
      shopTask(player, `Buying ${n} × ${ITEM_NAMES[it].toLowerCase()}`, () => buyItem(player, it, n));
    }
    if (action === 'sell' && creatureId) {
      shopShow(player, { busy: true, say: '', status: 'Asking your wallet to hand the creature to Bramble…' });
      web2(player, 'Bramble’s board', 'A sale: the creature’s state object goes to the game account, which pays for it');
      shopTask(player, 'Selling a creature', () => sellCreature(player, creatureId));
    }
  });
  web2(player, 'Trading post', 'Bramble’s prices are game data; paying and selling are DSM');
  await gui.open(shopData(player), { waitingAction: true, blockPlayerInput: true });
  shopViews.delete(player.id);
}
/** The wallet balance as the game last saw it (a proof, adjusted by payments since). */
export function walletCoins(player: RpgPlayer): number | null {
  const c = seats.get(player.id)?.coins ?? null;
  return c === null ? null : Number(c);
}

/**
 * Ask for a fresh holdings proof after an action, as a task of its own: the
 * action is done once DSM did it, whatever the proof that follows finds.
 */
function proveLater(player: RpgPlayer): void {
  enqueue(player, 'Proving your holdings', () => refreshHoldings(player));
}

/** The anchors the game asks about: its coin, ERA, and every creature it issued. */
function holdingsAsked(w: World): Bytes[] {
  return [w.economy.wild, w.economy.eraCommit, ...Object.keys(w.economy.record.creatures).map(fromB32)];
}

/** Verified holdings: coins and the roster follow the wallet. */
async function refreshHoldings(player: RpgPlayer): Promise<void> {
  const w = await world();
  const seat = seatOf(player);
  const asked = holdingsAsked(w);
  const seq = await w.host.request(sessionOf(seat), {
    case: 'holdings',
    value: new pb.ConnectHoldingsV1({ policyCommits: asked }),
  });
  const s = await settle(player, seq, (x) => x.fact === pb.ConnectFact.HOLDINGS || (x.answered && x.fact === pb.ConnectFact.NONE && x.factDetail.startsWith('the proof established nothing')), 'Proving holdings');
  if (s.fact !== pb.ConnectFact.HOLDINGS) throw new Error(s.factDetail);
  const amounts = new Map(s.holdings.map((h) => [b32(h.policyCommit), h.amount]));
  seat.coins = amounts.get(b32(w.economy.wild)) ?? 0n;
  seat.era = amounts.get(b32(w.economy.eraCommit)) ?? 0n;
  seat.provenAt = s.holdingsPosition;
  const held = Object.keys(w.economy.record.creatures).filter((a) => (amounts.get(a) ?? 0n) === 1n);
  const sent = (w.economy.record.inFlight[seat.wallet!] ?? []).filter((a) => !held.includes(a));
  w.economy.record.inFlight[seat.wallet!] = sent;
  const inFlight = [...sent, ...(await onTheWay(player)).filter((a) => !held.includes(a))];
  const before = readState(player);
  // Creatures that left with their object keep their game data in the record.
  for (const c of before.creatures) {
    if (c.anchor !== null && !held.includes(c.anchor) && !inFlight.includes(c.anchor)) w.economy.record.stats[c.anchor] = c;
  }
  commit(player, { type: 'holdings', coins: Number(seat.coins), held, inFlight });
  for (const anchor of held) {
    if (readState(player).creatures.some((c) => c.anchor === anchor)) continue;
    const issued = w.economy.record.creatures[anchor];
    const known = w.economy.record.stats[anchor];
    const creature: Creature = known ?? { ...newCreature(`${anchor}/creature`, issued.species), anchor };
    commit(player, { type: 'receive-creature', creature });
    web2(player, `${SPECIES[issued.species].name} #${issued.serial} joined`, 'Its state object reached your wallet from another player', 'ok');
  }
  w.economy.save();
  const sentLine = inFlight.length > 0 ? `; ${inFlight.length} on the way, not in this proof yet` : '';
  pushEntries(seat, [entry('dsm', 'Holdings proven', `${wildText(seat.coins)}, ${eraText(seat.era)}, ${held.length} creature object(s)${sentLine}, at wallet position ${s.holdingsPosition}: verified against the wallet's economic root`, 'ok')]);
  player.getGui('field-hud')?.update(hudData(player));
  await openMarkets.get(player.id)?.();
}

let readState: (player: RpgPlayer) => GameState = () => {
  throw new Error('the game state is not wired to DSM tasks');
};
export function useReadState(f: (player: RpgPlayer) => GameState): void {
  readState = f;
}

// --------------------------- game events and tasks ---------------------------

/** What a committed command means underneath. */
export function onCommitted(player: RpgPlayer, command: Command, before: GameState, after: GameState): void {
  persist(player, after);
  const battle = after.battle;
  switch (command.type) {
    case 'encounter':
      web2(player, 'Encounter', `A wild ${SPECIES[battle!.wild.species].name} appeared: rolled by the game server`);
      break;
    case 'cast':
      web2(player, 'Fishing', `A ${SPECIES[battle!.wild.species].name} took the line: rolled by the game server`);
      break;
    case 'set-lead':
      web2(player, 'New lead', `${displayName(after.creatures[after.lead])} leads the party: game data, no DSM`);
      break;
    case 'rename':
      web2(player, 'Renamed', 'A nickname is game data: the creature\'s DSM object is unchanged');
      break;
    case 'move': {
      const log = battle?.log ?? [];
      web2(player, 'Battle turn', log.map((l) => `${l.actor === 'own' ? 'You' : 'Wild'}: ${l.move}${l.dmg ? ` ${l.dmg} dmg` : ''}`).join(' · ') + ': computed by the game server, no DSM');
      break;
    }
    case 'escape':
      web2(player, 'Escaped', 'No reward, nothing on DSM');
      break;
    case 'challenge':
      web2(player, 'Trainer battle', `${TRAINERS[command.trainer].name} sends out ${displayName(battle!.wild)}: run by the game server, no DSM`);
      break;
    case 'use-item':
      web2(player, 'Item used', `${command.item} on ${displayName(after.creatures.find((c) => c.id === command.creatureId)!)}: HP and charges are game data, no DSM`);
      break;
    case 'grant-item':
      break;
    case 'heal':
      web2(player, 'Rested at camp', 'HP and charges are game data: no DSM');
      break;
    default:
      break;
  }
  const finished = before.battle?.outcome === 'active' && battle && battle.outcome !== 'active';
  if (finished && battle!.outcome === 'victory' && battle!.source === 'trainer') {
    const t = TRAINERS[battle!.trainer!];
    web2(player, `${t.name} beaten`, `The game decides the bounty (${wildText(TRAINER_REWARD)}); the game account pays it as a transfer`);
    enqueue(player, `Paying ${t.name}'s bounty`, () => payReward(player, TRAINER_REWARD, `bounty from ${t.name}`));
  } else if (finished && battle!.outcome === 'victory') {
    web2(player, 'Victory', 'The game decides the reward; the game account pays it as a transfer');
    enqueue(player, 'Paying the reward', () => payReward(player, VICTORY_REWARD, 'victory reward'));
  }
  if (finished && battle!.outcome === 'captured') {
    const caught = after.creatures[after.creatures.length - 1];
    web2(player, 'Captured', `${displayName(caught)} joins your party: the game issues it as a state object in your wallet`);
    enqueue(player, 'Delivering the creature', () => deliverCreature(player, caught.id, caught.species));
  }
}

// --------------------------------- market ---------------------------------

export interface MarketData {
  /** The game's vault's reserves, as the vault itself reports them. */
  vault: { wild: string; era: string; generation: string } | null;
  coins: string | null;
  era: string | null;
  quote: { side: 'buy' | 'sell'; amountIn: string; amountOut: string; hops: number } | null;
  status: string;
  /** What the market is waiting on the wallet for; its button stays held down until the answer. */
  busy: 'quote' | 'swap' | null;
}

async function vaultReading(): Promise<MarketData['vault']> {
  const w = await world();
  const vault = (await w.host.vaults()).find((v) => b32(v.vaultId) === w.economy.record.vault);
  if (!vault) return null;
  const wildIsA = b32(vault.tokenAPolicyCommit) === b32(w.economy.wild);
  return {
    wild: wildIsA ? vault.reserveADisplay : vault.reserveBDisplay,
    era: wildIsA ? vault.reserveBDisplay : vault.reserveADisplay,
    generation: String(vault.generation),
  };
}

/** An open market's redraw, by player: a holdings proof that lands while it is open shows in it. */
const openMarkets = new Map<string, () => Promise<void>>();

export async function openMarket(player: RpgPlayer): Promise<void> {
  const seat = seatOf(player);
  sessionOf(seat);
  const gui = player.gui('dsm-market');
  let quote: MarketData['quote'] = null;
  let shownStatus = '';
  let busy: MarketData['busy'] = null;
  const data = async (status: string): Promise<MarketData> => {
    shownStatus = status;
    // A vault that cannot be read is said so, beside whatever else is shown.
    let vault: MarketData['vault'] = null;
    let unread = '';
    try { vault = await vaultReading(); }
    catch (e) { unread = ` The vault could not be read: ${e instanceof Error ? e.message : String(e)}`; }
    return {
      vault,
      coins: seat.coins === null ? null : wildText(seat.coins),
      era: seat.era === null ? null : eraText(seat.era),
      quote,
      status: status + unread,
      busy,
    };
  };
  openMarkets.set(player.id, async () => gui.update(await data(shownStatus)));
  gui.on<{ action: string; side?: 'buy' | 'sell'; amount?: string }>('market', async ({ action, side, amount }) => {
    if (action === 'close') { openMarkets.delete(player.id); void gui.close(); return; }
    // Whatever goes wrong underneath (a wallet that has not answered, a host out of reach) is
    // the market's to say: it must never take the game server down with it.
    // One question to the wallet at a time: a second tap while one waits would only queue behind it.
    if (busy) return;
    try { await marketAction(action, side, amount); }
    catch (e) { busy = null; gui.update(await data(e instanceof Error ? e.message : String(e))); }
  });
  const marketAction = async (action: string, side: 'buy' | 'sell' | undefined, amount: string | undefined) => {
    const w = await world();
    const buy = side === 'buy';
    // Buying WILD spends ERA (two decimals); selling WILD spends WILD (none).
    const amountIn = buy ? BigInt(Math.round(Number(amount) * 100)) : BigInt(Math.round(Number(amount)));
    if (!(amountIn > 0n)) { gui.update(await data('Enter an amount.')); return; }
    const [tokenIn, tokenOut] = buy ? [w.economy.eraCommit, w.economy.wild] : [w.economy.wild, w.economy.eraCommit];
    if (action === 'quote') {
      busy = 'quote';
      gui.update(await data('Asking your wallet for a SoFi quote…'));
      web2(player, 'Market', 'Quote: the game asks your wallet to price the swap through SoFi');
      const seq = await w.host.request(sessionOf(seat), { case: 'quote', value: new pb.ConnectQuoteV1({ tokenIn, tokenOut, amountIn }) });
      const s = await settle(player, seq, (x) => x.answered && x.quote !== undefined, 'Quote');
      const q = s.quote!;
      quote = { side: buy ? 'buy' : 'sell', amountIn: buy ? eraText(q.amountIn) : wildText(q.amountIn), amountOut: buy ? wildText(q.amountOut) : eraText(q.amountOut), hops: q.hops };
      busy = null;
      gui.update(await data(`Quote: ${quote.amountIn} → ${quote.amountOut} over ${q.hops} hop(s). Information only.`));
      return;
    }
    if (action === 'swap') {
      const started = Date.now();
      busy = 'swap';
      gui.update(await data('Your wallet is trading through SoFi…'));
      web2(player, 'Market', 'Swap: the game asks your wallet to trade; the wallet runs an ordinary SoFi trade');
      const seq = await w.host.request(sessionOf(seat), { case: 'swap', value: new pb.ConnectSwapV1({ tokenIn, tokenOut, amountIn, minAmountOut: 1n }) });
      try {
        const s = await settle(player, seq, (x) => x.answered && x.outcome === pb.ConnectOutcome.CARRIED_OUT, 'Swap');
        const position = s.swap?.position ?? 0n;
        pushEntries(seat, [entry('dsm', 'Swap realized', `SoFi trade through the WILD/ERA vault at wallet position ${position}; the vault's own record shows it`, 'ok', Date.now() - started)]);
        proveLater(player);
        quote = null;
        busy = null;
        gui.update(await data(`Swapped. Realized at position ${position}.`));
      } catch (e) {
        busy = null;
        gui.update(await data(e instanceof Error ? e.message : String(e)));
      }
    }
  };
  await gui.open(await data(`Swap WILD and ERA with the game's market: ${MARKET.wild} WILD / ${MARKET.era} ERA at the start, ${MARKET.feeBps} bps.`), { waitingAction: true, blockPlayerInput: true });
}
