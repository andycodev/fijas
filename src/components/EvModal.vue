<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import Betano from './Betano.vue';
import { formatMoney } from '../lib/format';
import { selectionLabel } from '../lib/markets';
import type { Selection } from '../lib/opportunities';
import { HIGH_EV, stakePlan } from '../lib/stake';

const props = defineProps<{ selection: Selection }>();
const emit = defineEmits<{ close: [] }>();

const s = computed(() => props.selection);
const odds = computed(() => s.value.betano!.odds);
const p = computed(() => s.value.probability);
const ev = computed(() => p.value * odds.value - 1);

// Ejemplo ilustrativo con un monto fijo de S/10 (no es una recomendación de monto).
const EXAMPLE = 10;
const plan = computed(() => stakePlan(EXAMPLE, odds.value, p.value));
const hundred = computed(() => {
  const wins = Math.round(p.value * 100);
  const invested = EXAMPLE * 100;
  return { wins, invested, net: wins * EXAMPLE * odds.value - invested };
});

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)}%`;
const money = (n: number) => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n))}`;

// Accesibilidad: el foco entra al botón de cerrar y Escape cierra la ventana.
const closeButton = ref<HTMLButtonElement | null>(null);
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close'); };
onMounted(() => {
  closeButton.value?.focus();
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 md:items-center md:p-4" @click.self="emit('close')">
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="ev-title"
      class="card max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-b-none p-4 md:rounded-b-lg"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 id="ev-title" class="font-bold">Valor esperado</h2>
          <p class="text-xs text-ink/60">{{ selectionLabel(s.market, s.side, s.line) }}</p>
        </div>
        <button ref="closeButton" type="button" class="btn !px-2" aria-label="Cerrar" @click="emit('close')">
          <XMarkIcon class="h-5 w-5" />
        </button>
      </div>

      <p class="text-3xl font-extrabold tracking-tight" :class="ev >= 0 ? 'text-value' : 'text-novalue'">{{ signed(ev) }}</p>

      <div class="space-y-1 rounded-md bg-canvas p-3 text-xs">
        <p class="font-bold">Valor esperado = probabilidad × cuota − 1</p>
        <p>
          {{ p.toFixed(3) }} × {{ odds.toFixed(2) }} − 1 =
          <strong :class="ev >= 0 ? 'text-value' : 'text-novalue'">{{ signed(ev) }}</strong>
        </p>
        <ul class="list-disc pl-4 text-ink/70">
          <li>Probabilidad del modelo: <strong>{{ (p * 100).toFixed(1) }}%</strong> (cuota justa {{ s.fairOdds.toFixed(2) }})</li>
          <li>Cuota de <Betano />: <strong>{{ odds.toFixed(2) }}</strong>, que es {{ odds >= s.fairOdds ? 'mayor' : 'menor' }} que la justa</li>
        </ul>
      </div>

      <div class="space-y-2 text-xs text-ink/80">
        <p>
          Es lo que ganas o pierdes <strong>en promedio por cada S/1 apostado</strong>, si repitieras esta misma apuesta muchísimas veces y
          la probabilidad del modelo fuera correcta.
        </p>
        <ul class="list-disc space-y-1 pl-4">
          <li><strong>Positivo:</strong> la cuota paga más de lo que el riesgo merece.</li>
          <li><strong>Cero:</strong> es justa; ni ganas ni pierdes a la larga.</li>
          <li><strong>Negativo:</strong> a la larga pierdes, aunque aciertes seguido.</li>
        </ul>
      </div>

      <div class="space-y-1 rounded-md border border-line p-3 text-xs">
        <p class="font-bold">Un ejemplo con S/{{ EXAMPLE }} (solo para ilustrar)</p>
        <ul class="list-disc space-y-1 pl-4 text-ink/80">
          <li>Si aciertas ({{ (p * 100).toFixed(0) }}%): cobras {{ formatMoney(plan.payout) }} y ganas <strong class="text-value">{{ money(plan.profitIfWin) }}</strong>.</li>
          <li>Si fallas ({{ ((1 - p) * 100).toFixed(0) }}%): pierdes <strong class="text-novalue">{{ money(-plan.lossIfLose) }}</strong>.</li>
          <li>
            Promedio por apuesta: <strong :class="plan.expectedProfit >= 0 ? 'text-value' : 'text-novalue'">{{ money(plan.expectedProfit) }}</strong>.
            Con 100 repeticiones apostarías {{ formatMoney(hundred.invested) }}, acertarías unas {{ hundred.wins }} y terminarías con
            aproximadamente <strong :class="hundred.net >= 0 ? 'text-value' : 'text-novalue'">{{ money(hundred.net) }}</strong>.
          </li>
        </ul>
      </div>

      <p class="text-cap text-ink/60">
        Es una estimación: depende de que la probabilidad del modelo sea correcta y, con pocas apuestas, el azar domina.
        <template v-if="ev > HIGH_EV">
          Un valor por encima de +{{ HIGH_EV * 100 }}% es poco habitual: confirma la cuota en tu <Betano /> antes de apostar.
        </template>
      </p>

      <button type="button" class="btn btn-primary w-full" @click="emit('close')">Entendido</button>
    </section>
  </div>
</template>
