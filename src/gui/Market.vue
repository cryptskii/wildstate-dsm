<script setup lang="ts">
/**
 * The market: swap WILD and ERA through the game's SoFi vault, from inside the
 * game. The game asks the player's wallet for a quote and for the trade; the
 * wallet runs an ordinary SoFi trade, routed (and multi-hop when it must be)
 * as SoFi finds it, within what the player granted. Nothing here decides a
 * price or a balance: the reserves are the vault's own reading, the balances are
 * proven holdings, the quote is the wallet's.
 */
import { inject, ref } from 'vue';
import type { MarketData } from '../modules/main/dsm';

const props = defineProps<MarketData>();
const interact = inject<(id: string, event: string, data: unknown) => void>('rpgGuiInteraction')!;
const side = ref<'buy' | 'sell'>('buy');
const amount = ref('');

const send = (action: 'quote' | 'swap' | 'close') =>
  interact('dsm-market', 'market', { action, side: side.value, amount: amount.value });
</script>

<template>
  <div class="overlay">
    <section class="card" aria-label="Market">
      <div class="head">
        <h1>Market · WILD / ERA</h1>
        <button class="x" @click="send('close')">CLOSE</button>
      </div>
      <p class="vault" v-if="vault">The game's vault holds {{ vault.wild }} WILD · {{ vault.era }} ERA · {{ vault.generation }} trade(s) so far</p>
      <p class="vault" v-else>Reading the vault…</p>
      <p class="mine">You hold {{ coins ?? '…' }} and {{ era ?? '…' }} (proven).</p>
      <div class="sides">
        <button :class="{ sel: side === 'buy' }" @click="side = 'buy'">BUY WILD with ERA</button>
        <button :class="{ sel: side === 'sell' }" @click="side = 'sell'">SELL WILD for ERA</button>
      </div>
      <label>
        You pay ({{ side === 'buy' ? 'ERA' : 'WILD' }})
        <input v-model="amount" inputmode="decimal" :placeholder="side === 'buy' ? '1.00' : '50'" @keydown.stop />
      </label>
      <div class="actions">
        <button @click="send('quote')">QUOTE</button>
        <button class="go" :disabled="!quote" @click="send('swap')">SWAP</button>
      </div>
      <p v-if="quote" class="quote">{{ quote.amountIn }} → {{ quote.amountOut }} ({{ quote.hops }} hop{{ quote.hops === 1 ? '' : 's' }})</p>
      <p class="status" aria-live="polite">{{ status }}</p>
    </section>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=VT323&display=swap');
.overlay{position:fixed;inset:0;z-index:105;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:#06100cb3;pointer-events:auto;color:#f3f3df;font-family:'VT323',ui-monospace,monospace}
/* Beside the DSM panel (right, 460px) on a wide screen, so both stay in reach. */
@media (min-width:1000px){.overlay{justify-content:flex-start;padding-left:24px}}
.card{width:min(520px,100%);padding:16px 18px;background:#10261f;box-shadow:0 0 0 2px #0b1a15,0 0 0 4px #e2c35a,0 0 0 6px #0b1a15}
.head{display:flex;justify-content:space-between;align-items:center}
h1{font-family:'Silkscreen',monospace;font-size:14px;color:#f3d77a;margin:0}
.x{font:inherit;font-size:16px;border:0;background:none;color:#cfe3cb;cursor:pointer}
.vault,.mine{margin:6px 0;font-size:20px}
.sides{display:flex;gap:8px;margin:8px 0}
.sides button,.actions button{font:inherit;font-size:18px;flex:1;padding:6px;border:0;cursor:pointer;background:#24402f;color:#e7f6c9}
.sides button.sel{background:#9ccf6e;color:#0e1a14}
label{display:block;font-size:18px;margin:6px 0}
input{display:block;width:100%;box-sizing:border-box;margin-top:4px;font:inherit;font-size:22px;padding:6px 8px;background:#f6efd2;color:#10261f;border:0}
.actions{display:flex;gap:8px;margin-top:8px}
.actions .go{background:#e2c35a;color:#10261f}
.actions button:disabled{opacity:.4}
.quote{font-size:22px;color:#f3d77a;margin:8px 0 0}
.status{font-family:'Silkscreen',monospace;font-size:10px;color:#e7f6c9;min-height:14px;margin-top:8px}
</style>
