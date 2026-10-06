/**
 * The lobby: challenge a friend by username or DSM identity, or wait for the matchmaker to pair
 * you by stake and rating; then a player-vs-player match on the battle screen.
 *
 * Identity is the wallet's DSM account id; usernames, ratings and history are the game's own
 * records keyed by it (src/domain/username.ts). Matches run on the game server (src/domain/match.ts)
 * and are Web2 results, never DSM evidence. Stakes other than 0 stay closed until escrow wagers
 * are wired (the wallet locks each stake in a DSM escrow vault; the game only referees).
 */
import { Components, type RpgPlayer } from '@rpgjs/server';
import { session } from './journey';
import { lobbyRecord, playerOfWallet, walletOf, web2 } from './dsm';
import { commit, isFighting, setFighting } from './field';
import { isSpeaking } from './dialogue';
import { SPECIES, GameError, displayName, fieldedTeam, level, maxCharges, maxHp, type Command, type Creature, type GameState } from '../../domain/game';
import { claimUsername, freshProfile, resolvePlayer, shownName, HISTORY_MAX, RENAME_COOLDOWN_MS, type Directory, type MatchSummary } from '../../domain/username';
import { pair, window, validStake, STAKE_TIERS, MAX_STAKE, type Ticket } from '../../domain/matchmaker';
import { choose, expire, forfeit, other, parseItem, startMatch, type Match, type Side } from '../../domain/match';
import { rate } from '../../domain/rating';

/** Wagers open once escrow locking is in the DSM wallet; until then only free matches. */
const WAGERS_OPEN = false;
const stakeOpen = (stake: number) => validStake(stake) && (stake === 0 || WAGERS_OPEN);
const CHALLENGE_MS = 120_000;
/** A player who drops out of a match has this long to come back before forfeiting. */
const GRACE_MS = 60_000;

interface Challenge { id: string; from: string; to: string; stake: number; at: number }
const queue = new Map<string, Ticket>();
const challenges = new Map<string, Challenge>();
/** Each wallet's live match, and when its player dropped out of it. */
const liveOf = new Map<string, string>();
const absentSince = new Map<string, number>();
/** The move each side chose for the turn that just resolved, so its screen animates it as its own. */
const chosen = new Map<string, string>();
const notices = new Map<string, string>();
let serial = 0;

const sideOf = (m: Match, wallet: string): Side => (m.a.wallet === wallet ? 'a' : 'b');

/** A team for a match: the chosen team (else the lead and the rest), standing creatures only, as prepared. */
function pvpTeam(s: GameState): Creature[] {
  return fieldedTeam(s).map(id => s.creatures.find(c => c.id === id)!);
}
/** The player's creatures for the lobby's team step: who is picked, how they stand, and what items can help. */
function teamView(s: GameState) {
  return {
    picked: fieldedTeam(s),
    chosen: s.team,
    poultice: s.inventory.poultice, tonic: s.inventory.tonic,
    creatures: s.creatures.map(c => ({
      id: c.id, name: displayName(c), species: c.species, level: level(c), hp: c.hp, maxHp: maxHp(c),
      charges: SPECIES[c.species].moves.filter(m => m.max).map(m => ({ name: m.name, left: c.charges[m.id] ?? 0, max: maxCharges(m, c) })),
    })),
  };
}

// ------------------------------------------------------------------ views

