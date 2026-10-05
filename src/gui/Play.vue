<script setup lang="ts">
import { computed, inject, ref, watch, onUnmounted, onMounted } from 'vue';
import { Direction } from '@rpgjs/common';
import { heldDirection, type MovementControls } from './held-direction';
import { SPECIES, TRAINERS, NICK_MAX, XP_PER_LEVEL, LEVEL_CAP, multiplier, displayName, level, maxHp, maxCharges, damageBonus, type GameState, type Element, type MoveFx } from '../domain/game';
const xpLabel = (c: { xp: number }) => level(c) >= LEVEL_CAP ? 'MAX' : `${c.xp % XP_PER_LEVEL}/${XP_PER_LEVEL} XP`;
const xpPct = (c: { xp: number }) => (level(c) >= LEVEL_CAP ? 1 : (c.xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100 + '%';
const growth = computed(() => { const g = props.state.battle?.growth; return g && g.to > g.from ? g : null; });
const growthSeen = ref('');
import { TRAINER_REWARD, VICTORY_REWARD } from '../integrations/dsm/terms';
import { LOGO_HTML } from './logo';
const props = defineProps<{ state: GameState; mode: string; lastAction?: string; error?: string; notice?: string; nearPond?: boolean; nearNpc?: string; atShop?: boolean; door?: boolean; encounter?: { title: string; line: string } | null; walletCoins?: number | null; trainerBeaten?: boolean }>();
const useItem = ref<'poultice' | 'tonic' | null>(null);
const wallet = computed(() => props.walletCoins ?? props.state.coins);
const usable = (id: string): id is 'poultice' | 'tonic' => id === 'poultice' || id === 'tonic';
const toggleUse = (id: string) => { useItem.value = !usable(id) || useItem.value === id ? null : id; };
const trainer = computed(() => props.state.battle?.trainer ? TRAINERS[props.state.battle.trainer] : null);
const nearTrainer = computed(() => Object.values(TRAINERS).some(t => t.name === props.nearNpc));
const interact = inject<(id: string, action: string, data: unknown) => void>('rpgGuiInteraction')!;
const EL: Record<Element, { label: string; color: string; bg: string }> = {
  fire: { label: 'FIRE', color: '#b5522a', bg: '#7a3b1e' }, grass: { label: 'GRASS', color: '#3f8a4f', bg: '#2f5a2e' },
  water: { label: 'WATER', color: '#2f6f9e', bg: '#244b63' }, electric: { label: 'VOLT', color: '#8a6d1f', bg: '#5a4a14' }, none: { label: 'BASIC', color: '#5b6b60', bg: '#26503c' },
};
const PROJ: Partial<Record<Element, string>> = { fire: 'fire', grass: 'leaf', water: 'water', electric: 'bolt' };
const DESC: Record<string, string> = { strike: '8 damage', flare: '14 fire damage', 'ember-bite': '9 fire · Burn 3×2', 'warm-coat': 'Guard · halve next hit', 'leaf-cut': '12 grass damage', 'root-bind': '6 grass · Root 1 turn', photosynth: 'Heal 12 HP', 'tide-lash': '12 water damage', soak: '7 water · Soak, clears Burn', 'mist-veil': 'Guard · halve next hit', 'volt-charge': '12 volt damage', 'static-tusk': '7 volt · Stun 1 turn', bristle: 'Guard · halve next hit', 'tongue-lash': '12 grass damage', 'sticky-snare': '6 grass · Root 1 turn', camouflage: 'Guard · halve next hit', 'brine-jet': '12 water damage', 'barnacle-bash': '7 water · Soaked 2 turns', 'shell-up': 'Guard · halve next hit', 'chain-whip': '12 water damage', 'lure-flash': '6 water · Stun 1 turn', 'rust-hide': 'Guard · halve next hit' };
/** foot: the empty share of the image below the creature's feet, so phones can stand it on its pad. */
const ART: Record<string, { faces: 'left' | 'right'; scale: number; lift?: number; foot: number }> = { embercub: { faces: 'right', scale: 1.25, foot: 8.1 }, mossling: { faces: 'left', scale: 1.3, foot: 1.4 }, tidefin: { faces: 'left', scale: 1.15, foot: 5.5 }, voltusk: { faces: 'left', scale: 1.2, foot: 5.5 }, leon: { faces: 'right', scale: 1.25, lift: 36, foot: 0 }, brineback: { faces: 'left', scale: 1.25, lift: 24, foot: 0 }, rattlefin: { faces: 'left', scale: 1.3, lift: 20, foot: 0 } };
const pose = (sp: string, side: 'own' | 'wild') => ({ '--flip': flip(sp, side), '--foot': `${ART[sp]?.foot ?? 0}%`, '--lift': `${side === 'wild' ? ART[sp]?.lift ?? 0 : 0}px`, scale: ART[sp]?.scale });
const ITEMS = (s: GameState) => [
  { id: 'rod', name: 'Fishing Rod', qty: s.inventory.rod ? 1 : 0, desc: 'Stand at the pond edge and tap CAST.' },
  { id: 'capsule', name: 'Capture Capsule', qty: s.inventory.capsules, desc: 'Throw at a weakened creature (14 HP or less).' },
  { id: 'poultice', name: 'Herb Poultice', qty: s.inventory.poultice, desc: 'Restores 15 HP to one creature.' },
  { id: 'tonic', name: 'Charge Tonic', qty: s.inventory.tonic, desc: 'Restores every move charge of one creature.' },
  { id: 'map', name: 'Ranger’s Map', qty: s.inventory.map, desc: 'Reveals the path past the meadow.' },
];
/** Attack choreography per move fx; the reducer already resolved the numbers. */
async function playAttack(f: MoveFx | undefined, el: Element, dir: 'own' | 'wild') {
  if (f === 'bite') await set('lunge', { melee: true, fxKind: 'bite' }, 300);
  else if (f === 'tongue') await set('tongue', { fxKind: 'tongue' }, 520);
  else if (f === 'jet') await set('jet', { fxKind: 'jet' }, 520);
  else if (f === 'chain') await set('chain', { fxKind: 'bash' }, 520);
  else if (f === 'lure') await set('lure', { fxKind: 'tusk' }, 800);
  else if (f === 'snare') await set('proj', { fxKind: 'snare' }, 420);
  else if (f === 'bash' || f === 'tusk') await set(dir === 'own' ? 'lunge' : 'counter', { melee: true, fxKind: f }, 300);
  else if (PROJ[el]) await set('proj', { fxKind: 'proj' }, 420);
  else await set('lunge', { melee: false, fxKind: 'melee' }, 300);
}
const flip = (sp: string, side: 'own' | 'wild') => (ART[sp]?.faces ?? 'right') === (side === 'own' ? 'right' : 'left') ? 'none' : 'scaleX(-1)';

const view = ref<GameState>(JSON.parse(JSON.stringify(props.state)));
const busy = ref(props.mode === 'battle'), message = ref(trainer.value && props.state.battle ? `${trainer.value.name} sends out ${displayName(props.state.battle.wild)}!` : 'A wild creature appeared!'), party = ref(false), tab = ref<'creatures' | 'items' | 'wallet'>('creatures');
/** The creature just caught, waiting for the player to name it (or not). */
const naming = ref<string | null>(null), nick = ref('');
const renaming = ref<string | null>(null), newNick = ref('');
const fx = ref<{ kind: string; el: Element; dir: 'own' | 'wild'; dmg?: number; crit?: boolean; melee?: boolean; fxKind?: string }>({ kind: '', el: 'none', dir: 'own' });
const speaker = computed(() => props.state.battle?.trainer && fx.value.dir === 'wild' ? props.state.battle.trainer : 'player');
const own = computed(() => view.value.creatures.find(c => c.id === view.value.battle?.creatureId) ?? view.value.creatures[0]);
const wild = computed(() => view.value.battle?.wild);
const active = computed(() => view.value.battle?.outcome === 'active');
const ownSp = computed(() => SPECIES[own.value.species]);
const wildSp = computed(() => SPECIES[wild.value?.species ?? 'mossling']);
const moves = computed(() => ownSp.value.moves.map(m => {
  const left = m.max ? own.value.charges[m.id] ?? 0 : null;
  const k = m.dmg ? multiplier(m.el, wildSp.value.el) : 1;
  return { ...m, left, disabled: busy.value || (m.max > 0 && left === 0), desc: DESC[m.id] + (k > 1 ? ' · ×1.5' : k < 1 ? ' · ×0.5' : ''), pips: m.max ? Array.from({ length: m.max }, (_, i) => i < (left ?? 0)) : [] };
}));
const matchup = computed(() => { const k = multiplier(ownSp.value.el, wildSp.value.el); return k > 1 ? 'ADVANTAGE' : k < 1 ? 'DISADVANTAGE' : `${EL[ownSp.value.el].label} vs ${EL[wildSp.value.el].label}`; });
const hpColor = (hp: number) => hp > 20 ? 'linear-gradient(#6cc784,#4da96c)' : hp > 10 ? 'linear-gradient(#e8bd4e,#d9a93a)' : 'linear-gradient(#dc6a4e,#c9553a)';
const captureHint = computed(() => !view.value.inventory.capsules ? 'None left' : (wild.value?.hp ?? 0) > 14 ? 'Weaken to 14 HP' : 'Ready to throw');
const canCapture = computed(() => !busy.value && view.value.inventory.capsules > 0 && (wild.value?.hp ?? 99) <= 14);
const statuses = (c: { guard: boolean; statuses: { id: string; turns: number }[] }) => [...(c.guard ? [{ id: 'GUARD', turns: '' }] : []), ...c.statuses.map(x => ({ id: x.id.toUpperCase(), turns: String(x.turns) }))];

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
let pending: ReturnType<typeof setTimeout> | undefined, entrance: ReturnType<typeof setTimeout> | undefined;
onMounted(() => { if (props.mode === 'battle') entrance = setTimeout(() => { busy.value = false; }, 650); });
onUnmounted(() => { clearTimeout(pending); clearTimeout(entrance); });
function action(action: string) {
  if (busy.value) return;
  if (action === 'continue') { interact('creature-battle', 'battle', { action, revision: props.state.revision }); return; }
  busy.value = true;
  interact('creature-battle', 'battle', { action, revision: props.state.revision });
  pending = setTimeout(() => { busy.value = false; message.value = 'No response yet. Try again.'; }, 5000);
}
const engine = inject<{ activeKeyboardControls: () => MovementControls | null }>('rpgEngine');
const movementControls = () => engine?.activeKeyboardControls();
let tapWalk: ReturnType<typeof setTimeout> | undefined;
function step(direction: Direction) { stopWalk(); heldWalk.start(direction); tapWalk = setTimeout(stopWalk, 100); }
const heldWalk = heldDirection(movementControls);
let walkPointer: number | undefined;
function startWalk(direction: Direction, event: PointerEvent) {
  if (event.button !== 0 || event.isPrimary === false || walkPointer !== undefined) return;
  event.preventDefault();
  const pad = (event.currentTarget as HTMLElement).closest('.dpad') as HTMLElement;
  clearTimeout(tapWalk);
  walkPointer = event.pointerId;
  pad.setPointerCapture(event.pointerId);
  heldWalk.start(direction);
}
function dragWalk(event: PointerEvent) {
  if (event.pointerId !== walkPointer) return;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  // Thumb drift within the pad should not cancel a down/up/left/right hold.
  const slop = 12;
  if (event.clientX < box.left - slop || event.clientX > box.right + slop || event.clientY < box.top - slop || event.clientY > box.bottom + slop) stopWalk(event);
}
function stopWalk(event?: Event) {
  if (event && 'pointerId' in event && (event as PointerEvent).pointerId !== walkPointer) return;
  clearTimeout(tapWalk);
  walkPointer = undefined;
  heldWalk.stop();
}
const hideWalk = () => { if (document.hidden) stopWalk(); };
onMounted(() => { window.addEventListener('blur', stopWalk); window.addEventListener('pagehide', stopWalk); document.addEventListener('visibilitychange', hideWalk); });
onUnmounted(() => { stopWalk(); window.removeEventListener('blur', stopWalk); window.removeEventListener('pagehide', stopWalk); document.removeEventListener('visibilitychange', hideWalk); });
watch(() => [props.mode, props.state.battle?.outcome, props.encounter, party.value], () => {
  if (props.mode !== 'field' || props.state.battle?.outcome === 'active' || props.encounter || party.value) stopWalk();
});
function field(action: string, data: Record<string, unknown> = {}) { interact('field-hud', 'field', { action, ...data }); }
function startRename(c: { id: string; nick?: string | null }) { renaming.value = c.id; newNick.value = c.nick ?? ''; }
function confirmRename(creatureId: string) { field('rename', { creatureId, nick: newNick.value.trim().slice(0, NICK_MAX) }); renaming.value = null; }
const capture = () => action('capture');
function confirmName() {
  const nickname = nick.value.trim().slice(0, NICK_MAX);
  if (naming.value && nickname) interact('creature-battle', 'battle', { action: 'rename', creatureId: naming.value, nick: nickname, revision: props.state.revision });
  naming.value = null;
}
const set = async (kind: string, extra: Partial<typeof fx.value> = {}, ms = 0) => { fx.value = { ...fx.value, ...extra, kind }; if (ms) await wait(ms); };

watch(() => [props.state.revision, props.error], async () => {
  // Background DSM work moved the revision; the battle itself did not change, so nothing animates.
  if (props.lastAction === 'sync') { if (!busy.value) view.value = JSON.parse(JSON.stringify(props.state)); return; }
  clearTimeout(pending);
  if (props.mode !== 'battle') { view.value = JSON.parse(JSON.stringify(props.state)); return; }
  if (props.error) { message.value = props.error; busy.value = false; return; }
  busy.value = true;
  const next: GameState = JSON.parse(JSON.stringify(props.state));
  const b = next.battle!, ownName = displayName(own.value), wildName = wild.value ? displayName(wild.value) : wildSp.value.name;
  if (props.lastAction && b.log.length && SPECIES[own.value.species].moves.some(m => m.id === props.lastAction)) {
    const [mine, theirs] = b.log;
    const m = ownSp.value.moves.find(x => x.id === mine.move)!;
    message.value = `${ownName} used ${m.name}!`;
    if (m.max && !mine.skipped) own.value.charges[m.id] = Math.max(0, (own.value.charges[m.id] ?? 0) - 1);
    if (mine.skipped) { message.value = `${ownName} ${own.value.statuses.some(x => x.id === 'stun') ? 'is stunned' : 'is rooted'} and cannot move.`; await wait(700); own.value.statuses = own.value.statuses.filter(x => x.id !== 'root' && x.id !== 'stun'); }
    else if (m.guard) { await set(m.fx === 'camo' ? 'camo' : 'guard', { el: 'none', dir: 'own' }, 700); own.value.guard = true; message.value = `${ownName} braces for the next hit.`; }
    else if (m.heal) { await set('heal', { el: 'none', dir: 'own' }, 700); own.value.hp = Math.min(maxHp(own.value), own.value.hp + m.heal); message.value = `${ownName} recovered ${m.heal} HP.`; }
    else {
      await set('windup', { el: m.el, dir: 'own' }, 380);
      await playAttack(m.fx, m.el, 'own');
      wild.value!.hp = Math.max(0, wild.value!.hp - mine.dmg);
      message.value = mine.mult > 1 ? `Super effective! ${mine.dmg} damage.` : mine.mult < 1 ? `Not very effective… ${mine.dmg} damage.` : `${wildName} took ${mine.dmg} damage.`;
      if (mine.status) { message.value += ` ${wildName} is ${mine.status === 'burn' ? 'burning' : mine.status === 'root' ? 'rooted' : mine.status === 'stun' ? 'stunned' : 'soaked'}.`; wild.value!.statuses = b.wild.statuses; }
      await set('impact', { dmg: mine.dmg, crit: mine.mult > 1 }, mine.mult > 1 ? 650 : 550);
    }
    if (mine.burn) { await set('', {}, 300); wild.value!.hp = Math.max(0, wild.value!.hp - mine.burn); message.value = `${wildName} takes ${mine.burn} burn damage.`; await set('impact', { el: 'fire', dir: 'own', dmg: mine.burn, crit: false }, 550); }
    await set('');
    if (theirs && wild.value!.hp > 0) {
      await wait(350);
      if (theirs.skipped) { message.value = `${wildName} ${wild.value!.statuses.some(x => x.id === 'stun') ? 'is stunned' : 'is rooted'} and cannot move.`; await wait(600); }
      else {
        const wm = wildSp.value.moves.find(x => x.id === theirs.move)!;
        message.value = `${trainer.value ? trainer.value.name + '’s' : 'Wild'} ${wildName} used ${wm.name}!`;
        await set('windup', { el: wm.el, dir: 'wild' }, 380); await playAttack(wm.fx, wm.el, 'wild');
        own.value.hp = Math.max(0, own.value.hp - theirs.dmg); own.value.guard = false;
        message.value = `${ownName} took ${theirs.dmg} damage.${theirs.status ? ` ${ownName} is ${theirs.status === 'burn' ? 'burning' : theirs.status === 'root' ? 'rooted' : theirs.status === 'stun' ? 'stunned' : 'soaked'}.` : ''}`;
        if (theirs.status) own.value.statuses = next.creatures.find(c => c.id === own.value.id)?.statuses ?? own.value.statuses;
        await set('impact', { dmg: theirs.dmg, crit: false }, 550);
      }
      if (theirs.burn) { await set('', {}, 300); own.value.hp = Math.max(0, own.value.hp - theirs.burn); message.value = `${ownName} takes ${theirs.burn} burn damage.`; await set('impact', { el: 'fire', dir: 'wild', dmg: theirs.burn, crit: false }, 550); }
    }
  } else if (props.lastAction === 'capture') {
    message.value = 'Capsule away!'; await set('cap-throw', { dir: 'own' }, 600); await set('cap-open', {}, 650);
    message.value = '…'; await set('cap-shake', {}, 1400); message.value = 'Gotcha!'; await set('cap-catch', {}, 500);
  } else if (props.lastAction === 'escape') { message.value = 'You slipped away safely.'; await set('escape', {}, 650); }
  view.value = next; await set('');
  const outcome = next.battle?.outcome;
  // Named only once it is caught: the capsule is thrown first.
  if (props.lastAction === 'capture' && outcome === 'captured') { naming.value = next.creatures.at(-1)?.id ?? null; nick.value = ''; }
  message.value = outcome === 'captured' ? `${next.creatures.at(-1)?.nick || wildName} joined your collection! +5 XP · swap leads from the BAG` : outcome === 'victory' ? (trainer.value ? `${wildName} is down! +15 XP · ${TRAINER_REWARD} WILD bounty on its way to your wallet` : `${wildName} fainted. Victory! +10 XP · ${VICTORY_REWARD} WILD on its way to your wallet`)
    : outcome === 'defeat' ? `${ownName} fainted. Mira can help at camp.` : outcome === 'escaped' ? (trainer.value ? 'You forfeited. No bounty.' : 'Back to the meadow.') : 'Choose your next move.';
  busy.value = false;
});
</script>

<template>
  <!-- FIELD HUD (over the engine canvas) -->
  <div v-if="mode === 'field'" class="field">
    <header class="win dark"><div><div class="ws-logo hudLogo" v-html="LOGO_HTML"></div><small>{{ `Meadow camp · wallet ${state.holder.slice(0, 8)}… on DSM` }}</small></div><div class="res"><span title="Capture capsules"><span aria-hidden="true">◉</span> {{ state.inventory.capsules }} <small class="px">Capsules</small></span><span class="gold">✦ {{ wallet }} <small class="px">WILD</small></span><button class="px small" :disabled="state.battle?.outcome === 'active'" @click="field('shop')" title="Bramble’s trading post: buy with WILD from your wallet, or sell a creature">SHOP</button><button class="px small" :disabled="state.battle?.outcome === 'active'" @click="field('market')" title="Swap WILD and ERA through SoFi">MARKET</button><button class="px small" :disabled="state.battle?.outcome === 'active'" @click="party = !party">BAG</button></div></header>
    <aside v-if="party" class="win cream party"><div class="row between"><span class="h">{{ tab === 'creatures' ? 'Your creatures' : tab === 'items' ? 'Your bag' : 'Wallet' }}</span><button class="px tiny" @click="party = false">CLOSE</button></div>
      <div class="tabs"><button v-for="t in (['creatures','items','wallet'] as const)" :key="t" class="px tab" :class="{ on: tab === t }" @click="tab = t">{{ t.toUpperCase() }}</button></div>
      <template v-if="tab === 'creatures'">
      <div v-for="(c, i) in state.creatures" :key="c.id" class="prow" :class="{ lead: i === state.lead }"><div class="thumb" :style="{ backgroundImage: `url(creatures/${c.species}.png)` }"></div><div class="grow"><div class="row between"><span class="row"><b>{{ displayName(c) }}</b><small v-if="c.nick" class="muted">{{ SPECIES[c.species].name }}</small></span><span class="row"><span class="chip px" :style="{ background: EL[SPECIES[c.species].el].color }">{{ EL[SPECIES[c.species].el].label }}</span><span v-if="i === state.lead" class="chip px lead">LEAD</span><button v-else class="px tiny swap" @click="field('set-lead', { creatureId: c.id })">SWAP IN</button></span></div>
        <div class="row hp"><span class="px lbl">HP</span><div class="bar"><i :style="{ width: c.hp / maxHp(c) * 100 + '%', background: hpColor(c.hp) }"></i></div><small>{{ c.hp }}/{{ maxHp(c) }}</small></div>
        <div class="row hp xp"><span class="px lbl gold">LV {{ level(c) }}</span><div class="bar"><i class="gold" :style="{ width: xpPct(c) }"></i></div><small>{{ xpLabel(c) }}</small></div>
        <small class="muted">DMG +{{ damageBonus(c) }} · <span v-for="m in SPECIES[c.species].moves.filter(m => m.max)" :key="m.id">{{ m.name }} {{ c.charges[m.id] ?? 0 }}/{{ maxCharges(m, c) }} · </span></small>
        <div v-if="renaming === c.id" class="row rename"><input v-model="newNick" :maxlength="NICK_MAX" :placeholder="SPECIES[c.species].name" autofocus @keydown.enter="confirmRename(c.id)"/><button class="px tiny" @click="confirmRename(c.id)">SAVE</button><button class="px tiny" @click="renaming = null">CANCEL</button></div>
        <div class="row between"><small class="px owner">{{ c.anchor ? `DSM OBJECT ${c.anchor.slice(0, 8)}… IN YOUR WALLET` : 'DELIVERING TO YOUR WALLET…' }}</small><button v-if="renaming !== c.id" class="px tiny" @click="startRename(c)">RENAME</button></div></div></div>
      </template>
      <template v-else-if="tab === 'items'">
      <div v-for="it in ITEMS(state)" :key="it.id" class="prow" :class="{ dim: !it.qty }"><div class="thumb icon" :style="{ backgroundImage: `url(shop/icon-${it.id}.png)` }"></div><div class="grow"><div class="row between"><b>{{ it.name }}</b><span class="row"><span class="px">×{{ it.qty }}</span><button v-if="usable(it.id) && it.qty" class="px tiny swap" @click="toggleUse(it.id)">{{ useItem === it.id ? 'CANCEL' : 'USE' }}</button></span></div><small class="muted">{{ it.desc }}</small>
        <div v-if="useItem === it.id" class="useOn"><small class="px lbl">USE ON</small><button v-for="c in state.creatures" :key="c.id" class="px tiny swap" :disabled="it.id === 'poultice' ? c.hp >= maxHp(c) : false" @click="field('use-item', { item: it.id, creatureId: c.id }); useItem = null">{{ displayName(c) }} · {{ c.hp }}/{{ maxHp(c) }}</button></div></div></div>
      <div class="row between coins"><span>Wild Coin</span><span class="gold">✦ {{ wallet }} WILD</span></div>
      <button class="px tiny" @click="field('shop'); party = false">VISIT BRAMBLE’S TRADING POST</button>
      </template>
      <template v-else>
      <div class="walletOn">
        <section class="wallet-connection">
          <div class="wallet-status"><i class="dot" aria-hidden="true"></i><b class="px">CONNECTED · DSM</b></div>
          <small class="px lbl">WALLET ID</small>
          <code class="wallet-id">{{ state.holder }}</code>
        </section>
        <div class="wallet-grid">
          <section class="wallet-stat"><small class="px lbl">WILD BALANCE</small><b class="wallet-value">✦ {{ wallet }}</b></section>
          <section class="wallet-stat"><small class="px lbl">CREATURE OBJECTS</small><b class="wallet-value">{{ state.creatures.filter(c => c.anchor).length }} / {{ state.creatures.length }}</b></section>
        </div>
        <p class="wallet-note">Your coins and creatures live in your DSM wallet. These are its verified holdings.</p>
        <div class="wallet-grid">
          <section class="wallet-stat"><small class="px lbl">GAME REVISION</small><b class="wallet-value">{{ state.revision }}</b></section>
          <section class="wallet-stat"><small class="px lbl">LAST COMMAND</small><code class="wallet-id">{{ state.commandIds.at(-1)?.split('/').pop() ?? '—' }}</code></section>
        </div>
        <section class="wallet-stat">
          <small class="px lbl">CONSUMED OPPORTUNITIES</small>
          <ul v-if="state.consumed.length" class="wallet-records"><li v-for="k in state.consumed.slice(-4).reverse()" :key="k"><code>{{ k }}</code></li></ul>
          <span v-else class="wallet-note">No opportunities consumed yet.</span>
        </section>
      </div>
      </template>
    </aside>
    <div v-if="notice" class="win dark notice">{{ notice }}</div>
    <button v-if="encounter" class="tapCard" @click="field('fight')"><span class="tapBox"><span class="px t">{{ encounter.title }}</span><span class="l">{{ encounter.line }}</span><span class="px tap">TAP TO FIGHT ▶</span></span></button>
    <button v-else-if="door" class="tapCard" @click="field('enter-shop')"><span class="tapBox"><span class="px t">TRADING POST</span><span class="l">Bramble’s door creaks open.</span><span class="px tap">TAP TO ENTER ▶</span></span></button>
    <nav v-if="state.battle?.outcome !== 'active'" class="controls" aria-label="Movement">
      <div class="dpad" @pointermove="dragWalk" @pointerup="stopWalk" @pointercancel="stopWalk" @lostpointercapture="stopWalk"><i class="v"></i><i class="h"></i><button aria-label="Walk up" class="up" @pointerdown="startWalk(Direction.Up, $event)" @click="$event.detail === 0 && step(Direction.Up)">▲</button><button aria-label="Walk left" class="left" @pointerdown="startWalk(Direction.Left, $event)" @click="$event.detail === 0 && step(Direction.Left)">◀</button><button aria-label="Walk right" class="right" @pointerdown="startWalk(Direction.Right, $event)" @click="$event.detail === 0 && step(Direction.Right)">▶</button><button aria-label="Walk down" class="down" @pointerdown="startWalk(Direction.Down, $event)" @click="$event.detail === 0 && step(Direction.Down)">▼</button><i class="hub"><i></i></i></div>
      <div class="side"><div v-if="notice || nearNpc || atShop || nearPond" class="hint">{{ notice || (nearTrainer ? (trainerBeaten ? `${nearNpc} is beaten · rest at camp for a rematch` : `${nearNpc} wants a battle · ${TRAINER_REWARD} WILD bounty`) : nearNpc ? (nearNpc === 'Wayfinding sign' ? 'Read the sign' : `Talk to ${nearNpc}`) : atShop ? 'Bramble’s trading post' : nearPond ? 'Cast your line into the pond' : '') }}</div><button class="talk px" :class="{ near: nearNpc && !nearTrainer, fight: nearTrainer, pond: nearPond && !nearNpc }" @click="field(nearTrainer ? 'challenge' : nearPond && !nearNpc ? 'cast' : 'talk')">{{ nearNpc === 'Wayfinding sign' ? 'READ' : nearTrainer ? 'FIGHT' : nearPond && !nearNpc ? 'CAST' : 'TALK' }}</button></div>
    </nav>
  </div>

  <!-- BATTLE -->
  <div v-else class="battle">
    <div class="card win dark">
      <div class="head px"><span>{{ trainer ? `TRAINER BATTLE · ${trainer.name.toUpperCase()}` : 'WILD ENCOUNTER' }}</span><span class="meta"><span>{{ trainer ? trainer.title : view.battle?.source === 'pond' ? 'Pond' : 'Meadow' }}</span><i>·</i><span>Turn {{ (view.battle?.turn || 0) + 1 }}</span></span></div>
      <div class="arena" :class="{ shake: fx.kind === 'impact' }">
        <div class="flash" v-if="fx.kind === 'impact' && fx.crit"></div>
        <img class="sprite wild" :class="{ flinch: fx.kind === 'impact' && fx.dir === 'own', windupR: fx.kind === 'windup' && fx.dir === 'wild', suck: fx.kind === 'cap-open', gone: ['cap-shake','cap-catch'].includes(fx.kind) || view.battle?.outcome === 'victory' || view.battle?.outcome === 'captured', counter: fx.kind === 'counter' }" :style="pose(wild?.species || 'mossling', 'wild')" :src="`creatures/${wild?.species || 'mossling'}.png`" :alt="wildSp.name"/>
        <img class="sprite own" :class="{ flinchL: fx.kind === 'impact' && fx.dir === 'wild', windup: fx.kind === 'windup' && fx.dir === 'own', lunge: fx.kind === 'lunge', run: fx.kind === 'escape', camo: fx.kind === 'camo' }" :style="pose(own.species, 'own')" :src="`creatures/${own.species}.png`" :alt="ownSp.name"/>
        <!-- effects -->
        <template v-if="fx.kind === 'proj' && PROJ[fx.el]"><i v-for="n in 6" :key="n" class="fx proj" :class="[fx.el, fx.dir, { fire: fx.el === 'fire' }]" :style="{ backgroundImage: `url(/fx/${PROJ[fx.el]}.png)`, animationDelay: `${(n-1)*.045}s, 0s`, opacity: n === 1 ? 1 : .6 - n * .08, scale: n === 1 ? 1 : 1 - n * .12 }"></i></template>
        <template v-if="fx.kind === 'impact'"><i class="fx burst" :class="[fx.dir, fx.el]" :style="{ backgroundImage: fx.el === 'fire' ? 'url(/fx/fireburst.png)' : 'url(/fx/burst.png)' }"></i><i v-for="n in 3" :key="'b'+n" class="fx burst small" :class="[fx.dir, fx.el, 's'+n]" :style="{ backgroundImage: fx.el === 'fire' ? 'url(/fx/fireburst.png)' : 'url(/fx/burst.png)', animationDelay: `${n*.06}s` }"></i><i v-if="fx.melee && fx.el === 'fire'" class="fx bite" :class="fx.dir"></i><b class="dmg px" :class="[fx.dir, { crit: fx.crit }]">{{ fx.crit ? '!' : '' }}-{{ fx.dmg }}</b></template>
        <template v-if="fx.kind === 'tongue'"><i class="fx tongueLine" :class="fx.dir"></i><i class="fx tongueTip" :class="fx.dir" style="background-image:url(/fx/tongue.png)"></i><b class="fx slap px" :class="fx.dir">SLAP!</b></template>
        <template v-if="fx.kind === 'chain'"><i class="fx tongueLine chainLine" :class="fx.dir"></i><i class="fx tongueTip chainTip" :class="fx.dir" style="background-image:url(/fx/chain.png)"></i></template>
        <template v-if="fx.kind === 'lure'"><i class="fx lure" :class="fx.dir" style="background-image:url(/fx/lure.png)"></i><i class="lureFlash" :class="fx.dir"></i></template>
        <template v-if="fx.kind === 'jet'"><i class="fx jetLine" :class="fx.dir"></i><i v-for="n in 6" :key="'j'+n" class="fx drop" :class="fx.dir" :style="{ '--k': (0.3 + n * 0.12), animationDelay: `${.15 + n * .05}s` }"></i></template>
        <template v-if="fx.kind === 'impact' && fx.fxKind === 'snare'"><i class="fx vine" :class="fx.dir" style="background-image:url(/fx/vine.png)"></i></template>
        <template v-if="fx.kind === 'impact' && (fx.fxKind === 'bash' || fx.fxKind === 'jet')"><i class="fx splashHit" :class="fx.dir" :style="{ backgroundImage: fx.fxKind === 'bash' ? 'url(/fx/shell.png)' : 'url(/fx/splash.png)' }"></i><i v-for="n in 3" :key="'w'+n" class="fx splashHit small" :class="[fx.dir, 'k'+n]" style="background-image:url(/fx/splash.png)" :style="{ animationDelay: `${.05 + n*.06}s` }"></i></template>
        <template v-if="fx.kind === 'impact' && fx.fxKind === 'tusk'"><i v-for="n in 3" :key="'s'+n" class="fx spark" :class="[fx.dir, 'k'+n]" style="background-image:url(/fx/spark.png)" :style="{ animationDelay: `${n*.06}s` }"></i></template>
        <template v-if="fx.kind === 'camo'"><i v-for="n in 5" :key="'c'+n" class="fx heal camoLeaf" style="background-image:url(/fx/leaf.png)" :style="{ left: `${22 + n * 4}%`, animationDelay: `0s, ${n*.07}s` }"></i></template>
        <i v-if="fx.kind === 'guard'" class="fx shield"></i>
        <template v-if="fx.kind === 'heal'"><i v-for="n in 5" :key="'h'+n" class="fx heal" :style="{ left: `${22 + n * 4}%`, animationDelay: `0s, ${n*.08}s` }"></i></template>
        <i v-if="fx.kind === 'cap-throw'" class="fx capsule throw"></i>
        <template v-if="fx.kind === 'cap-open'"><i class="fx capsule open"></i><i class="fx beam"></i></template>
        <i v-if="fx.kind === 'cap-shake'" class="fx capsule wobble"></i>
        <template v-if="fx.kind === 'cap-catch'"><i class="fx capsule glow"></i><i class="fx burst own catch" style="background-image:url(/fx/burst.png)"></i></template>
        <!-- status windows -->
        <div class="status win cream wildS"><div class="row between"><b class="name">{{ wild ? displayName(wild) : wildSp.name }}</b><span class="muted">{{ trainer ? `${trainer.name}’s · Lv ${wild ? level(wild) : 1}` : `Wild · Lv ${wild ? level(wild) : 1}` }}</span></div><div class="chips"><span class="chip px" :style="{ background: EL[wildSp.el].color }">{{ EL[wildSp.el].label }}</span><span v-for="st in statuses(wild || { guard: false, statuses: [] })" :key="st.id" class="chip px ink">{{ st.id }} {{ st.turns }}</span></div><div class="row hp"><span class="px lbl">HP</span><div class="bar"><i :style="{ width: (wild ? wild.hp / maxHp(wild) : 0) * 100 + '%', background: hpColor(wild?.hp || 0) }"></i></div><small><b>{{ wild?.hp }}</b><span class="muted">/{{ wild ? maxHp(wild) : 0 }}</span></small></div></div>
        <div class="status win cream ownS"><div class="row between"><b class="name">{{ displayName(own) }}</b><span class="muted">Lv {{ level(own) }} · {{ xpLabel(own) }}</span></div><div class="chips"><span class="chip px" :style="{ background: EL[ownSp.el].color }">{{ EL[ownSp.el].label }}</span><span v-for="st in statuses(own)" :key="st.id" class="chip px ink">{{ st.id }} {{ st.turns }}</span></div><div class="row hp"><span class="px lbl">HP</span><div class="bar"><i :style="{ width: own.hp / maxHp(own) * 100 + '%', background: hpColor(own.hp) }"></i></div><small><b>{{ own.hp }}</b><span class="muted">/{{ maxHp(own) }}</span></small></div></div>
      </div>
      <div class="bottom">
        <div class="msg win dark"><img class="portrait" :src="`portraits/${speaker}.png`" alt=""/><p role="status">{{ message }}</p><small v-if="active" class="px hint">{{ matchup }}</small><span class="cursor">▼</span></div>
        <template v-if="active">
          <div class="moves"><button v-for="m in moves" :key="m.id" class="move" :disabled="m.disabled" :style="{ background: EL[m.el].bg, borderLeftColor: EL[m.el].color }" @click="action(m.id)">
            <div class="row between"><b>{{ m.name }}</b><span class="chip px dim">{{ EL[m.el].label }}</span></div><small>{{ m.desc }}</small>
            <div class="row between"><span class="pips"><i v-for="(f, i) in m.pips" :key="i" :class="{ on: f }"></i></span><small class="px tiny">{{ m.max ? `${m.left}/${m.max}` : '∞' }}</small></div></button></div>
          <div class="row gap"><button v-if="!trainer" class="cmd grow" :disabled="!canCapture" @click="capture()"><b>◉ Capsule ×{{ view.inventory.capsules }}</b><small>{{ captureHint }}</small></button><button class="cmd grow" :disabled="busy" @click="action('escape')"><b>{{ trainer ? 'Forfeit' : 'Run' }}</b><small>{{ trainer ? 'No bounty' : view.battle?.source === 'pond' ? 'To the pond' : 'To the meadow' }}</small></button></div>
        </template>
        <div v-if="growth && growthSeen !== view.battle?.id" class="levelup win cream" @click="growthSeen = view.battle?.id ?? ''">
          <div class="row between"><span class="px lbl gold">✦ LEVEL UP</span><b class="name">Lv {{ growth.from }} <span class="gold">▶</span> Lv {{ growth.to }}</b></div>
          <div class="row gap stats"><span><small class="muted">MAX HP</small><b>{{ 40 + 4 * (growth.from - 1) }} → {{ 40 + 4 * (growth.to - 1) }}</b></span><span><small class="muted">DAMAGE</small><b>+{{ growth.from - 1 }} → +{{ growth.to - 1 }}</b></span></div>
          <small v-if="(growth.to >= 4 && growth.from < 4) || (growth.to >= 7 && growth.from < 7)" class="green">+1 charge on every special move</small>
          <small class="px owner">XP IS CARRIED ON THE CREATURE’S DSM STATE · TAP TO CONTINUE</small>
        </div>
        <button v-else-if="view.battle?.outcome !== 'active' && !naming" class="cmd go" :disabled="busy" @click="action('continue')">Return to exploring ▶</button>
        <div v-if="naming" class="naming win cream"><small class="px lbl">GOTCHA! NAME YOUR {{ wildSp.name.toUpperCase() }}</small><input v-model="nick" :maxlength="NICK_MAX" :placeholder="wildSp.name" autofocus @keydown.enter="confirmName()"/><div class="row gap"><button class="cmd go grow" @click="confirmName()">Save name ▶</button><button class="cmd" @click="naming = null">Skip</button></div></div>
        <div class="ledger px"><span><em>REV {{ view.revision }}</em><em>{{ view.commandIds.at(-1)?.split('/').pop() }}</em><em>{{ view.consumed.at(-1) ?? '—' }}</em></span><span class="res">◉ {{ view.inventory.capsules }} <span class="gold">✦ {{ view.coins }} WILD</span></span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=VT323&display=swap');
*{box-sizing:border-box}
.field,.battle{font-family:'VT323',ui-monospace,monospace;color:#f3f3df}
.px{font-family:'Silkscreen',monospace;font-size:10px;letter-spacing:0}
.win{border-radius:0}.win.dark{background:#1b3a2ef2;box-shadow:0 0 0 2px #0b1a15,0 0 0 4px #9ccf6e,0 0 0 6px #0b1a15}.win.cream{background:#f6efd2;color:#26443a;box-shadow:0 0 0 2px #26443a,0 0 0 4px #e9e0b8,0 0 0 6px #26443a}
button{font:inherit;cursor:pointer;border:0;color:#f3f3df;background:#1f4434;box-shadow:0 0 0 2px #0b1a15,inset 2px 2px 0 #ffffff22,inset -2px -3px 0 #00000055;border-radius:0}button:active:enabled{translate:0 2px;box-shadow:0 0 0 2px #0b1a15,inset 2px 2px 0 #00000055}button:disabled{opacity:.4;cursor:default}
.row{display:flex;align-items:center;gap:8px}.between{justify-content:space-between}.gap{gap:10px}.grow{flex:1}.muted{color:#4c6a5c}.gold{color:#e9d86b}.small{padding:6px 8px}.tiny{font-size:8px;padding:5px 8px}
.chip{padding:3px 6px;color:#f6efd2;border:2px solid #26443a;line-height:1;font-size:9px}.chip.ink{background:#26443a}.chip.dim{background:#0b1a15;border:0;opacity:.85;font-size:8px}
.hp{margin-top:6px}.lbl{font-size:9px;color:#4c6a5c}.bar{flex:1;height:10px;background:#3b3f2e;border:2px solid #26443a}.bar i{display:block;height:100%;transition:width .45s;box-shadow:inset 0 2px 0 #ffffff55}.hp small{font-size:18px;font-variant-numeric:tabular-nums}
/* field */
.field{position:fixed;inset:0;pointer-events:none;font-size:16px}.field header,.field aside,.field nav,.field .notice{pointer-events:auto}
header{position:absolute;top:16px;left:16px;right:16px;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px}header b{font-size:11px}.hudLogo{width:132px;margin-bottom:3px}header small{display:block;font-size:14px;color:#b9cdb6;line-height:1}.res{display:flex;align-items:center;gap:10px;font-size:17px;white-space:nowrap}
.party{position:absolute;left:16px;right:16px;top:90px;max-width:420px;padding:12px;display:grid;gap:10px}.party .h{font-size:22px}.prow{display:flex;align-items:center;gap:10px;padding:8px;background:#ece4c3;box-shadow:0 0 0 2px #26443a}.thumb{width:52px;height:52px;flex:none;background:center/contain no-repeat;image-rendering:pixelated}.prow b{font-size:20px}.prow small.muted{font-size:14px}
.tabs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}.tab{padding:7px 4px;color:#26443a;background:#ece4c3;box-shadow:0 0 0 2px #26443a;font-size:9px}.tab.on{background:#26443a;color:#f6efd2}.prow.lead{background:#f3ecc9}.prow.dim{opacity:.45}.prow.col{display:grid;gap:2px}.chip.lead{background:#e9d86b;color:#26443a}.swap{background:#26503c;padding:2px 6px;font-size:8px}.owner{font-size:7px;color:#6c8a7c;display:block;margin-top:3px}.thumb.icon{width:40px;height:40px}.coins{padding:6px 8px;font-size:16px}.walletOn{display:grid;gap:8px}.dot{width:10px;height:10px;background:#4da96c;box-shadow:0 0 0 2px #26443a;flex:none}
.rename input{font:inherit;font-size:18px;color:#26443a;background:#ece4c3;border:0;box-shadow:0 0 0 2px #26443a;padding:3px 8px;outline:none;flex:1;min-width:0}
.naming{padding:10px 12px;margin:0 6px;display:grid;gap:10px}.naming input{font:inherit;font-size:24px;color:#26443a;background:#ece4c3;border:0;box-shadow:0 0 0 2px #26443a;padding:6px 10px;outline:none;width:100%}
.tapCard{position:absolute;inset:0;z-index:20;display:grid;place-items:center;border:0;padding:0;font:inherit;color:#f3f3df;background:#081c1ad9;cursor:pointer;pointer-events:auto;animation:reveal .35s}.tapBox{text-align:center;display:grid;gap:14px;padding:22px 28px;background:#1b3a2e;box-shadow:0 0 0 2px #0b1a15,0 0 0 4px #9ccf6e,0 0 0 6px #0b1a15}.tapBox .t{font-size:12px;color:#c4ec79}.tapBox .l{font-size:26px;line-height:1.1}.tapBox .tap{font-size:9px;color:#d7e6cf;animation:blink 1s steps(1) infinite}.useOn{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}.talk.fight{background:radial-gradient(circle at 40% 30%,#ffffff40,transparent 60%),#b5522a}
.talk.near{background:radial-gradient(circle at 40% 30%,#ffffff40,transparent 60%),#5a9a3a}.talk.pond{background:radial-gradient(circle at 40% 30%,#ffffff40,transparent 60%),#2f6f9e}
.notice{position:absolute;left:16px;right:16px;bottom:200px;padding:10px 12px;font-size:18px;line-height:1.25}
.controls{position:absolute;left:16px;right:16px;bottom:24px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.dpad{position:relative;width:120px;height:120px;filter:drop-shadow(0 3px 0 #0b1a15)}.dpad::before{content:'';position:absolute;left:-4px;top:-4px;width:128px;height:128px;background:#2b1a10;clip-path:polygon(40px 0,88px 0,88px 40px,128px 40px,128px 88px,88px 88px,88px 128px,40px 128px,40px 88px,0 88px,0 40px,40px 40px)}.dpad::after{content:'';position:absolute;left:-2px;top:-2px;width:124px;height:124px;background:linear-gradient(#c9c9c0,#8f8f85);clip-path:polygon(40px 0,84px 0,84px 40px,124px 40px,124px 84px,84px 84px,84px 124px,40px 124px,40px 84px,0 84px,0 40px,40px 40px);z-index:0}.dpad i.v,.dpad i.h{position:absolute;background:#3e3e3a;z-index:1}.dpad i.v{left:40px;top:0;width:40px;height:120px}.dpad i.h{left:0;top:40px;width:120px;height:40px}.dpad button{position:absolute;z-index:2;font-family:'Silkscreen',monospace;font-size:11px;color:#f6efd2;text-shadow:0 1px 0 #2b1a10;background:linear-gradient(#a8743c,#8a5a2a);box-shadow:inset 0 2px 0 #d9a86a,inset 0 -3px 0 #5a3a1a;display:grid;place-items:center}.dpad button:active{translate:0;background:#7a4e22;box-shadow:inset 0 3px 0 #5a3a1a}.dpad .up{left:42px;top:2px;width:36px;height:38px;border-radius:4px 4px 0 0}.dpad .down{left:42px;top:80px;width:36px;height:38px;border-radius:0 0 4px 4px}.dpad .left{left:2px;top:42px;width:38px;height:36px;border-radius:4px 0 0 4px}.dpad .right{left:80px;top:42px;width:38px;height:36px;border-radius:0 4px 4px 0}.dpad .hub{position:absolute;z-index:2;left:44px;top:44px;width:32px;height:32px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#6a6a64,#3e3e3a);box-shadow:inset 0 2px 0 #2a2a27}.dpad .hub i{display:none}
.side{display:grid;gap:8px;justify-items:end}.hint{font-size:15px;color:#2b1a10;background:#e9dcb4;padding:5px 9px;box-shadow:0 0 0 2px #2b1a10,inset 0 -2px 0 #c9b98a;max-width:200px;text-align:right;line-height:1.15}.talk{width:78px;height:78px;border-radius:50%;font-size:11px;color:#f6efd2;text-shadow:0 1px 0 #2b1a10;background:radial-gradient(circle at 40% 30%,#ffffff40,transparent 60%),#8a5a2a;box-shadow:0 0 0 3px #2b1a10,0 0 0 6px #c9892a,0 0 0 8px #2b1a10,inset 0 4px 0 #ffffff33,inset 0 -5px 0 #00000044,0 3px 0 #0b1a15}.talk:active{translate:0 3px}
/* battle */
.battle{position:fixed;inset:0;display:grid;place-items:center;background:#0e2620;background-image:radial-gradient(#153429 1px,transparent 1px);background-size:8px 8px;pointer-events:auto;font-size:15px;animation:reveal .5s}
.card{width:min(948px,calc(100vw - 24px));background:#142f26;overflow:hidden}
.head{display:flex;justify-content:space-between;align-items:center;background:#1b3a2e;padding:12px 20px;font-size:12px;font-weight:700;border-bottom:4px solid #0b1a15}.meta{display:flex;gap:10px;align-items:center;color:#b9cdb6;font-weight:400}.meta i{opacity:.5;font-style:normal}
.arena{height:min(440px,46vh);position:relative;overflow:hidden;background:url(/tiles/arena-desktop.png) 0 0/100% 100% no-repeat;image-rendering:pixelated;border-bottom:4px solid #0b1a15}
.arena.shake{animation:shake .4s}.flash{position:absolute;inset:0;background:#fff;pointer-events:none;animation:flash .45s forwards}
.sprite{position:absolute;transform:var(--flip);image-rendering:pixelated;filter:drop-shadow(0 9px 8px #28482c55);transform-origin:bottom center;animation:breathe 2s ease-in-out infinite;transition:opacity .3s}.sprite.wild{width:200px;right:90px;top:44px;margin-top:var(--lift)}.sprite.own{width:236px;left:70px;bottom:36px}
.gone{opacity:0!important}.counter{animation:counter .5s!important}.camo{animation:camoFade 1s ease-in-out!important}.flinch{animation:flinch .5s!important}.flinchL{animation:flinchL .5s!important}.windup{animation:windup .38s ease-in-out!important}.windupR{animation:windupR .38s ease-in-out!important}.lunge{animation:lunge .3s!important}.run{animation:run .65s forwards!important}.suck{animation:suckIn .6s ease-in forwards!important}
.status{position:absolute;z-index:2;width:232px;padding:9px 12px 10px}.wildS{left:30px;top:28px}.ownS{right:30px;bottom:28px}.status .name{font-size:30px;line-height:1}.status .muted{font-size:16px;white-space:nowrap}.chips{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;min-height:18px}
/* x0/y0: our creature (left-anchored); x1/y1: the wild one, anchored to the arena's right edge, so measured from it. */
.fx{position:absolute;z-index:6;width:32px;height:32px;background-size:128px 32px;image-rendering:pixelated;pointer-events:none;--x0:172px;--y0:238px;--x1:calc(100% - 206px);--y1:132px;--len:calc(var(--x1) - var(--x0) - 10px);--capY:calc(var(--y1) + 80px)}
.proj{scale:2.6;animation:projOwn .42s cubic-bezier(.3,0,.8,1) forwards,frames4 .22s steps(4) infinite;rotate:-22deg}.proj.wild{animation-name:projWild,frames4;rotate:158deg}.proj.fire{filter:drop-shadow(0 0 6px #ff7a2b)}
.burst{left:var(--x1);top:var(--y1);scale:3.6;animation:frames4 .45s steps(4) forwards,burstPop .5s ease-out forwards}.burst.wild{left:var(--x0);top:var(--y0)}.burst.small{scale:1.8}.burst.s1{margin:-14px 0 0 -30px}.burst.s2{margin:-22px 0 0 26px}.burst.s3{margin:26px 0 0 12px}.burst.fire{scale:4.4}.burst.grass{filter:sepia(1) saturate(2) hue-rotate(60deg)}.burst.water{filter:sepia(1) saturate(2) hue-rotate(170deg)}.burst.catch{top:var(--capY);scale:2}
.bite{left:calc(var(--x1) - 6px);top:calc(var(--y1) - 10px);scale:4.6;background-image:url(/fx/bite.png);animation:frames4 .45s steps(4) forwards,slash .5s ease-out forwards}.bite.wild{left:var(--x0);top:var(--y0);rotate:180deg}
.dmg{position:absolute;z-index:7;left:calc(100% - 208px);top:60px;font-size:26px;color:#fff8d6;text-shadow:2px 2px 0 #0b1a15,-2px 2px 0 #0b1a15,2px -2px 0 #0b1a15,-2px -2px 0 #0b1a15;animation:dmgPop .9s ease-out forwards}.dmg.wild{left:240px;top:160px}.dmg.crit{color:#ffe66b}
.tongueLine{left:calc(var(--x0) + 60px);top:calc(var(--y0) - 20px);width:var(--len);height:14px;border-radius:7px;background:linear-gradient(#f3a6bd,#d9557a 55%,#8a2a48);box-shadow:0 0 0 3px #3a0f1e,inset 0 3px 0 #ffffff55;transform-origin:0 50%;rotate:-10deg;animation:tongueOut .55s cubic-bezier(.2,.9,.3,1) forwards;z-index:5}.chainLine{height:12px;background:url(/fx/chain.png) 0 0/96px 12px repeat-x;box-shadow:0 0 0 3px #2a1a0a;image-rendering:pixelated;animation:tongueOut .55s cubic-bezier(.2,.9,.3,1) forwards,jetFlow .12s linear infinite}.chainTip{scale:2.6;animation:tongueTip .55s cubic-bezier(.2,.9,.3,1) forwards}.slap{left:calc(var(--x1) - 10px);top:calc(var(--y1) - 30px);font-size:14px;color:#fff;text-shadow:2px 2px 0 #3a0f1e,-2px 2px 0 #3a0f1e,2px -2px 0 #3a0f1e,-2px -2px 0 #3a0f1e;animation:dmgPop .5s ease-out .22s forwards;opacity:0;width:auto;height:auto;background:none}.slap.wild{left:calc(var(--x0) + 30px);top:calc(var(--y0) - 40px)}.lure{left:calc(var(--x0) + 50px);top:calc(var(--y0) - 70px);scale:4.8;animation:frames4 .3s steps(4) infinite,lurePulse .9s ease-out forwards;filter:drop-shadow(0 0 10px #2fb5c7)}.lure.wild{left:calc(var(--x1) + 20px);top:calc(var(--y1) - 20px)}.lureFlash{position:absolute;inset:0;z-index:4;background:radial-gradient(circle at 30% 60%,#bfffff 0,#2fb5c799 18%,transparent 55%);animation:flash .9s ease-out forwards;pointer-events:none}.lureFlash.wild{background:radial-gradient(circle at 75% 35%,#bfffff 0,#2fb5c799 18%,transparent 55%)}.splashHit.small{scale:2}.splashHit.k1{margin:-24px 0 0 -24px}.splashHit.k2{margin:-16px 0 0 22px}.splashHit.k3{margin:22px 0 0 6px}.tongueLine.wild{left:var(--x1);top:calc(var(--y1) + 20px);rotate:170deg}.tongueTip{scale:2.2;--tx0:calc(var(--x0) + 46px);--ty0:calc(var(--y0) - 32px);--tx1:var(--x1);--ty1:var(--y1);animation:tongueTip .5s ease-in-out forwards,frames4 .2s steps(4) infinite}.tongueTip.wild{--tx0:var(--x1);--ty0:calc(var(--y1) + 8px);--tx1:calc(var(--x0) + 30px);--ty1:calc(var(--y0) - 10px)}
.jetLine{left:calc(var(--x0) + 50px);top:var(--y0);width:var(--len);height:22px;border-radius:11px;box-shadow:0 0 0 3px #163a5a,inset 0 4px 0 #ffffff66;background:repeating-linear-gradient(90deg,#e9f7ff 0 8px,#5aa9d6 8px 20px,#2f6f9e 20px 24px);transform-origin:0 50%;rotate:-10deg;animation:jetOut .5s ease-out forwards,jetFlow .25s linear infinite;filter:drop-shadow(0 0 4px #5aa9d6);z-index:5}.jetLine.wild{left:var(--x1);top:calc(var(--y1) + 30px);rotate:170deg}.drop{width:4px;height:4px;background:#e9f7ff;left:calc(var(--x0) + 50px + (var(--x1) - var(--x0)) * var(--k));top:calc(var(--y0) + (var(--y1) - var(--y0)) * var(--k));animation:dropFall .5s ease-in forwards}.drop.wild{left:calc(var(--x1) - (var(--x1) - var(--x0)) * var(--k))}
.vine{left:calc(var(--x1) - 10px);top:calc(var(--y1) - 10px);scale:4.4;animation:frames4 .5s steps(4) infinite,snareHold .9s ease-out forwards}.vine.wild{left:var(--x0);top:var(--y0)}.splashHit{left:calc(var(--x1) - 6px);top:var(--y1);scale:3.6;animation:frames4 .45s steps(4) forwards,burstPop .5s ease-out forwards}.splashHit.wild{left:var(--x0);top:var(--y0)}.spark{left:var(--x1);top:var(--y1);scale:3;animation:frames4 .3s steps(4) forwards,burstPop .4s ease-out forwards}.spark.wild{left:var(--x0);top:var(--y0)}.spark.k1{margin:-16px 0 0 -20px}.spark.k2{margin:6px 0 0 0}.spark.k3{margin:-16px 0 0 18px}.camoLeaf{filter:hue-rotate(10deg)}
.shield{left:162px;top:208px;scale:5.7;background-image:url(/fx/shield.png);animation:frames4 .5s steps(4) forwards,shieldUp .9s ease-out forwards}
.heal{top:228px;scale:2.3;background-image:url(/fx/heal.png);animation:frames4 .5s steps(4) infinite,healRise 1s ease-out forwards}
/* Whole-number scales keep the 32px pixel art crisp. */
.capsule{background-image:url(/fx/capsule.png);scale:2;z-index:8;left:var(--x1);top:var(--capY);filter:drop-shadow(0 3px 0 #0b1a1566)}.capsule.throw{animation:capThrow .6s cubic-bezier(.4,0,.6,1) forwards}.capsule.open{background-position:-64px 0}.capsule.wobble{animation:capWobble .45s ease-in-out 3}.capsule.glow{background-position:-96px 0;animation:capGlow .5s ease-out}
.beam{left:var(--x1);top:var(--y1);scale:6.2;background-image:url(/fx/beam.png);animation:frames4 .5s steps(4) infinite,beamSpin 1.2s linear infinite;filter:drop-shadow(0 0 6px #fff)}
.bottom{padding:18px 20px 16px;display:grid;gap:16px}
.msg{display:flex;align-items:center;gap:12px;background:#10261f;padding:10px 14px;min-height:56px;margin:4px 6px 2px}.portrait{width:52px;height:52px;flex:none;object-fit:cover;object-position:50% 8%;image-rendering:pixelated;background:#f6efd2;box-shadow:0 0 0 2px #26443a,0 0 0 4px #9ccf6e}.msg p{font-size:24px;margin:0;flex:1;line-height:1.3}.msg .hint{color:#c4ec79;white-space:nowrap;background:none;box-shadow:none;padding:0;max-width:none}.cursor{color:#c4ec79;font-size:16px;animation:blink 1s steps(1) infinite}
.moves{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:6px}.move{min-width:0;text-align:left;padding:10px 12px;display:grid;grid-template-rows:auto 1fr auto;gap:6px;min-height:112px;border-left:5px solid}.move:hover:enabled{filter:brightness(1.15)}.move>.row{min-width:0;flex-wrap:wrap;gap:4px 8px}.move b{font-size:24px;letter-spacing:.5px;line-height:1;overflow-wrap:anywhere;min-width:0}.move small{font-size:18px;line-height:1.3}.pips{display:flex;gap:3px}.pips i{width:9px;height:9px;border:2px solid #0b1a15;display:block;box-shadow:inset 1px 1px 0 #ffffff55}.pips i.on{background:#edf5e8}
.cmd{padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 6px}.cmd b{font-size:21px}.cmd small{font-size:18px;color:#c7d8c2;white-space:nowrap}.cmd.go{justify-content:center;background:#3f6e2a;padding:14px;font-size:22px}
.ledger{display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:2px dashed #26443a;padding:10px 6px 0;font-size:8px;color:#8fb09a;white-space:nowrap}.ledger em{font-style:normal;padding:3px 6px;background:#0b1a15;margin-right:6px}.ledger em:first-child{color:#c4ec79}.ledger .res{font-family:'VT323',monospace;font-size:18px;color:#d7e6cf}
@keyframes reveal{from{opacity:0;transform:scale(1.07)}}@keyframes breathe{50%{translate:0 -6px}}@keyframes blink{50%{opacity:0}}@keyframes shake{0%,100%{translate:0 0}20%{translate:-6px 2px}40%{translate:6px -2px}60%{translate:-4px 1px}80%{translate:4px -1px}}@keyframes flash{0%,100%{opacity:0}30%{opacity:.9}}
@keyframes windup{0%{translate:0 0}40%{translate:-18px 4px}70%{translate:28px -10px}100%{translate:0 0}}@keyframes windupR{0%{translate:0 0}40%{translate:18px -4px}70%{translate:-28px 10px}100%{translate:0 0}}@keyframes lunge{50%{translate:75px -20px}}@keyframes run{to{translate:-280px 0;opacity:0}}
@keyframes flinch{0%,100%{translate:0 0;filter:none}20%{translate:14px -4px;filter:brightness(3)}40%{translate:-8px 2px;filter:brightness(1)}60%{translate:6px 0;filter:brightness(2.5)}80%{translate:-3px 0;filter:none}}@keyframes flinchL{0%,100%{translate:0 0;filter:none}20%{translate:-14px 4px;filter:brightness(3)}40%{translate:8px -2px;filter:brightness(1)}60%{translate:-6px 0;filter:brightness(2.5)}80%{translate:3px 0;filter:none}}
@keyframes projOwn{0%{left:var(--x0);top:var(--y0);opacity:0}15%{opacity:1}100%{left:var(--x1);top:var(--y1);opacity:1}}@keyframes projWild{0%{left:var(--x1);top:var(--y1);opacity:0}15%{opacity:1}100%{left:var(--x0);top:var(--y0);opacity:1}}@keyframes frames4{to{background-position:-128px 0}}@keyframes burstPop{0%{opacity:1}100%{opacity:0;scale:5}}@keyframes slash{0%{opacity:0}20%{opacity:1}100%{opacity:0;translate:0 10px}}@keyframes dmgPop{0%{opacity:0;translate:0 10px;scale:.6}25%{opacity:1;scale:1.25}50%{scale:1}100%{opacity:0;translate:0 -40px}}
@keyframes counter{50%{translate:-65px 30px}}@keyframes tongueOut{0%{scale:0 .6}35%{scale:1.04 1.1}55%{scale:1 1}100%{scale:0 .6;opacity:.8}}@keyframes tongueTip{0%{left:var(--tx0);top:var(--ty0);scale:1.2}35%,55%{left:var(--tx1);top:var(--ty1)}100%{left:var(--tx0);top:var(--ty0);opacity:0}}@keyframes jetOut{0%{scale:0 .3;opacity:0}25%{scale:1 1.15;opacity:1}80%{scale:1 1;opacity:1}100%{scale:1 .15;opacity:0}}@keyframes lurePulse{0%{opacity:0;scale:.4}30%,60%{opacity:1;scale:1}100%{opacity:0;scale:1.6}}@keyframes jetFlow{to{background-position:22px 0}}@keyframes dropFall{to{translate:0 24px;opacity:0}}@keyframes snareHold{0%{opacity:0;scale:1.3}20%,80%{opacity:1}100%{opacity:0}}@keyframes camoFade{0%,100%{opacity:1}50%{opacity:.15;filter:saturate(.3)}}
@keyframes shieldUp{0%{opacity:0;translate:0 10px}30%,70%{opacity:1;translate:0 0}100%{opacity:0}}@keyframes healRise{0%{opacity:0;translate:0 16px}30%{opacity:1}100%{opacity:0;translate:0 -36px}}
@keyframes capThrow{0%{left:var(--x0);top:var(--y0);rotate:0deg}50%{top:calc((var(--y0) + var(--y1)) / 2 - 90px)}100%{left:var(--x1);top:var(--capY);rotate:720deg}}@keyframes capWobble{0%,100%{rotate:0deg;translate:0 0}15%{rotate:-18deg;translate:-5px 0}45%{rotate:18deg;translate:5px 0}75%{rotate:-12deg;translate:-3px 0}}@keyframes capGlow{50%{filter:brightness(2.2) drop-shadow(0 0 8px #fff)}}@keyframes suckIn{40%{opacity:.9;filter:brightness(2.5) saturate(0)}100%{opacity:0;scale:.05;translate:-30px 60px;filter:brightness(3) saturate(0)}}@keyframes beamSpin{to{rotate:360deg}}
@media(max-width:650px){.arena{height:380px;background-image:url(/tiles/arena-mobile.png)}.sprite.wild{width:140px;right:24px;top:80px}.sprite.own{width:160px;left:6px;bottom:44px}.status{width:176px;padding:7px 10px 8px}.wildS{left:12px;top:12px}.ownS{right:12px;bottom:12px}.status .name{font-size:22px}.tongueTip{scale:1.6}.vine{scale:3}.splashHit{scale:2.6}.spark{scale:2.2}.proj{scale:2}.burst{scale:2.8}.burst.small{scale:1.4}.moves{grid-template-columns:1fr 1fr;gap:10px}.move{min-height:58px}.move b{font-size:20px}.move small{font-size:15px}.msg p{font-size:18px}.bottom{padding:10px 14px}.head{padding:10px 14px}header{top:8px;left:8px;right:8px}}
/* Phones: the drop's layout as designed. Long move text wraps and the ledger clips inside the
   width instead of widening their columns past the screen; the capsule and run buttons put their
   line under their name, whole; the heading leaves room for the DSM button. */
@media(max-width:650px){.bottom{grid-template-columns:minmax(0,1fr)}.moves{grid-template-columns:repeat(2,minmax(0,1fr))}.move{min-width:0}.move small{overflow-wrap:anywhere}.cmd{min-width:0}.cmd.grow:not(.go){flex-direction:column;align-items:flex-start;justify-content:center;gap:2px}.cmd small{white-space:normal;text-align:left}.ledger{overflow:hidden}.ledger>span{min-width:0;overflow:hidden;text-overflow:ellipsis}.battle .head{padding-right:112px;gap:10px}}
@media(max-width:650px){header{flex-wrap:wrap;gap:6px;padding:6px 8px}header>div:first-child{flex:1 1 100%;min-width:0;padding-right:92px}header small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.res{flex:1 1 100%;justify-content:flex-end;gap:6px;font-size:15px}.res .small{padding:5px 6px}.party{top:112px}}
.levelup{display:grid;gap:8px;padding:10px 12px;margin:0 6px;cursor:pointer;box-shadow:0 0 0 2px #26443a,0 0 0 4px #e9d86b,0 0 0 6px #26443a;animation:arrive .25s ease-out}.levelup .stats span{flex:1;display:flex;justify-content:space-between;background:#ece4c3;padding:4px 8px;box-shadow:inset 0 0 0 2px #26443a}.levelup .green{color:#3f6e2a}.row.xp .bar{height:6px}.row.xp .bar i.gold{background:#e9d86b}.lbl.gold{color:#8a6d1f}

/* Keep the field controls usable below the optional, compact DSM activity strip. */
.battle{padding-top:var(--dsm-strip-offset,0px);padding-bottom:8px;box-sizing:border-box}
.battle .card{max-height:calc(100svh - var(--dsm-strip-offset,0px) - 16px);overflow-y:auto;scrollbar-width:thin}
.field header,.field .party{transform:translateY(var(--dsm-strip-offset,0px))}
@media(min-width:651px){.field header{padding-right:88px}}

.dpad,.dpad button{touch-action:none;user-select:none;-webkit-user-select:none}
/* Wallet identifiers must wrap inside their card instead of stretching the bag. */
.party{min-width:0;max-height:calc(100svh - 286px - var(--dsm-strip-offset,0px));overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin}
.walletOn,.walletOn *{min-width:0}
.walletOn{gap:10px;color:#26443a}
.wallet-connection,.wallet-stat{display:grid;gap:7px;padding:10px;background:#ece4c3;box-shadow:inset 0 0 0 1px #b4ba95}
.wallet-status{display:flex;align-items:center;gap:8px;margin-bottom:2px}
.wallet-status .dot{width:7px;height:7px}
.wallet-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.walletOn .lbl{font-size:8px;line-height:1.5;overflow-wrap:anywhere}
.wallet-id,.wallet-records code{font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;word-break:break-word;white-space:normal;color:#385947}
.wallet-value{font-size:23px;line-height:1.1;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.wallet-note{margin:0;font-size:16px;line-height:1.25;color:#4c6a5c}
.wallet-records{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.wallet-records li+li{border-top:1px solid #c6c7a5;padding-top:7px}
@media(max-width:650px){.party{max-height:calc(100svh - 308px - var(--dsm-strip-offset,0px))}}
/* Phones: the battle fills the screen. The arena takes the height the controls leave, and the
   creatures are sized and placed as fractions of it, each beside (never under) its status window:
   the wild one top right of its window, ours bottom left of its own. Effects aim at those spots. */
@media(max-width:650px){
.battle{place-items:stretch;padding-bottom:0}
.battle .card{display:flex;flex-direction:column;width:100%;height:calc(100svh - var(--dsm-strip-offset,0px));max-height:none;box-shadow:none}
.head{flex:none}.bottom{flex:1 1 auto;min-height:0;overflow-y:auto;align-content:start;gap:10px}
.arena{flex:none;height:48svh;min-height:240px;background-size:100% 100%;background-position:0 0}
/* Pads in arena-mobile.png: the wild one centred at 76% / 53%, ours at 23% / 86%. Feet stand on them. */
.sprite{transform:var(--flip) translateY(var(--foot))}
.sprite.wild{width:36%;left:58%;right:auto;top:auto;bottom:47%;margin-top:0}.sprite.own{width:36%;left:5%;bottom:14%}
.status{width:43%;min-width:0;padding:5px 8px 6px}.status .row.between{flex-wrap:wrap;gap:0 6px}.status .name{font-size:20px}.status .muted{font-size:14px}.status .chips{margin-top:3px;min-height:0;gap:4px}.status .chip{font-size:8px;padding:2px 4px}.status .hp{margin-top:4px;gap:5px}.status .lbl{font-size:8px}.status .bar{height:8px}.status .hp small{font-size:15px}.wildS{left:6px;top:6px}.ownS{right:6px;bottom:6px}
.fx{--x0:calc(23% - 16px);--y0:calc(86% - 70px);--x1:calc(76% - 16px);--y1:calc(53% - 66px);--capY:calc(53% - 22px)}
.dmg{left:68%;top:20%;font-size:20px}.dmg.wild{left:16%;top:56%}
.capsule{scale:1}.beam{scale:2}.burst.catch{scale:1}.shield{left:var(--x0);top:var(--y0);scale:3.4}.heal{top:var(--y0)}
.bottom{padding:8px 10px 10px;gap:8px}.msg{min-height:44px;padding:6px 10px;gap:10px;margin:2px 4px 0}.portrait{width:38px;height:38px}.msg p{font-size:17px;line-height:1.15}.msg .hint{font-size:8px}
.moves{gap:8px;padding:4px}.move{min-height:0;padding:6px 8px;gap:3px}.move b{font-size:19px}.move small{font-size:14px;line-height:1.1}.move .tiny{font-size:8px}
.cmd{padding:6px 10px;margin:0 4px}.cmd b{font-size:18px}.cmd small{font-size:14px}.ledger{padding-top:6px}
}
</style>
