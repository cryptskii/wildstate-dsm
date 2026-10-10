<script setup lang="ts">
/**
 * The camp's bulletin board, read up close: the board art behind, the week's
 * beta missions pinned to the slate as paper notes that scroll inside it, and
 * a button that copies the whole list to take elsewhere. Every word on it is
 * the server's, read from the missions file (src/domain/missions.ts).
 */
import { inject, onMounted, onUnmounted, ref } from 'vue';
import type { Mission } from '../domain/missions';

const props = defineProps<{
  welcome: string;
  week: { week: number; title: string; posted: string } | null;
  missions: Mission[];
  footer: string;
  copyText: string;
}>();
const interact = inject<(id: string, event: string, data: unknown) => void>('rpgGuiInteraction')!;
const leave = () => interact('mission-board', 'board', { action: 'leave' });

/** Served from public/, like every other picture the screens show. */
const ART = 'beta-mission-board/board.png';

const copied = ref<'idle' | 'copied' | 'failed'>('idle');
let reset: ReturnType<typeof setTimeout> | undefined;

/** Copies with the old select-and-copy where the clipboard API is not offered (some WebViews). */
function copyBySelection(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  return ok;
}

async function copyAll() {
  let ok: boolean;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(props.copyText);
      ok = true;
    } else {
      ok = copyBySelection(props.copyText);
    }
  } catch {
    ok = copyBySelection(props.copyText);
  }
  copied.value = ok ? 'copied' : 'failed';
  clearTimeout(reset);
  reset = setTimeout(() => { copied.value = 'idle'; }, 2500);
}

// The art is 941 x 1672; the frame keeps its shape at 402 x 714 and is scaled to the screen.
const k = ref(1);
const fit = () => { k.value = Math.min(window.innerWidth / 402, window.innerHeight / 714); };
onMounted(() => { fit(); window.addEventListener('resize', fit); });
onUnmounted(() => { window.removeEventListener('resize', fit); clearTimeout(reset); });
</script>

<template>
  <div class="board-screen">
    <div class="backdrop" :style="{ backgroundImage: `url(${ART})` }"></div>
    <div class="frame" :style="{ transform: `translate(-50%, -50%) scale(${k})` }">
      <img class="art" :src="ART" alt="" />

      <div class="slate">
        <p class="welcome">{{ welcome }}</p>
        <template v-if="week">
          <div class="px week">WEEK {{ week.week }} · {{ week.title }}</div>
          <div class="posted">Posted {{ week.posted }}</div>
          <article v-for="(m, i) in missions" :key="m.id" class="note" :class="i % 2 ? 'tilt-r' : 'tilt-l'">
            <i class="pin" aria-hidden="true"></i>
            <div class="px id">{{ m.id }}</div>
            <b>{{ m.title }}</b>
            <p>{{ m.task }}</p>
          </article>
        </template>
        <p v-else class="empty">Nothing is pinned up yet. Check back Monday morning for this week’s missions.</p>
        <p v-if="footer" class="footer">{{ footer }}</p>
      </div>

      <div class="actions">
        <button class="px leave" @click="leave">◀ LEAVE</button>
        <button class="px copy" :class="copied" @click="copyAll">
          {{ copied === 'copied' ? 'COPIED ✓' : copied === 'failed' ? 'COPY FAILED' : 'COPY ALL' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=VT323&display=swap');
.board-screen{position:fixed;inset:0;background:#1d2a14;overflow:hidden;pointer-events:auto;font-family:'VT323',ui-monospace,monospace;color:#f3f3df}
/* Past the board's own shape (a taller or wider screen), the same scene, softened, so the edges are not bare. */
.backdrop{position:absolute;inset:-24px;background-size:cover;background-position:center;filter:blur(10px) brightness(.55);pointer-events:none}
.frame{position:absolute;left:50%;top:50%;width:402px;height:714px;transform-origin:center;overflow:hidden}
.art{position:absolute;inset:0;width:402px;height:714px;image-rendering:pixelated;pointer-events:none;user-select:none}
.px{font-family:'Silkscreen',monospace;letter-spacing:0}
button{font:inherit;cursor:pointer;border:0}

/* The slate inside the board's frame: everything pinned to it scrolls here. */
.slate{position:absolute;left:55px;top:121px;width:299px;height:496px;overflow-y:auto;-webkit-overflow-scrolling:touch;
  padding:10px 10px 18px;box-sizing:border-box;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#9ccf6e55 transparent}
.welcome{margin:0 0 12px;font-size:19px;line-height:1.15;color:#e9f1d8;text-align:center;text-shadow:1px 1px 0 #0008}
.week{font-size:10px;color:#c4ec79;text-align:center;line-height:1.4}
.posted{font-size:15px;color:#b9cdb6;text-align:center;margin-bottom:10px}
.empty,.footer{font-size:17px;line-height:1.2;color:#cfdcc0;text-align:center;margin:12px 4px 0}

/* A paper note pinned to the slate. */
.note{position:relative;margin:14px 6px 0;padding:14px 12px 10px;background:#efe3c2;color:#2b2414;
  box-shadow:2px 3px 0 #0006,inset 0 0 0 1px #c9b98f}
.note.tilt-l{rotate:-1.2deg}.note.tilt-r{rotate:1deg}
.pin{position:absolute;left:50%;top:-6px;width:12px;height:12px;margin-left:-6px;border-radius:50%;
  background:radial-gradient(circle at 35% 35%,#ff8a7a,#c0322a 60%,#7a1712);box-shadow:1px 2px 0 #0007}
.id{font-size:8px;color:#7a5a2a}
.note b{display:block;font-size:21px;font-weight:400;line-height:1;margin:2px 0 4px}
.note p{margin:0;font-size:17px;line-height:1.15}

.actions{position:absolute;left:24px;right:24px;bottom:30px;display:grid;grid-template-columns:auto 1fr;gap:10px}
.leave,.copy{font-size:10px;color:#f3f3df;padding:12px 14px;box-shadow:0 0 0 2px #0b1a15,inset 2px 2px 0 #ffffff22,inset -2px -3px 0 #00000055}
.leave{background:#1f4434}
.copy{background:#3f6e2a}.copy.copied{background:#2f5a8a}.copy.failed{background:#7a3b1e}
.leave:active,.copy:active{translate:0 2px}
</style>