async function lobbyView(player: RpgPlayer) {
  const wallet = walletOf(player)!;
  const { dir, matches } = await lobbyRecord();
  const me = dir.players[wallet] ?? freshProfile();
  const brief = (id: string) => ({ id, name: shownName(dir, id), rating: dir.players[id]?.rating ?? 1200, online: playerOfWallet(id) !== null });
  const ticket = queue.get(wallet);
  const now = Date.now();
  return {
    now,
    me: { id: wallet, name: me.username, rating: me.rating, wins: me.wins, losses: me.losses, games: me.games, renameReadyAt: me.username ? me.renamedAt + RENAME_COOLDOWN_MS : 0 },
    stakes: STAKE_TIERS, maxStake: MAX_STAKE, wagersOpen: WAGERS_OPEN,
    queued: ticket ? { stake: ticket.stake, since: ticket.since, window: window(now - ticket.since) } : null,
    incoming: [...challenges.values()].filter(c => c.to === wallet).map(c => ({ id: c.id, from: brief(c.from), stake: c.stake, expiresAt: c.at + CHALLENGE_MS })),
    outgoing: [...challenges.values()].filter(c => c.from === wallet).map(c => ({ id: c.id, to: brief(c.to), stake: c.stake, expiresAt: c.at + CHALLENGE_MS })),
    history: me.history.map(h => ({ ...h, opponentName: shownName(dir, h.opponent) })),
    live: liveOf.get(wallet) ?? null,
    liveMatch: (() => { const id = liveOf.get(wallet); const m = id ? matches[id] : undefined; return m ? { id: m.id, stake: m.stake, opponent: brief(m[other(sideOf(m, wallet))].wallet) } : null; })(),
    notice: notices.get(wallet) ?? '',
    team: teamView(session(player).read()),
  };
}

/** The match as one side's battle screen sees it: its own team, the other side's active creature. */
function battleView(m: Match, side: Side) {
  const me = m[side], foe = m[other(side)];
  const outcome = m.phase === 'battle' ? 'active' : m.winner === side ? 'victory' : 'defeat';
  const state = {
    rules: 'creatures-v4', holder: me.wallet, revision: m.turn, nextEncounter: 0, nextCast: 0,
    creatures: me.team, lead: 0, team: me.team.map(c => c.id),
    inventory: { capsules: 0, rod: false, poultice: me.items.poultice, tonic: me.items.tonic, map: 0 }, coins: 0,
    campaign: { instance: '', branch: 'unselected' }, consumed: [], commandIds: [], victories: 0, captures: 0, trainersBeaten: [], scarecrowReadyAt: 0,
    battle: {
      id: m.id, creatureId: me.team[me.active].id, wild: foe.team[foe.active], turn: m.turn, source: 'trainer', outcome,
      log: m.log.map(({ side: s, ...e }) => ({ actor: s === side ? 'own' : 'wild', ...e })),
      format: 'team3', roster: me.team.map(c => c.id), bench: foe.team.filter((c, i) => i !== foe.active && c.hp > 0),
      ko: { own: me.ko, foe: foe.ko }, events: m.events.map(e => ({ side: e.side === side ? 'own' : 'foe', kind: e.kind, creature: e.creature })),
    },
  };
  return {
    state, mode: 'pvp', lastAction: chosen.get(`${m.id}/${side}`) ?? '', error: '',
    pvp: { opponent: foe.name, stake: m.stake, deadline: m.deadline, waiting: me.choice !== null && foe.choice === null, reason: m.reason },
  };
}

// ------------------------------------------------------------------ lobby GUI

let started = false;
/** Starts the lobby's clock once, after voiding matches a server restart cut off. */
async function ensureStarted() {
  if (started) return;
  started = true;
  await voidStaleMatches();
  setInterval(() => { void tickLobby(); }, 1000);
}

