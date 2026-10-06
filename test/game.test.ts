import { describe, expect, it } from 'vitest';
import { initialState, transition, score, SPECIES, newCreature, grantXp, level, maxHp, maxCharges, xpGain, wildLevel, salePrice, TRAINER_LEVEL, HP_PER_LEVEL, SHOP_QTY_MAX, type Command, type GameState } from '../src/domain/game';

const step = (s: GameState, c: Command) => transition(s, s.revision, `command/${s.revision}`, c);
const encounter = () => step(initialState('alice'), { type: 'encounter' });
const mv = (id: string) => (s: GameState) => step(s, { type: 'move', move: id });
const flare = mv('flare'), strike = mv('strike'), bite = mv('ember-bite'), coat = mv('warm-coat');

describe('gameplay contract (v4 moves)', () => {
  it('preserves HP and per-move charges between encounters until explicit healing', () => {
    // Embercub (fire) vs Mossling (grass): Flare 14 ×1.5 = 21; wild 28 → 7 → 0.
    const won = flare(flare(encounter()));
    expect(won.battle!.outcome).toBe('victory');
    expect(won.creatures[0].charges.flare).toBe(3);
    expect(won.creatures[0].xp).toBe(10);
    const next = step(won, { type: 'encounter' });
    expect(next.creatures[0].charges.flare).toBe(3);
    expect(() => step(next, { type: 'heal' })).toThrow('battle-active');
    const escaped = step(next, { type: 'escape' });
    expect(step(escaped, { type: 'heal' }).creatures[0]).toMatchObject({ hp: 40, charges: { flare: 5, 'ember-bite': 3, 'warm-coat': 2 } });
  });
  it('resolves damage from the pinned move table, never from the client', () => {
    const s = strike(encounter());
    expect(s.battle!.log[0]).toMatchObject({ actor: 'own', move: 'strike', dmg: 8, mult: 1 });
    expect(s.battle!.wild.hp).toBe(20);
    // Mossling's Leaf Cut (12-4) ×0.5 vs fire = 4
    expect(s.battle!.log[1]).toMatchObject({ actor: 'wild', move: 'leaf-cut', dmg: 4 });
    expect(s.creatures[0].hp).toBe(36);
  });
  it('rejects unknown moves and exhausted charges without changing state', () => {
    const s = encounter(); const before = structuredClone(s);
    expect(() => step(s, { type: 'move', move: 'leaf-cut' })).toThrow('invalid-command');
    expect(s).toEqual(before);
    let t = s; for (let i = 0; i < 2; i++) t = coat(t);
    expect(() => coat(t)).toThrow('no-charges');
  });
  it('applies, ticks and clears statuses deterministically', () => {
    const s = bite(encounter()); // 9 ×1.5 = 14 → wild 14, burn applied then ticks once at end of own turn (3)
    expect(s.battle!.log[0]).toMatchObject({ status: 'burn', burn: 3 });
    expect(s.battle!.wild.hp).toBe(11);
    expect(s.battle!.wild.statuses).toEqual([{ id: 'burn', turns: 1 }]);
    const t = strike(s); // 8 → 3, burn ticks 3 → 0 → victory before wild acts
    expect(t.battle!.outcome).toBe('victory');
    expect(t.battle!.log).toHaveLength(1);
    expect(t.battle!.wild.statuses).toEqual([]);
  });
  it('guard halves the next hit once', () => {
    const s = coat(encounter());
    expect(s.battle!.log[1].dmg).toBe(2);
    expect(s.creatures[0].guard).toBe(false);
  });
  it('consumes capture item and opportunity together, retaining captured HP and charges', () => {
    const weakened = strike(strike(encounter())); // 28 → 20 → 12
    const caught = step(weakened, { type: 'capture' });
    expect(caught.inventory.capsules).toBe(2);
    expect(caught.creatures[1]).toMatchObject({ hp: 12, species: 'mossling', statuses: [], guard: false, anchor: null });
    expect(caught.creatures[1].charges).toEqual({ 'leaf-cut': 5, 'root-bind': 3, photosynth: 1 });
    expect(caught.consumed).toEqual([`encounter/${caught.battle!.id}`]);
    expect(score(caught)).toBe(20);
    expect(() => step(caught, { type: 'capture' })).toThrow('no-battle');
  });
  it('rejects capture of a healthy creature without changing parent resources', () => {
    const s = encounter(); const before = structuredClone(s);
    expect(() => step(s, { type: 'capture' })).toThrow('not-weakened');
    expect(s).toEqual(before);
  });
  it('does not reward escape and never reuses an encounter identity', () => {
    const s = encounter(); const escaped = step(s, { type: 'escape' });
    const next = step(escaped, { type: 'encounter' });
    expect(next.battle!.id).not.toBe(s.battle!.id);
    expect(next.battle!.wild.species).toBe('voltusk');
    expect(escaped.coins).toBe(0); expect(score(escaped)).toBe(0);
  });
  it('allows one campaign branch per player and leaves other players independent', () => {
    const chosen = step(initialState('alice'), { type: 'campaign', branch: 'sanctuary' });
    expect(() => step(chosen, { type: 'campaign', branch: 'rangers' })).toThrow('choice-consumed');
    expect(step(initialState('bob'), { type: 'campaign', branch: 'rangers' }).campaign.branch).toBe('rangers');
  });
  it('rejects stale battle inputs and duplicate command IDs', () => {
    const s = encounter(); const next = flare(s);
    expect(() => transition(next, s.revision, 'fresh', { type: 'capture' })).toThrow('stale');
    expect(() => transition(next, next.revision, next.commandIds[0], { type: 'capture' })).toThrow('stale');
  });
  it('requires healing a fainted creature before another encounter', () => {
    const s = encounter(); s.creatures[0].hp = 1;
    const lost = strike(s);
    expect(lost.battle!.outcome).toBe('defeat');
    expect(() => step(lost, { type: 'encounter' })).toThrow('fainted');
    expect(lost.victories).toBe(0);
  });
  it('fishing draws from the pond rotation and needs a rod', () => {
    const cast = step(initialState('alice'), { type: 'cast' });
    expect(cast.battle).toMatchObject({ source: 'pond', outcome: 'active' });
    expect(cast.battle!.wild.species).toBe('tidefin');
    const again = step(step(cast, { type: 'escape' }), { type: 'cast' });
    expect(again.battle!.wild.species).toBe('brineback');
    expect(step(step(again, { type: 'escape' }), { type: 'cast' }).battle!.wild.species).toBe('rattlefin');
    const noRod = initialState('bob'); noRod.inventory.rod = false;
    expect(() => step(noRod, { type: 'cast' })).toThrow('no-rod');
  });
  it('names a capture (trimmed to 12 chars) and keeps the species name when blank', () => {
    const weakened = strike(strike(encounter()));
    const named = step(weakened, { type: 'capture', nick: '  Puddles the Magnificent ' });
    expect(named.creatures[1].nick).toBe('Puddles the ');
    const blank = step(weakened, { type: 'capture' });
    expect(blank.creatures[1].nick).toBe('');
    const renamed = step(blank, { type: 'rename', creatureId: blank.creatures[1].id, nick: 'Moss' });
    expect(renamed.creatures[1].nick).toBe('Moss');
  });
  it('swaps the lead and uses it for the next encounter; a fainted lead blocks', () => {
    const caught = step(strike(strike(encounter())), { type: 'capture' });
    const swapped = step(caught, { type: 'set-lead', creatureId: caught.creatures[1].id });
    expect(swapped.lead).toBe(1);
    const next = step(swapped, { type: 'encounter' });
    expect(next.battle!.creatureId).toBe(caught.creatures[1].id);
    expect(() => step(caught, { type: 'set-lead', creatureId: 'nope' })).toThrow('unknown-creature');
    expect(() => step(next, { type: 'set-lead', creatureId: caught.creatures[0].id })).toThrow('battle-active');
  });
  it('every species has four moves and one unlimited basic', () => {
    for (const sp of Object.values(SPECIES)) {
      expect(sp.moves).toHaveLength(4);
      expect(sp.moves.filter(m => m.max === 0)).toHaveLength(1);
    }
  });
});

