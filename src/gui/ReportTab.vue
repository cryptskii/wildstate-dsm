<script setup lang="ts">
/**
 * The BAG's REPORT tab: a beta tester files a game bug, or the week's game missions, as a GitHub
 * issue on the game's repository, with the game's details attached. The wallet's half of their
 * week is filed from the DSM wallet; this tab says so (src/domain/reports.ts).
 */
import { computed, inject, onMounted, reactive, ref, watch } from 'vue';
import { PROTOCOL } from '../protocol';
import type { GameState } from '../domain/game';
import {
  BUG_CHECKS, BUG_TEMPLATE, HOW_OFTEN, MISSION_CHECKS, MISSIONS_TEMPLATE, RESULT_LABEL, SPLIT_NOTE,
  bugBody, bugTitle, issueUrl, missionsBody, missionsTitle,
  type GameDetails, type HowOften, type MissionEntry, type MissionResult, type ReportList,
} from '../domain/reports';
import { copyText } from './clipboard';

const props = defineProps<{ state: GameState; reportList?: ReportList | null }>();
const interact = inject<(id: string, event: string, data: unknown) => void>('rpgGuiInteraction')!;

const kind = ref<'bug' | 'missions'>('bug');
const flash = ref('');
let flashTimer: ReturnType<typeof setTimeout> | undefined;
function say(text: string) { flash.value = text; clearTimeout(flashTimer); flashTimer = setTimeout(() => { flash.value = ''; }, 2500); }

