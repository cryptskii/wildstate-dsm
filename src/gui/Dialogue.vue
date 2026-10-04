<script setup lang="ts">
import { inject, ref, onMounted, watch, nextTick } from 'vue';
const props = defineProps<{ speaker: string; portrait: string | null; message: string; page: number; last: boolean }>();
const interact = inject<(id:string,event:string,data:unknown)=>void>('rpgGuiInteraction')!;
const button = ref<HTMLButtonElement>();
const pending = ref(false);
function advance() { if (pending.value) return; pending.value = true; interact('portrait-dialogue', 'next', { page: props.page }); }
onMounted(() => button.value?.focus());
watch(() => props.page, async () => { pending.value = false; await nextTick(); button.value?.focus(); });
</script>
<template>
  <div class="overlay">
    <section class="panel" aria-label="Conversation" @keydown.stop @click="advance">
      <img v-if="portrait" class="portrait" :key="portrait" :src="`portraits/${portrait}.png`" :alt="speaker"/>
      <div class="copy"><span class="who">{{ speaker }}</span><p aria-live="polite">{{ message }}</p><div class="foot"><small>{{ last ? 'Back to exploring' : 'Tap or press Enter' }}</small><button ref="button" :disabled="pending" @click.stop="advance">▼</button></div></div>
    </section>
  </div>
</template>
<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=VT323&display=swap');
.overlay{position:fixed;z-index:100;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:24px 24px 170px;box-sizing:border-box;pointer-events:auto;color:#f3f3df;font-family:'VT323',ui-monospace,monospace}
.panel{width:min(760px,100%);display:flex;gap:14px;padding:12px 14px;background:#10261fef;box-shadow:0 0 0 2px #0b1a15,0 0 0 4px #9ccf6e,0 0 0 6px #0b1a15;cursor:pointer;animation:arrive .2s ease-out}
.portrait{width:96px;height:96px;flex:none;object-fit:cover;object-position:50% 8%;image-rendering:pixelated;background:#f6efd2;box-shadow:0 0 0 2px #26443a,0 0 0 4px #9ccf6e}
.copy{flex:1;min-width:0}.who{display:block;font-family:'Silkscreen',monospace;font-size:10px;color:#c4ec79;margin-bottom:6px}p{margin:0;font-size:22px;line-height:1.25;min-height:56px}
.foot{display:flex;justify-content:space-between;align-items:center;margin-top:6px}.foot small{font-family:'Silkscreen',monospace;font-size:8px;color:#8fb09a}
button{font:inherit;border:0;background:none;color:#c4ec79;font-size:16px;cursor:pointer;animation:blink 1s steps(1) infinite}button:disabled{opacity:.4}
@keyframes arrive{from{translate:0 16px;opacity:0}}@keyframes blink{50%{opacity:0}}
@media(max-width:650px){.overlay{padding:8px 12px 196px}.portrait{width:64px;height:64px}p{font-size:18px}}
</style>