describe('species', () => {
  it('Leon comes third in the meadow; its snare roots and its camouflage guards', () => {
    let s = initialState('leon-player');
    for (let i = 0; i < 2; i++) s = step(step(s, { type: 'encounter' }), { type: 'escape' });
    s = step(s, { type: 'encounter' });
    expect(s.battle!.wild.species).toBe('leon');
    s = step(step(s, { type: 'move', move: 'strike' }), { type: 'move', move: 'strike' });
    s = step(s, { type: 'capture', nick: 'Leon' });
    expect(s.creatures[1]).toMatchObject({ species: 'leon', hp: 12, nick: 'Leon' });
    s = step(step(s, { type: 'heal' }), { type: 'set-lead', creatureId: s.creatures[1].id });
    s = step(s, { type: 'encounter' }); // Embercub: Leon's grass is resisted, fire is not
    s = step(s, { type: 'move', move: 'sticky-snare' });
    expect(s.battle!.log[0].status).toBe('root');
    expect(s.battle!.log[1].skipped).toBe(true);
    s = step(s, { type: 'move', move: 'camouflage' });
    expect(s.battle!.log[1].dmg).toBe(8); // the root is spent: Embercub's Flare (14-4) ×1.5 = 15, halved and rounded
    s = step(step(s, { type: 'escape' }), { type: 'heal' });
    expect(s.creatures[1].charges).toEqual(newCreature('reference', 'leon').charges);
  });
  it('Rattlefin is the pond’s third bite and its Lure Flash stuns', () => {
    let s = initialState('angler');
    for (let i = 0; i < 2; i++) s = step(step(s, { type: 'cast' }), { type: 'escape' });
    s = step(s, { type: 'cast' });
    expect(s.battle!.wild.species).toBe('rattlefin');
    s = step(step(s, { type: 'move', move: 'strike' }), { type: 'move', move: 'strike' });
    s = step(s, { type: 'capture' });
    s = step(step(s, { type: 'heal' }), { type: 'set-lead', creatureId: s.creatures[1].id });
    s = step(s, { type: 'encounter' });
    s = step(s, { type: 'move', move: 'lure-flash' });
    expect(s.battle!.log[0].status).toBe('stun');
    expect(s.battle!.log[1].skipped).toBe(true);
    expect(s.creatures[1].charges['lure-flash']).toBe(2);
  });
});

