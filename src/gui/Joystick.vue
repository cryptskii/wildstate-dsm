<script setup lang="ts">
/**
 * Floating thumbstick for walking. It appears wherever the left thumb lands, follows the thumb if
 * it slides past the rim, and snaps to the four directions the characters walk in. A dead zone
 * keeps a resting thumb still, and hysteresis keeps a thumb near a diagonal from flickering
 * between two directions. It emits the direction (or null) only when it changes; the field turns
 * that into one engine input per displayed frame (held-direction.ts).
 */
import { onMounted, onUnmounted, ref } from 'vue';
import { Direction } from '@rpgjs/common';
import { snapDirection } from './stick';

const emit = defineEmits<{ direction: [Direction | null] }>();

/** Base radius in CSS px; the knob travels this far from the centre. */
const R = 52;
const zone = ref<HTMLElement | null>(null);
const active = ref(false);
const base = ref({ x: 0, y: 0 });
const knob = ref({ x: 0, y: 0 });
let pointer: number | null = null;
let origin = { x: 0, y: 0 };
let direction: Direction | null = null;
/** The direction shown lit on the base. */
const facing = ref<Direction | null>(null);

function steer(next: Direction | null) {
  if (next === direction) return;
  direction = next;
  facing.value = next;
  if (next !== null) navigator.vibrate?.(10);
  emit('direction', next);
}

function place(e: PointerEvent) {
  let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
  const d = Math.hypot(dx, dy);
  // Past the rim, the base is dragged along behind the thumb.
  if (d > R) {
    origin = { x: origin.x + dx * (1 - R / d), y: origin.y + dy * (1 - R / d) };
    dx = e.clientX - origin.x; dy = e.clientY - origin.y;
  }
  const box = zone.value!.getBoundingClientRect();
  base.value = { x: origin.x - box.left, y: origin.y - box.top };
  knob.value = { x: dx, y: dy };
  steer(snapDirection(dx, dy, R, direction));
}

function down(e: PointerEvent) {
  if (pointer !== null) return;
  e.preventDefault();
  pointer = e.pointerId;
  zone.value!.setPointerCapture(e.pointerId);
  origin = { x: e.clientX, y: e.clientY };
  active.value = true;
  place(e);
}
function move(e: PointerEvent) { if (e.pointerId === pointer) place(e); }
function up(e?: Event) {
  if (e && 'pointerId' in e && (e as PointerEvent).pointerId !== pointer) return;
  pointer = null;
  active.value = false;
  knob.value = { x: 0, y: 0 };
  steer(null);
}
const hidden = () => { if (document.hidden) up(); };
onMounted(() => { window.addEventListener('blur', up); document.addEventListener('visibilitychange', hidden); });
onUnmounted(() => { window.removeEventListener('blur', up); document.removeEventListener('visibilitychange', hidden); up(); });
</script>

<template>
  <div ref="zone" class="stickZone" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up">
    <div v-if="!active" class="ghost" aria-hidden="true"><i></i></div>
    <div v-else class="base" :style="{ left: base.x - R + 'px', top: base.y - R + 'px' }" aria-hidden="true">
      <i v-for="d in ['up', 'down', 'left', 'right']" :key="d" class="tick" :class="[d, { on: facing === d }]"></i>
      <b class="knob" :style="{ transform: `translate(${knob.x}px, ${knob.y}px)` }"></b>
    </div>
  </div>
</template>

<style scoped>
/* The lower-left of the screen is the stick's: touch it anywhere there. */
.stickZone{position:absolute;left:0;bottom:0;width:58%;height:44%;z-index:5;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.ghost,.base{position:absolute;width:104px;height:104px;border-radius:50%}
/* Its resting spot sits clear of the screen's bottom edge, where Android takes an upward drag for its own swipe gesture. */
.ghost{left:22px;bottom:64px;background:#0b1a1526;box-shadow:inset 0 0 0 3px #f6efd240}
.ghost i{position:absolute;left:30px;top:30px;width:44px;height:44px;border-radius:50%;background:#f6efd233}
.base{background:radial-gradient(circle,#0b1a1540 0 55%,#0b1a1566 56%);box-shadow:inset 0 0 0 3px #f6efd280,0 2px 0 #0b1a1566}
.knob{position:absolute;left:28px;top:28px;width:48px;height:48px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff8dc,#e2c35a 60%,#a8743c);box-shadow:0 0 0 3px #2b1a10,0 3px 0 #0b1a15;will-change:transform}
.tick{position:absolute;width:0;height:0;border:7px solid transparent;opacity:.55}
.tick.up{left:45px;top:4px;border-bottom-color:#f6efd2}.tick.down{left:45px;bottom:4px;border-top-color:#f6efd2}
.tick.left{left:4px;top:45px;border-right-color:#f6efd2}.tick.right{right:4px;top:45px;border-left-color:#f6efd2}
.tick.on{opacity:1;filter:drop-shadow(0 0 4px #e2c35a)}
</style>