/** The phone and Android version, as the WebView's user agent names them. */
function device(): string {
  const m = navigator.userAgent.match(/Android ([^;)]+);\s*([^;)]+?)(?:\sBuild|\))/);
  return m ? `${m[2].trim()} · Android ${m[1].trim()}` : navigator.userAgent.slice(0, 120);
}
function details(): GameDetails {
  const b = props.state.battle;
  return {
    version: __WILDSTATE_VERSION__,
    protocol: PROTOCOL,
    server: document.querySelector<HTMLMetaElement>('meta[name="wildstate-game-host"]')?.content || location.host,
    wallet: props.state.holder,
    screen: 'Field · BAG',
    battle: b ? `last battle ${b.id} · turn ${b.turn + 1} · ${b.outcome}` : null,
    device: device(),
    at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- a game bug
const bug = reactive({ summary: '', checks: [] as string[], happened: '', steps: '', expected: '', often: 'every-time' as HowOften });
const bugReady = computed(() => bug.summary.trim().length > 0 && bug.happened.trim().length > 0);
const bugText = () => bugBody(bug, details());

// ---------------------------------------------------------------- the week's game missions
const list = ref<ReportList | null>(props.reportList ?? null);
watch(() => props.reportList, (next) => { if (next) list.value = next; });
const entries = ref<MissionEntry[]>([]);
const overall = ref('');
const open = ref<string | null>(null);
/** A draft is kept on this phone per week, so a week's report can be filled in as the week goes. */
const draftKey = computed(() => `wildstate-missions-${list.value?.week ?? 'starter'}`);
watch(list, (l) => {
  if (!l) return;
  let saved: { entries?: { id: string; result: MissionResult; checks: string[]; comment: string; bugs: string }[]; overall?: string } = {};
  try { saved = JSON.parse(localStorage.getItem(draftKey.value) ?? '{}'); } catch { saved = {}; }
  entries.value = l.missions.map((mission) => {
    const s = saved.entries?.find((e) => e.id === mission.id);
    return { mission, result: s?.result ?? 'not-tried', checks: s?.checks ?? [], comment: s?.comment ?? '', bugs: s?.bugs ?? '' };
  });
  overall.value = saved.overall ?? '';
}, { immediate: true });
watch([entries, overall], () => {
  if (!list.value) return;
  const draft = { entries: entries.value.map((e) => ({ id: e.mission.id, result: e.result, checks: e.checks, comment: e.comment, bugs: e.bugs })), overall: overall.value };
  try { localStorage.setItem(draftKey.value, JSON.stringify(draft)); } catch { /* a phone that keeps nothing still files the report */ }
}, { deep: true });
const missionsText = () => missionsBody({ week: list.value?.week ?? null, title: list.value?.title ?? '', entries: entries.value, overall: overall.value }, details());
const missionsTitleText = () => missionsTitle({ week: list.value?.week ?? null, title: list.value?.title ?? '', entries: entries.value, overall: overall.value });
onMounted(() => interact('field-hud', 'field', { action: 'report-missions' }));

function toggle(set: string[], item: string) { const i = set.indexOf(item); if (i >= 0) set.splice(i, 1); else set.push(item); }
const fileUrl = computed(() => kind.value === 'bug'
  ? issueUrl(BUG_TEMPLATE, bugTitle(bug), bugText())
  : issueUrl(MISSIONS_TEMPLATE, missionsTitleText(), missionsText()));
async function copy() {
  const text = kind.value === 'bug' ? `${bugTitle(bug)}\n\n${bugText()}` : `${missionsTitleText()}\n\n${missionsText()}`;
  say(await copyText(text) ? 'Copied: paste it into a new issue on GitHub' : 'Could not copy on this phone');
}
const canShare = typeof navigator.share === 'function';
async function share() {
  const title = kind.value === 'bug' ? bugTitle(bug) : missionsTitleText();
  const text = kind.value === 'bug' ? bugText() : missionsText();
  try { await navigator.share({ title, text }); } catch { /* the player closed the share sheet */ }
}
const results: MissionResult[] = ['done', 'failed', 'not-tried'];
</script>

<template>
  <div class="report">
    <p class="split">{{ SPLIT_NOTE }}</p>
    <div class="kinds"><button class="px kind" :class="{ on: kind === 'bug' }" @click="kind = 'bug'">GAME BUG</button><button class="px kind" :class="{ on: kind === 'missions' }" @click="kind = 'missions'">THIS WEEK’S MISSIONS</button></div>

    <template v-if="kind === 'bug'">
      <label class="field"><span class="px lbl">WHAT WENT WRONG (ONE LINE)</span><input v-model="bug.summary" maxlength="120" placeholder="Fainted creature came back in an arena match" /></label>
      <div class="checks"><span class="px lbl">TICK WHAT APPLIES</span>
        <label v-for="c in BUG_CHECKS" :key="c" class="check"><input type="checkbox" :checked="bug.checks.includes(c)" @change="toggle(bug.checks, c)" /><span>{{ c }}</span></label>
      </div>
      <label class="field"><span class="px lbl">WHAT HAPPENED (AND ANY ERROR’S EXACT WORDS)</span><textarea v-model="bug.happened" rows="3" /></label>
      <label class="field"><span class="px lbl">STEPS TO MAKE IT HAPPEN</span><textarea v-model="bug.steps" rows="3" placeholder="1. … 2. … 3. …" /></label>
      <label class="field"><span class="px lbl">WHAT YOU EXPECTED</span><input v-model="bug.expected" /></label>
      <div class="field"><span class="px lbl">HOW OFTEN</span><div class="row"><button v-for="(label, k) in HOW_OFTEN" :key="k" class="px pick" :class="{ on: bug.often === k }" @click="bug.often = k as HowOften">{{ label.toUpperCase() }}</button></div></div>
      <small class="hint">The game adds its version, your phone, your wallet and the time. Add screenshots on GitHub (never your recovery phrase).</small>
    </template>

    <template v-else>
      <p v-if="!list" class="hint">Fetching this week’s missions…</p>
      <p v-else-if="!entries.length" class="hint">No game missions are up yet. Check the bulletin board on Monday morning.</p>
      <template v-else>
        <div class="px week">{{ list.week === null ? 'STARTER MISSIONS' : `WEEK ${list.week} · ${list.title.toUpperCase()}` }}</div>
        <div v-for="e in entries" :key="e.mission.id" class="mission" :class="e.result">
          <button class="head" @click="open = open === e.mission.id ? null : e.mission.id"><span class="px id">{{ e.mission.id }}</span><b>{{ e.mission.title }}</b><span class="px state">{{ RESULT_LABEL[e.result].toUpperCase() }} {{ open === e.mission.id ? '▲' : '▼' }}</span></button>
          <div v-if="open === e.mission.id" class="body">
            <small class="task">{{ e.mission.task }}</small>
            <div class="row"><button v-for="r in results" :key="r" class="px pick" :class="{ on: e.result === r }" @click="e.result = r">{{ RESULT_LABEL[r].toUpperCase() }}</button></div>
            <div class="checks"><label v-for="c in MISSION_CHECKS" :key="c" class="check"><input type="checkbox" :checked="e.checks.includes(c)" @change="toggle(e.checks, c)" /><span>{{ c }}</span></label></div>
            <label class="field"><span class="px lbl">EXPLAIN WHAT YOU TICKED</span><textarea v-model="e.comment" rows="2" /></label>
            <label class="field"><span class="px lbl">BUG REPORTS FOR THIS MISSION (LINKS OR #NUMBERS)</span><input v-model="e.bugs" placeholder="#12" /></label>
          </div>
        </div>
        <label class="field"><span class="px lbl">ANYTHING ELSE THIS WEEK</span><textarea v-model="overall" rows="2" /></label>
        <small class="hint">File each bug as its own GAME BUG report first, then put its link or number on the mission it came from.</small>
      </template>
    </template>

    <div class="send">
      <a class="px go" :class="{ off: kind === 'bug' ? !bugReady : !entries.length }" :href="(kind === 'bug' ? bugReady : entries.length) ? fileUrl : undefined">FILE ON GITHUB ▶</a>
      <button class="px" @click="copy">COPY</button>
      <button v-if="canShare" class="px" @click="share">SHARE</button>
    </div>
    <small v-if="kind === 'bug' && !bugReady" class="hint">Fill in what went wrong and what happened to file it.</small>
    <small v-if="flash" class="flash px">{{ flash }}</small>
  </div>
</template>

<style scoped>
.report{display:grid;gap:10px;font-size:15px}
.px{font-family:'Silkscreen',monospace;letter-spacing:0}
.split{margin:0;padding:8px;background:#26443a;color:#f6efd2;font-size:14px;line-height:1.2}
.kinds{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.kind,.pick{padding:7px 4px;color:#26443a;background:#ece4c3;box-shadow:0 0 0 2px #26443a;font-size:8px;border:0;cursor:pointer}
.kind.on,.pick.on{background:#26443a;color:#f6efd2}
.row{display:flex;flex-wrap:wrap;gap:6px}
.field{display:grid;gap:4px}
.lbl{font-size:8px;color:#4c6a5c;line-height:1.5}
input:not([type]),input[type=text],textarea{font:inherit;font-size:16px;color:#26443a;background:#fffaf0;border:0;box-shadow:0 0 0 2px #26443a;padding:6px 8px;border-radius:0;width:100%;box-sizing:border-box}
textarea{resize:vertical}
.checks{display:grid;gap:4px}
.check{display:flex;gap:8px;align-items:flex-start;font-size:15px;line-height:1.15}
.check input{margin-top:2px;accent-color:#26443a;width:16px;height:16px;flex:none}
.hint{color:#4c6a5c;font-size:14px;line-height:1.2}
.week{font-size:9px;color:#26443a}
.mission{box-shadow:0 0 0 2px #26443a;background:#ece4c3}
.mission.done{background:#dfe9c8}.mission.failed{background:#f0d6c4}
.head{display:flex;gap:8px;align-items:center;width:100%;padding:8px;background:transparent;color:#26443a;border:0;box-shadow:none;cursor:pointer;text-align:left;font:inherit}
.head b{flex:1;font-size:17px;font-weight:400}
.id{font-size:8px;color:#7a5a2a}.state{font-size:7px;color:#4c6a5c}
.body{display:grid;gap:8px;padding:0 8px 10px}
.task{font-size:14px;color:#4c6a5c;line-height:1.2}
.send{display:grid;grid-template-columns:2fr 1fr 1fr;gap:6px}
.send>*{font-size:9px;padding:9px 6px;text-align:center;text-decoration:none;color:#f3f3df;background:#1f4434;border:0;box-shadow:0 0 0 2px #0b1a15,inset 2px 2px 0 #ffffff22,inset -2px -3px 0 #00000055;cursor:pointer}
.go{background:#3f6e2a}.go.off{opacity:.45;pointer-events:none}
.flash{font-size:8px;color:#26443a;text-align:center}
</style>