describe('DSM ledger: the wallet owns coins and creatures, this state only projects them', () => {
  const dsm = () => initialState('wallet');
  const won = () => flare(flare(step(dsm(), { type: 'encounter' })));

  it('credits no coins for a victory: the game account pays the reward as a transfer', () => {
    const s = won();
    expect(s.battle!.outcome).toBe('victory');
    expect(s.coins).toBe(0);
    expect(s.victories).toBe(1);
  });
  it('grants a capsule only for a payment fact, once', () => {
    const granted = step(dsm(), { type: 'grant-capsule', fact: 'TX1' });
    expect(granted.inventory.capsules).toBe(4);
    expect(granted.coins).toBe(0);
    expect(() => step(granted, { type: 'grant-capsule', fact: 'TX1' })).toThrow('choice-consumed');
    expect(() => step(granted, { type: 'grant-capsule', fact: ' ' })).toThrow('choice-consumed');
  });
  it('takes its coin balance and roster from verified holdings', () => {
    const bound = step(dsm(), { type: 'bind-creature', creatureId: 'wallet/starter', anchor: 'EMB' });
    expect(() => step(bound, { type: 'bind-creature', creatureId: 'wallet/starter', anchor: 'X' })).toThrow('invalid-command');
    // Sent, not yet in a proof: it stays.
    const sent = step(bound, { type: 'holdings', coins: 0, held: [], inFlight: ['EMB'] });
    expect(sent.creatures.map(c => c.anchor)).toEqual(['EMB']);
    const held = step(sent, { type: 'holdings', coins: 47, held: ['EMB'], inFlight: [] });
    expect(held.coins).toBe(47);
    expect(held.creatures.map(c => c.anchor)).toEqual(['EMB']);
    const received = step(held, {
      type: 'receive-creature',
      creature: { id: 'traded/1', species: 'mossling', nick: 'Fern', hp: 31, xp: 20, charges: { 'leaf-cut': 5, 'root-bind': 3, photosynth: 1 }, guard: false, statuses: [], anchor: 'MOSS' },
    });
    expect(received.creatures.map(c => c.anchor)).toEqual(['EMB', 'MOSS']);
    // The starter traded away: it leaves with its object.
    const traded = step(received, { type: 'holdings', coins: 47, held: ['MOSS'], inFlight: [] });
    expect(traded.creatures.map(c => c.anchor)).toEqual(['MOSS']);
    expect(() => step(traded, { type: 'holdings', coins: 47, held: [], inFlight: [] })).toThrow('invalid-command');
  });
  it('keeps the lead on its creature when holdings remove another, and hands it on when the lead leaves', () => {
    let s = step(dsm(), { type: 'bind-creature', creatureId: 'wallet/starter', anchor: 'EMB' });
    s = step(s, { type: 'receive-creature', creature: { ...newCreature('traded/1', 'mossling'), anchor: 'MOSS' } });
    s = step(s, { type: 'receive-creature', creature: { ...newCreature('traded/2', 'tidefin'), anchor: 'TIDE' } });
    s = step(s, { type: 'set-lead', creatureId: 'traded/2' });
    expect(s.lead).toBe(2);
    // The mossling leaves: the tidefin still leads, now at index 1.
    s = step(s, { type: 'holdings', coins: 0, held: ['EMB', 'TIDE'], inFlight: [] });
    expect(s.creatures[s.lead].id).toBe('traded/2');
    // The lead itself leaves: the first creature kept leads.
    s = step(s, { type: 'holdings', coins: 0, held: ['EMB'], inFlight: [] });
    expect(s.lead).toBe(0);
    expect(s.creatures[s.lead].id).toBe('wallet/starter');
  });
});


