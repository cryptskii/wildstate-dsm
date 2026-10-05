<script setup lang="ts">
/**
 * The arena lobby: pick a name, wait for the matchmaker, or challenge a friend by username or DSM
 * ID. Every number here is the server's. Your DSM identity is who you are; your username is how
 * friends find you, and changing it keeps your rating and history.
 */
import { computed, inject, onMounted, onUnmounted, ref } from 'vue';

type Brief = { id: string; name: string; rating: number; online: boolean };
const props = defineProps<{
  now: number;
  me: { id: string; name: string | null; rating: number; wins: number; losses: number; games: number; renameReadyAt: number };
  stakes: number[]; openStakes: number[];
  queued: { stake: number; since: number; window: number } | null;
  incoming: { id: string; from: Brief; stake: number; expiresAt: number }[];
  outgoing: { id: string; to: Brief; stake: number; expiresAt: number }[];
  history: { matchId: string; opponentName: string; stake: number; result: 'win' | 'loss' | 'void'; ratingDelta: number; at: number }[];
  liveMatch: { id: string; stake: number; opponent: Brief } | null;
  found?: Brief | null;
  notice: string;
}>();
const interact = inject<(id: string, event: string, data: unknown) => void>('rpgGuiInteraction')!;
const send = (action: string, data: Record<string, unknown> = {}) => interact('lobby', 'lobby', { action, ...data });

const tab = ref<'play' | 'friends' | 'history'>('play');
const stake = ref(0);
const nameDraft = ref('');
const query = ref('');
const copied = ref(false);
const clock = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { timer = setInterval(() => { clock.value = Date.now(); }, 1000); });
onUnmounted(() => clearInterval(timer));