export async function openLobby(player: RpgPlayer): Promise<void> {
  await ensureStarted();
  const wallet = walletOf(player);
  if (!wallet || isFighting(player) || isSpeaking(player)) return;
  const gui = player.gui('lobby');
  gui.on<{ action: string; name?: string; query?: string; to?: string; stake?: number; id?: string; creatureIds?: unknown[]; item?: string; creatureId?: string }>('lobby', async (d) => {
    const say = (text: string) => notices.set(wallet, text);
    notices.delete(wallet);
    const { dir, save } = await lobbyRecord();
    switch (d.action) {
      case 'close': gui.close(); return;
      case 'set-name': {
        const error = claimUsername(dir, wallet, String(d.name ?? ''), Date.now());
        if (error) say(NAME_ERRORS[error]); else { save(); nameTag(player, dir.players[wallet].username!, wallet); web2(player, 'Username', `Now known as @${dir.players[wallet].username}; your rating and history stay with your DSM identity`); }
        break;
      }
      case 'find': {
        const found = resolvePlayer(dir, String(d.query ?? ''));
        if (!found) say('No player by that name or ID.');
        else if (found === wallet) say('That is you.');
        else say(`Found @${shownName(dir, found)} · ${found.slice(0, 10)}… · rating ${dir.players[found]?.rating ?? 1200}${playerOfWallet(found) ? ' · online' : ' · offline'}`);
        gui.update({ ...(await lobbyView(player)), found: found && found !== wallet ? { id: found, name: shownName(dir, found), rating: dir.players[found]?.rating ?? 1200, online: playerOfWallet(found) !== null } : null });
        return;
      }
      case 'challenge': {
        const to = String(d.to ?? ''), stake = Number(d.stake ?? 0);
        if (!validStake(stake)) say('Name a whole amount of WILD.');
        else if (!stakeOpen(stake)) say('Wagers open once escrow locking is in the DSM wallet.');
        else if (to === wallet || !playerOfWallet(to)) say('That player is not online.');
        else if (pvpTeam(session(player).read()).length === 0) say('Heal a creature first: your team has none standing.');
        else if (liveOf.has(to) || liveOf.has(wallet)) say('One of you is already in a match.');
        else { const id = `ch/${Date.now().toString(36)}/${serial++}`; challenges.set(id, { id, from: wallet, to, stake, at: Date.now() }); say(`Challenge sent to @${shownName(dir, to)}.`); void refreshLobby(to); }
        break;
      }
      case 'accept': {
        const c = challenges.get(String(d.id ?? ''));
        if (!c || c.to !== wallet) { say('That challenge is gone.'); break; }
        if (pvpTeam(session(player).read()).length === 0) { say('Heal a creature first: your team has none standing.'); break; }
        challenges.delete(c.id);
        await begin(c.from, c.to, c.stake);
        return;
      }
      case 'decline':
      case 'cancel': {
        const c = challenges.get(String(d.id ?? ''));
        if (c && (c.to === wallet || c.from === wallet)) { challenges.delete(c.id); void refreshLobby(c.to === wallet ? c.from : c.to); }
        break;
      }
      case 'queue': {
        const stake = Number(d.stake ?? 0);
        if (!(STAKE_TIERS as readonly number[]).includes(stake)) { say('Pick one of the matchmaker stakes.'); break; }
        if (!stakeOpen(stake)) { say('Wagers open once escrow locking is in the DSM wallet.'); break; }
        if (pvpTeam(session(player).read()).length === 0) { say('Heal a creature first: your team has none standing.'); break; }
        queue.set(wallet, { wallet, rating: (dir.players[wallet] ?? freshProfile()).rating, stake, since: Date.now() });
        break;
      }
      case 'leave-queue': queue.delete(wallet); break;
      // The team step: pick up to three, and heal or recharge them with bag items.
      case 'set-team':
      case 'use-item': {
        const command: Command = d.action === 'set-team'
          ? { type: 'set-team', creatureIds: Array.isArray(d.creatureIds) ? d.creatureIds.filter((x): x is string => typeof x === 'string') : [] }
          : { type: 'use-item', item: d.item === 'tonic' ? 'tonic' : 'poultice', creatureId: String(d.creatureId ?? '') };
        try { commit(player, command, session(player).read().revision); }
        catch (e) { if (!(e instanceof GameError)) throw e; say(player.t(`game.error.${e.code}`)); }
        break;
      }
      default: return;
    }
    gui.update(await lobbyView(player));
  });
  void gui.open(await lobbyView(player));
}

const NAME_ERRORS = {
  'invalid-username': 'Use 3 to 16 letters, digits or underscores.',
  'reserved-username': 'That name belongs to the game.',
  'username-taken': 'That name is taken.',
  'rename-cooldown': 'You can change your name once a day.',
} as const;