describe('shop items and trainer battles', () => {
  const alice = initialState('alice');
  it('grants a quantity for one payment, sells the Map once, and never grants a payment twice', () => {
    const four = step(alice, { type: 'grant-item', item: 'capsule', qty: 4, fact: 'tx-q' });
    expect(four.inventory.capsules).toBe(alice.inventory.capsules + 4);
    expect(() => step(four, { type: 'grant-item', item: 'tonic', fact: 'tx-q' })).toThrow('choice-consumed');
    expect(() => step(alice, { type: 'grant-item', item: 'capsule', qty: SHOP_QTY_MAX + 1, fact: 'tx-big' })).toThrow('invalid-command');
    const map = step(alice, { type: 'grant-item', item: 'map', fact: 'tx-map' });
    expect(map.inventory.map).toBe(1);
    expect(() => step(map, { type: 'grant-item', item: 'map', fact: 'tx-map-2' })).toThrow('sold-out');
    expect(() => step(alice, { type: 'grant-item', item: 'map', qty: 2, fact: 'tx-maps' })).toThrow('sold-out');
  });
  it('sells a creature that is neither the lead nor the last, once per transfer', () => {
    expect(() => step(alice, { type: 'sell', creatureId: 'alice/starter', fact: 'tx-s0' })).toThrow('not-for-sale');
    const burr = { ...newCreature('alice/burr', 'mossling'), anchor: 'BURRANCHOR' };
    const two = step(alice, { type: 'receive-creature', creature: burr });
    expect(() => step(two, { type: 'sell', creatureId: 'alice/starter', fact: 'tx-s1' })).toThrow('not-for-sale');
    const led = step(two, { type: 'set-lead', creatureId: 'alice/burr' });
    const sold = step(led, { type: 'sell', creatureId: 'alice/starter', fact: 'tx-s2' });
    expect(sold.creatures.map(c => c.id)).toEqual(['alice/burr']);
    expect(sold.creatures[sold.lead].id).toBe('alice/burr');
    expect(() => step(step(two, { type: 'sell', creatureId: 'alice/burr', fact: 'tx-s3' }), { type: 'receive-creature', creature: { ...burr, id: 'alice/burr2', anchor: 'OTHER' } })).not.toThrow();
    expect(() => step(step(step(two, { type: 'receive-creature', creature: { ...burr, id: 'alice/burr2', anchor: 'OTHER' } }), { type: 'sell', creatureId: 'alice/burr', fact: 'tx-s4' }), { type: 'sell', creatureId: 'alice/burr2', fact: 'tx-s4' })).toThrow('choice-consumed');
    expect(salePrice(burr)).toBe(8);
  });
  it('grants a paid item once per accepted payment and never credits coins itself', () => {
    const s = step(alice, { type: 'grant-item', item: 'poultice', fact: 'tx-1' });
    expect(s.inventory.poultice).toBe(2);
    expect(s.coins).toBe(alice.coins);
    expect(() => step(s, { type: 'grant-item', item: 'poultice', fact: 'tx-1' })).toThrow('choice-consumed');
    expect(step(s, { type: 'grant-item', item: 'tonic', fact: 'tx-2' }).inventory.tonic).toBe(1);
  });
  it('uses a poultice and a tonic on one creature, outside battle only', () => {
    const hurt = strike(encounter()); // own 36 HP
    expect(() => step(hurt, { type: 'use-item', item: 'poultice', creatureId: 'alice/starter' })).toThrow('battle-active');
    const out = step(hurt, { type: 'escape' });
    const healed = step(out, { type: 'use-item', item: 'poultice', creatureId: 'alice/starter' });
    expect(healed.creatures[0].hp).toBe(40);
    expect(healed.inventory.poultice).toBe(0);
    expect(() => step(healed, { type: 'use-item', item: 'poultice', creatureId: 'alice/starter' })).toThrow('no-item');
    const spent = step(step(alice, { type: 'grant-item', item: 'tonic', fact: 'tx-3' }), { type: 'encounter' });
    const after = step(step(flare(spent), { type: 'escape' }), { type: 'use-item', item: 'tonic', creatureId: 'alice/starter' });
    expect(after.creatures[0].charges.flare).toBe(5);
    expect(after.inventory.tonic).toBe(0);
  });
  it('fights a trainer team of three at its level, one at a time; knocking out all three wins, then it reopens after a rest', () => {
    // A team of three strong creatures, chosen in order.
    let strong = structuredClone(alice);
    strong.creatures = [newCreature('alice/starter', 'embercub', undefined, 8), newCreature('alice/volt', 'voltusk', undefined, 8), newCreature('alice/moss', 'mossling', undefined, 8)];
    strong = step(strong, { type: 'set-team', creatureIds: ['alice/starter', 'alice/volt', 'alice/moss'] });
    const b = step(strong, { type: 'challenge', trainer: 'kade' });
    expect(b.battle).toMatchObject({ source: 'trainer', trainer: 'kade', format: 'team3', roster: ['alice/starter', 'alice/volt', 'alice/moss'], ko: { own: 0, foe: 0 } });
    expect(b.battle!.bench.map(c => c.species)).toEqual(['voltusk', 'leon']);
    const foe = b.battle!.wild;
    expect(foe).toMatchObject({ species: 'mossling', nick: 'Burr' });
    expect(level(foe)).toBe(TRAINER_LEVEL.kade);
    expect(foe.hp).toBe(maxHp(foe));
    expect(() => step(b, { type: 'capture' })).toThrow('not-wild');
    // Burr answers the first turn with Root Bind (its status move on even turns).
    const t1 = flare(b);
    expect(t1.battle!.log[1]).toMatchObject({ move: 'root-bind', status: 'root' });
    expect(t1.creatures[0].statuses.some(x => x.id === 'root')).toBe(true);
    // Rooted: the next turn passes without the move, its charge is kept, and the root wears off.
    const t2 = flare(t1);
    expect(t2.battle!.log[0]).toMatchObject({ move: 'flare', skipped: true, dmg: 0 });
    expect(t2.creatures[0].charges.flare).toBe(t1.creatures[0].charges.flare);
    expect(t2.creatures[0].statuses.some(x => x.id === 'root')).toBe(false);
    // Fight on: the first knockout sends in the trainer's next creature.
    let won = t2, events: string[] = [];
    for (let turn = 0; won.battle!.outcome === 'active' && turn < 20; turn++) {
      won = step(won, { type: 'move', move: 'strike' });
      events.push(...won.battle!.events.map(e => `${e.side}:${e.kind}`));
    }
    expect(won.battle!.outcome).toBe('victory');
    expect(won.battle!.ko.foe).toBe(3);
    expect(won.battle!.bench).toEqual([]);
    expect(events).toEqual(expect.arrayContaining(['foe:faint', 'foe:switch']));
    expect(won.trainersBeaten).toEqual(['kade']);
    expect(won.coins).toBe(alice.coins);
    expect(() => step(won, { type: 'challenge', trainer: 'kade' })).toThrow('already-beaten');
    const rested = step(won, { type: 'heal' });
    expect(rested.trainersBeaten).toEqual([]);
    expect(step(rested, { type: 'challenge', trainer: 'kade' }).battle!.id).toBe('alice/trainer/kade/1');
    expect(() => step(alice, { type: 'challenge', trainer: 'nobody' })).toThrow('unknown-trainer');
  });
  it('sends in the next creature when one faints, and loses when none stand', () => {
    let pair = structuredClone(alice);
    pair.creatures = [newCreature('alice/starter', 'embercub'), newCreature('alice/second', 'mossling')];
    let s = step(pair, { type: 'challenge', trainer: 'nessa' });
    let switched: string | undefined;
    for (let turn = 0; s.battle!.outcome === 'active' && turn < 30; turn++) {
      s = step(s, { type: 'move', move: 'strike' });
      if (s.battle!.events.some(e => e.side === 'own' && e.kind === 'switch')) switched = s.battle!.creatureId;
    }
    expect(switched).toBe('alice/second');
    expect(s.battle!.outcome).toBe('defeat');
    expect(s.battle!.ko.own).toBe(2);
    // A lone creature loses as soon as it faints.
    let lone = step(alice, { type: 'challenge', trainer: 'nessa' });
    for (let turn = 0; lone.battle!.outcome === 'active' && turn < 30; turn++) lone = step(lone, { type: 'move', move: 'strike' });
    expect(lone.battle!.outcome).toBe('defeat');
    expect(lone.battle!.ko.own).toBe(1);
  });
  it('keeps a chosen team of up to three distinct creatures, and not during a battle', () => {
    expect(() => step(alice, { type: 'set-team', creatureIds: ['nobody'] })).toThrow('invalid-command');
    expect(() => step(alice, { type: 'set-team', creatureIds: ['alice/starter', 'alice/starter'] })).toThrow('invalid-command');
    expect(step(alice, { type: 'set-team', creatureIds: ['alice/starter'] }).team).toEqual(['alice/starter']);
    expect(() => step(step(alice, { type: 'encounter' }), { type: 'set-team', creatureIds: [] })).toThrow('battle-active');
  });
});