const waited = computed(() => props.queued ? Math.max(0, Math.round((clock.value - props.queued.since) / 1000)) : 0);
const windowText = computed(() => !props.queued ? '' : Number.isFinite(props.queued.window) ? `±${props.queued.window} rating` : 'anyone at this stake');
const shortId = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`;
const open = (s: number) => props.openStakes.includes(s);
async function copyId() { await navigator.clipboard.writeText(props.me.id); copied.value = true; }
</script>

<template>
  <div class="lobby">
    <section class="panel">
      <header class="top">
        <div class="who">
          <b class="px">{{ me.name ? `@${me.name}` : 'PICK A NAME' }}</b>
          <small>Rating {{ me.rating }} · {{ me.wins }}W {{ me.losses }}L</small>
          <button class="idBtn" :title="me.id" @click="copyId">ID {{ shortId(me.id) }} · {{ copied ? 'copied' : 'copy' }}</button>
        </div>
        <button class="px close" @click="send('close')">✕</button>
      </header>

      <form v-if="!me.name" class="nameForm" @submit.prevent="send('set-name', { name: nameDraft })">
        <input v-model="nameDraft" maxlength="16" placeholder="username" autocapitalize="off" autocomplete="off" />
        <button class="px go">SAVE</button>
        <small>3–16 letters, digits or _. Friends find you by it; your DSM ID stays who you are.</small>
      </form>

      <nav class="tabs">
        <button v-for="t in (['play', 'friends', 'history'] as const)" :key="t" class="px" :class="{ on: tab === t }" @click="tab = t">{{ t === 'play' ? 'MATCHMAKER' : t.toUpperCase() }}<i v-if="t === 'friends' && incoming.length" class="badge">{{ incoming.length }}</i></button>
      </nav>

      <p v-if="notice" class="notice">{{ notice }}</p>

      <div v-if="liveMatch" class="card live">You're in a match vs @{{ liveMatch.opponent.name }}.</div>

      <template v-else-if="tab === 'play'">
        <div class="card">
          <small class="px lbl">STAKE</small>
          <div class="stakes">
            <button v-for="s in stakes" :key="s" class="px stake" :class="{ on: stake === s }" :disabled="!open(s) || !!queued" @click="stake = s">{{ s === 0 ? 'FREE' : `${s} WILD` }}</button>
          </div>
          <small class="hint">Wagers lock each stake in your DSM wallet's escrow; the game only referees. They open with the next wallet update.</small>
        </div>
        <div class="card">
          <template v-if="queued">
            <b class="big">Finding an opponent… {{ waited }}s</b>
            <small>{{ queued.stake === 0 ? 'Free match' : `${queued.stake} WILD` }} · matching {{ windowText }}</small>
            <button class="px cancel" @click="send('leave-queue')">LEAVE QUEUE</button>
          </template>
          <template v-else>
            <b class="big">Ready to battle</b>
            <small>Your team of three (pick it in the BAG) fights at full strength; first to two knockouts wins.</small>
            <button class="px go wide" :disabled="!open(stake)" @click="send('queue', { stake })">FIND A MATCH</button>
          </template>
        </div>
      </template>

      <template v-else-if="tab === 'friends'">
        <div v-for="c in incoming" :key="c.id" class="card challenge">
          <b>@{{ c.from.name }} challenges you</b>
          <small>{{ shortId(c.from.id) }} · rating {{ c.from.rating }} · {{ c.stake === 0 ? 'free match' : `${c.stake} WILD` }}</small>
          <div class="row"><button class="px go" @click="send('accept', { id: c.id })">ACCEPT</button><button class="px cancel" @click="send('decline', { id: c.id })">DECLINE</button></div>
        </div>
        <form class="card" @submit.prevent="send('find', { query })">
          <small class="px lbl">FIND A FRIEND</small>
          <div class="row"><input v-model="query" placeholder="username or DSM ID" autocapitalize="off" autocomplete="off" /><button class="px go">FIND</button></div>
        </form>
        <div v-if="found" class="card">
          <b>@{{ found.name }}</b>
          <small>{{ shortId(found.id) }} · rating {{ found.rating }} · {{ found.online ? 'online' : 'offline' }}</small>
          <div class="row">
            <select v-model.number="stake"><option v-for="s in stakes" :key="s" :value="s" :disabled="!open(s)">{{ s === 0 ? 'Free' : `${s} WILD` }}</option></select>
            <button class="px go" :disabled="!found.online || !open(stake)" @click="send('challenge', { to: found.id, stake })">CHALLENGE</button>
          </div>
        </div>
        <div v-for="c in outgoing" :key="c.id" class="card">
          <small>Waiting for @{{ c.to.name }} to accept…</small>
          <button class="px cancel" @click="send('cancel', { id: c.id })">CANCEL</button>
        </div>
      </template>

      <template v-else>
        <p v-if="!history.length" class="hint">No matches yet.</p>
        <div v-for="h in history" :key="h.matchId" class="card hist" :class="h.result">
          <b>{{ h.result === 'win' ? 'Won' : h.result === 'loss' ? 'Lost' : 'Void' }} vs @{{ h.opponentName }}</b>
          <small>{{ h.stake === 0 ? 'Free' : `${h.stake} WILD` }} · rating {{ h.ratingDelta >= 0 ? '+' : '' }}{{ h.ratingDelta }}</small>
        </div>
      </template>
      <p class="fine">Matches run on the game server. Your rating and history belong to your DSM identity.</p>
    </section>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=VT323&display=swap');
.lobby{position:fixed;inset:0;z-index:60;pointer-events:auto;overflow-y:auto;background:#10251b url(/tiles/matchmaking-lobby-pixel-v3.png) center top/cover no-repeat;image-rendering:pixelated;color:#f6efd2;font-family:'VT323',ui-monospace,monospace;font-size:18px}
.px{font-family:'Silkscreen',monospace;letter-spacing:0}
.panel{margin:32vh auto 24px;width:min(440px,calc(100vw - 24px));display:grid;gap:10px}
button{font:inherit;cursor:pointer;border:0;color:#f3f3df;background:#1f4434;box-shadow:0 0 0 2px #0b1a15,inset 2px 2px 0 #ffffff22,inset -2px -3px 0 #00000055}
button:disabled{opacity:.4;cursor:default}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:10px 12px;background:#1b3a2ef2;box-shadow:0 0 0 2px #0b1a15,0 0 0 4px #9ccf6e,0 0 0 6px #0b1a15}
.who{display:grid;gap:2px}.who b{font-size:13px;color:#c4ec79}.who small{color:#cfe3cb}
.idBtn{justify-self:start;margin-top:4px;padding:3px 8px;font-size:15px;background:#10261f}
.close{padding:6px 10px;font-size:11px}
.nameForm{display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px;background:#10261fef;box-shadow:0 0 0 2px #0b1a15}.nameForm small{grid-column:1/-1;color:#cfe3cb;font-size:15px}
input,select{font:inherit;font-size:19px;color:#26443a;background:#f6efd2;border:0;box-shadow:0 0 0 2px #26443a;padding:6px 10px;min-width:0}
.tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.tabs button{position:relative;padding:9px 4px;font-size:9px;background:#1b3a2e}.tabs button.on{background:#e9d86b;color:#26443a}
.badge{position:absolute;top:-6px;right:-4px;background:#dc6a4e;color:#fff;font-style:normal;font-size:9px;padding:2px 6px;border-radius:9px}
.card{display:grid;gap:6px;padding:12px;background:#10261fef;box-shadow:0 0 0 2px #0b1a15,0 0 0 4px #26443a}
.card small{color:#cfe3cb;font-size:16px}.lbl{font-size:9px;color:#c4ec79}
.big{font-size:22px}
.stakes{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.stake{padding:8px 2px;font-size:9px}.stake.on{background:#e9d86b;color:#26443a}
.hint{color:#b9cdb6;font-size:15px;margin:0}
.go{background:#3f6e2a;padding:8px 12px;font-size:10px}.go.wide{padding:12px;font-size:11px}
.cancel{background:#7a3b1e;padding:8px 12px;font-size:10px;justify-self:start}
.row{display:flex;gap:8px;align-items:center}.row input{flex:1}
.notice{margin:0;padding:8px 10px;background:#e9dcb4;color:#2b1a10;box-shadow:0 0 0 2px #2b1a10}
.live{text-align:center}
.hist.win b{color:#c4ec79}.hist.loss b{color:#f0a58e}
.fine{margin:4px 0 0;text-align:center;color:#d7e6cf;font-size:14px;text-shadow:0 1px 0 #000}
</style>