async function refreshLobby(wallet: string) {
  const p = playerOfWallet(wallet);
  const gui = p?.getGui('lobby');
  if (p && gui) gui.update(await lobbyView(p));
}

/** Called when a player leaves the server: it leaves the queue, and its challenges lapse. */
export function leaveLobby(player: RpgPlayer) {
  const wallet = walletOf(player);
  if (!wallet) return;
  queue.delete(wallet);
  for (const c of challenges.values()) if (c.from === wallet || c.to === wallet) challenges.delete(c.id);
  if (liveOf.has(wallet)) absentSince.set(wallet, Date.now());
}

/** Called when a player's wallet is connected: rejoin a live match, and take the name it chose. */
/**
 * Every character on the map wears its player's name, so another phone's character standing about
 * reads as someone else, not as a frozen copy of your own: the username, or the start of the DSM id.
 */
function nameTag(player: RpgPlayer, username: string | null, wallet: string) {
  player.name = username ? `@${username}` : wallet.slice(0, 6);
  player.setComponentsTop(Components.text('{name}', { fill: '#f6efd2', stroke: '#0b1a15', fontSize: 9, fontWeight: 'bold' }));
}

export async function rejoin(player: RpgPlayer) {
  await ensureStarted();
  const wallet = walletOf(player);
  if (!wallet) return;
  const { dir, matches } = await lobbyRecord();
  nameTag(player, dir.players[wallet]?.username ?? null, wallet);
  const id = liveOf.get(wallet);
  const m = id ? matches[id] : undefined;
  if (m?.phase === 'battle') { absentSince.delete(wallet); openMatch(player, m, sideOf(m, wallet)); }
}

// ------------------------------------------------------------------ matches

async function begin(aWallet: string, bWallet: string, stake: number) {
  const pa = playerOfWallet(aWallet), pb = playerOfWallet(bWallet);
  if (!pa || !pb || isFighting(pa) || isFighting(pb) || liveOf.has(aWallet) || liveOf.has(bWallet)) return;
  if (pvpTeam(session(pa).read()).length === 0 || pvpTeam(session(pb).read()).length === 0) return;
  const { dir, matches, save } = await lobbyRecord();
  queue.delete(aWallet); queue.delete(bWallet);
  for (const c of challenges.values()) if ([c.from, c.to].some(w => w === aWallet || w === bWallet)) challenges.delete(c.id);
  const id = `pvp/${Date.now().toString(36)}/${serial++}`;
  const m = startMatch(id, stake,
    { wallet: aWallet, name: shownName(dir, aWallet), team: pvpTeam(session(pa).read()), items: session(pa).read().inventory },
    { wallet: bWallet, name: shownName(dir, bWallet), team: pvpTeam(session(pb).read()), items: session(pb).read().inventory }, Date.now());
  matches[id] = m; save();
  liveOf.set(aWallet, id); liveOf.set(bWallet, id);
  for (const [p, side] of [[pa, 'a'], [pb, 'b']] as const) {
    p.getGui('lobby')?.close();
    web2(p, 'Match', `vs @${m[other(side)].name}: run by the game server, no DSM${stake ? '' : ' · free match'}`);
    openMatch(p, m, side);
  }
}