describe('growth (flat 20 XP per level, cap 10)', () => {
  it('scales XP by opponent level with a floor of 4', () => {
    expect(xpGain(10, 1, 1)).toBe(10); expect(xpGain(10, 3, 1)).toBe(14); expect(xpGain(10, 1, 5)).toBe(4);
  });
  it('raises max HP and damage per level and adds a charge slot at Lv 4 and Lv 7', () => {
    const c = newCreature('x', 'embercub');
    expect(maxHp(c)).toBe(40);
    grantXp(c, 60); // Lv 4
    expect(level(c)).toBe(4); expect(maxHp(c)).toBe(52); expect(c.charges.flare).toBe(6); expect(maxCharges(SPECIES.embercub.moves[1], c)).toBe(6);
    grantXp(c, 1000);
    expect(level(c)).toBe(10); expect(maxHp(c)).toBe(76); expect(c.charges.flare).toBe(7);
  });
  it('a level-up tops up current HP by the gained max and records growth on the battle', () => {
    let s = initialState('alice'); s.creatures[0].xp = 15; s.creatures[0].hp = 30;
    const t1 = flare(step(s, { type: 'encounter' }));
    const won = flare(t1);
    expect(won.battle!.outcome).toBe('victory');
    expect(won.battle!.growth).toEqual({ gain: 10, from: 1, to: 2 });
    // The wild faints before it answers the second turn, so the only change is the top-up.
    expect(won.creatures[0].hp).toBe(t1.creatures[0].hp + HP_PER_LEVEL);
    expect(maxHp(won.creatures[0])).toBe(44);
  });
  it('wild level rises with the encounter index and a higher-level attacker hits harder', () => {
    expect(wildLevel(0)).toBe(1); expect(wildLevel(3)).toBe(2); expect(wildLevel(6)).toBe(2); expect(wildLevel(6, 2)).toBe(3); expect(wildLevel(30, 9)).toBe(6);
    let s = initialState('alice'); s.creatures[0].xp = 40; // Lv 3: +2 damage
    const after = strike(step(s, { type: 'encounter' }));
    expect(after.battle!.log[0].dmg).toBe(10);
  });
});

describe('items in battle cost the turn', () => {
  const step = (s: GameState, c: Command) => transition(s, s.revision, `command/${s.revision}`, c);
  it('heals the creature in front, spends the item, and the wild creature still acts', () => {
    let s = initialState('ivy');
    s.creatures[0].hp = 20;
    s = step(s, { type: 'encounter' });
    const hpBefore = s.creatures[0].hp;
    const next = step(s, { type: 'battle-item', item: 'poultice', creatureId: 'ivy/starter' });
    expect(next.inventory.poultice).toBe(0);
    expect(next.battle!.log.map(e => [e.actor, e.move])).toEqual([['own', 'item:poultice'], ['wild', next.battle!.log[1].move]]);
    expect(next.battle!.turn).toBe(1);
    expect(next.creatures[0].hp).toBe(hpBefore + 15 - next.battle!.log[1].dmg - next.battle!.log[1].burn);
    expect(() => step(next, { type: 'battle-item', item: 'poultice', creatureId: 'ivy/starter' })).toThrow('no-item');
  });
  it('can heal a benched teammate in a team battle, but not a fainted or unknown one', () => {
    let s = initialState('ivy');
    s.creatures = [newCreature('ivy/starter', 'embercub', undefined, 8), newCreature('ivy/two', 'mossling', undefined, 8), newCreature('ivy/three', 'tidefin', undefined, 8)];
    s.creatures[1].hp = 10; s.creatures[2].hp = 0; s.inventory.poultice = 3;
    s = step(s, { type: 'set-team', creatureIds: ['ivy/starter', 'ivy/two', 'ivy/three'] });
    s.creatures[2].hp = 1; // standing when the battle starts, so it is fielded
    s = step(s, { type: 'challenge', trainer: 'kade' });
    const healed = step(s, { type: 'battle-item', item: 'poultice', creatureId: 'ivy/two' });
    expect(healed.creatures.find(c => c.id === 'ivy/two')!.hp).toBe(25);
    const down = structuredClone(healed); down.creatures.find(c => c.id === 'ivy/three')!.hp = 0;
    expect(() => step(down, { type: 'battle-item', item: 'poultice', creatureId: 'ivy/three' })).toThrow('unknown-creature');
    expect(() => step(healed, { type: 'battle-item', item: 'poultice', creatureId: 'nobody' })).toThrow('unknown-creature');
  });
});

describe('trainer look', () => {
  it('starts classic, keeps old saves classic, and changes on request, even mid-battle', async () => {
    const { stateSchema, lookGraphic, lookPortrait } = await import('../src/domain/game');
    const s = initialState('alice');
    expect(s.look).toBe('classic');
    const { look: _, ...old } = s;
    expect(stateSchema.parse(old).look).toBe('classic');
    const next = step(encounter(), { type: 'set-look', look: 'curly' });
    expect(next.look).toBe('curly');
    expect([lookGraphic('classic'), lookGraphic('curly'), lookPortrait('classic'), lookPortrait('bearded')]).toEqual(['hero', 'hero-curly', 'player', 'player-bearded']);
    expect(() => step(s, { type: 'set-look', look: 'wizard' as never })).toThrow();
  });
});