function openMatch(player: RpgPlayer, m: Match, side: Side) {
  setFighting(player, true);
  const gui = player.gui('creature-battle');
  gui.on<{ action: string }>('battle', async ({ action }) => {
    const { matches, save } = await lobbyRecord();
    const live = matches[m.id];
    if (!live) return;
    // After a match, players go back to the lobby for the next one, not out to the map.
    if (action === 'continue') {
      if (live.phase === 'battle') return;
      gui.close();
      setFighting(player, false);
      await openLobby(player);
      return;
    }
    if (action === 'escape') forfeit(live, side);
    else {
      const error = choose(live, side, action, Date.now());
      if (error) { gui.update({ ...battleView(live, side), error: player.t(`game.error.${error}`) }); return; }
      // An item used in the match leaves the player's bag too.
      const item = parseItem(action);
      if (item) {
        try { commit(player, { type: 'consume-item', item: item.item }, session(player).read().revision); }
        catch (e) { if (!(e instanceof GameError)) throw e; }
      }
      chosen.set(`${live.id}/${side}`, action);
    }
    save();
    await publish(live);
  });
  void gui.open(battleView(m, side), { waitingAction: true, blockPlayerInput: true }).finally(() => setFighting(player, false));
}

/** Sends both sides the match as it stands; settles it once it is over. */
async function publish(m: Match) {
  for (const side of ['a', 'b'] as const) {
    const p = playerOfWallet(m[side].wallet);
    p?.getGui('creature-battle')?.update(battleView(m, side));
  }
  if (m.phase !== 'battle') await settle(m);
}

async function settle(m: Match) {
  const { dir, save } = await lobbyRecord();
  liveOf.delete(m.a.wallet); liveOf.delete(m.b.wallet);
  absentSince.delete(m.a.wallet); absentSince.delete(m.b.wallet);
  if (m.winner === null) { save(); return; }
  const winner = m[m.winner], loser = m[other(m.winner)];
  const pw = (dir.players[winner.wallet] ??= freshProfile()), pl = (dir.players[loser.wallet] ??= freshProfile());
  if (pw.history.some(h => h.matchId === m.id)) return; // rated once per match
  const next = rate(pw, pl);
  const at = Date.now();
  const entry = (p: typeof pw, opponent: string, result: MatchSummary['result'], rating: number) => {
    p.history = [{ matchId: m.id, opponent, stake: m.stake, result, ratingDelta: rating - p.rating, at }, ...p.history].slice(0, HISTORY_MAX);
    p.rating = rating; p.games += 1;
    if (result === 'win') p.wins += 1; else p.losses += 1;
  };
  entry(pw, loser.wallet, 'win', next.winner);
  entry(pl, winner.wallet, 'loss', next.loser);
  save();
  for (const [wallet, won] of [[winner.wallet, true], [loser.wallet, false]] as const) {
    const p = playerOfWallet(wallet);
    if (p) web2(p, won ? 'Match won' : 'Match lost', `vs @${(won ? loser : winner).name} · ${m.reason} · rating ${dir.players[wallet].rating}: the game server's result, no DSM`);
  }
}

/** Every second: pair the queue, expire turns, forfeit players who stayed away, lapse old challenges. */
async function tickLobby() {
  const now = Date.now();
  for (const c of challenges.values()) if (now - c.at > CHALLENGE_MS) { challenges.delete(c.id); void refreshLobby(c.from); void refreshLobby(c.to); }
  for (const [a, b] of pair([...queue.values()].filter(t => playerOfWallet(t.wallet)), now)) await begin(a.wallet, b.wallet, a.stake);
  const { matches, save } = await lobbyRecord();
  for (const id of new Set(liveOf.values())) {
    const m = matches[id];
    if (!m || m.phase !== 'battle') continue;
    const gone = (['a', 'b'] as const).find(s => now - (absentSince.get(m[s].wallet) ?? now) > GRACE_MS);
    if (gone) forfeit(m, gone);
    else if (now >= m.deadline) {
      for (const s of ['a', 'b'] as const) if (m[s].choice === null) chosen.set(`${m.id}/${s}`, 'strike');
      expire(m, now);
    } else continue;
    save();
    await publish(m);
  }
  for (const t of queue.values()) void refreshLobby(t.wallet);
}

/** Matches left mid-battle by a server restart are void: nobody's rating moves. */
async function voidStaleMatches() {
  const { matches, save } = await lobbyRecord();
  for (const m of Object.values(matches)) if (m.phase === 'battle') m.phase = 'void';
  save();
}

export type { Directory };
