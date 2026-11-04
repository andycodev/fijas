<script setup lang="ts">
import { computed, watch } from 'vue';
import HighValueNotice from './HighValueNotice.vue';
import { useBets } from '../composables/useBets';
import { useCash } from '../composables/useCash';
import { formatMoney } from '../lib/format';
import { HIGH_EV, recommendedStake, stakePlan } from '../lib/stake';
import { signalFor } from '../lib/value';
import type { Selection } from '../lib/opportunities';

const props = defineProps<{ selection: Selection; threshold: number; modelValue?: number | null }>();
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>();

const cash = useCash();
const bets = useBets();

const odds = computed(() => props.selection.betano!.odds);
const p = computed(() => props.selection.probability);
const ev = computed(() => p.value * odds.value - 1);
const worthIt = computed(() => signalFor(ev.value, props.threshold) === 'green');

const profile = computed(() => cash.profile.data.value);
const balance = computed(() => cash.balance.value ?? Number(profile.value?.initial_bankroll ?? 0));
const rec = computed(() =>
  profile.value ? recommendedStake({ settings: profile.value, balance: balance.value, bets: bets.data.value ?? [] }) : null,
);

// El monto se inicia con el recomendado (o el base de tus ajustes si no hay valor, para poder ver los números).
const stake = computed({
  get: () => props.modelValue ?? null,
  set: (v) => emit('update:modelValue', v && v > 0 ? v : null),
});
watch(
  rec,
  (r) => {
    if (r && (props.modelValue ?? null) === null) emit('update:modelValue', (worthIt.value ? r.amount : r.base) || null);
  },
  { immediate: true },
);

const plan = computed(() => (stake.value ? stakePlan(stake.value, odds.value, p.value) : null));
const money = (n: number) => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n))}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)}%`;

// Ejemplo de repetir la misma apuesta 100 veces con el monto elegido.
const hundred = computed(() => {
  if (!stake.value) return null;
  const wins = Math.round(p.value * 100);
  const invested = stake.value * 100;
  const collected = wins * stake.value * odds.value;
  return { wins, invested, net: collected - invested };
});

const overRecommended = computed(() => !!rec.value && worthIt.value && (stake.value ?? 0) > rec.value.amount + 0.001);
const overExposure = computed(() => !!rec.value && (stake.value ?? 0) > rec.value.exposureLeft + 0.001);
</script>

<template>
  <div class="space-y-3">
    <HighValueNotice
      v-if="ev > HIGH_EV"
      :ev="ev"
      :probability="p"
      :odds="odds"
      :origin="selection.betano!.origin"
      :captured-at="selection.betano!.capturedAt"
    />

    <section class="space-y-2 rounded-md border border-line bg-canvas/60 p-3 text-xs" aria-label="Calculadora de monto">
      <div class="flex flex-wrap items-end gap-2">
        <label class="block space-y-1">
          <span class="font-bold">¿Cuánto apostarías? (S/)</span>
          <input
            v-model.number="stake"
            type="number"
            min="0"
            step="0.5"
            inputmode="decimal"
            class="field w-32"
            aria-label="Monto a apostar en soles"
          />
        </label>
        <button
          v-if="rec && worthIt && rec.amount > 0 && stake !== rec.amount"
          type="button"
          class="btn"
          @click="stake = rec.amount"
        >
          Usar el recomendado ({{ formatMoney(rec.amount) }})
        </button>
      </div>

      <dl v-if="plan" class="grid grid-cols-3 gap-2">
        <div class="rounded-md border border-line bg-white p-2">
          <dt class="text-ink/60">Si aciertas ({{ pct(p) }})</dt>
          <dd class="text-sm font-extrabold text-value">{{ money(plan.profitIfWin) }}</dd>
          <dd class="text-[11px] text-ink/60">cobras {{ formatMoney(plan.payout) }}</dd>
        </div>
        <div class="rounded-md border border-line bg-white p-2">
          <dt class="text-ink/60">Si fallas ({{ pct(1 - p) }})</dt>
          <dd class="text-sm font-extrabold text-novalue">{{ money(-plan.lossIfLose) }}</dd>
          <dd class="text-[11px] text-ink/60">pierdes el monto</dd>
        </div>
        <div class="rounded-md border border-line bg-white p-2">
          <dt class="text-ink/60">Ganancia esperada</dt>
          <dd class="text-sm font-extrabold" :class="plan.expectedProfit >= 0 ? 'text-value' : 'text-novalue'">{{ money(plan.expectedProfit) }}</dd>
          <dd class="text-[11px] text-ink/60">promedio por apuesta</dd>
        </div>
      </dl>

      <p class="text-ink/70">
        Es <strong>una sola apuesta</strong>: ganas o pierdes el monto completo. La «ganancia esperada» solo describe el promedio si
        repitieras exactamente esta apuesta muchas veces, y solo si la probabilidad del modelo es correcta.
      </p>

      <!-- Qué se recomienda -->
      <div class="rounded-md border p-2" :class="worthIt && rec && rec.amount > 0 ? 'border-value bg-value/10' : 'border-line bg-white'">
        <template v-if="!worthIt">
          <p class="font-bold">No se recomienda apostar esto.</p>
          <p class="text-ink/70">
            Su valor esperado ({{ signed(ev) }}) no llega a tu umbral de {{ (threshold * 100).toFixed(1) }}%: a la larga no compensa el riesgo.
          </p>
        </template>
        <template v-else-if="rec && rec.amount <= 0">
          <p class="font-bold">Hoy no se recomienda apostar más.</p>
          <p class="text-ink/70">
            <template v-if="rec.exposureLeft <= 0">Ya alcanzaste tu límite de exposición diaria.</template>
            <template v-else>Tu saldo disponible no alcanza.</template>
          </p>
        </template>
        <template v-else-if="rec">
          <p class="font-bold">Monto recomendado: {{ formatMoney(rec.amount) }}</p>
          <p class="text-ink/70">
            <template v-if="profile?.stake_mode === 'percent'">
              Es el {{ Number(profile.stake_value) }}% de tu capital inicial ({{ formatMoney(Number(profile.initial_bankroll)) }}).
            </template>
            <template v-else>Es el monto fijo de tus ajustes.</template>
            <template v-if="rec.limitedBy === 'exposure'"> Lo reduje porque hoy solo te quedan {{ formatMoney(rec.exposureLeft) }} de tu exposición diaria.</template>
            <template v-else-if="rec.limitedBy === 'balance'"> Lo reduje porque no puede superar tu saldo.</template>
            No sube cuando ganas ni se aumenta para recuperar pérdidas.
          </p>
        </template>
        <p v-if="overRecommended" class="mt-1 font-semibold text-marginal">Tu monto supera el recomendado.</p>
        <p v-if="overExposure && rec" class="mt-1 font-semibold text-novalue">
          Con este monto superas lo que te queda de exposición diaria ({{ formatMoney(rec.exposureLeft) }}).
        </p>
      </div>

      <details>
        <summary class="min-h-touch cursor-pointer py-1 font-bold">¿Cómo se calcula el valor esperado?</summary>
        <div class="space-y-2 pt-1 text-ink/80">
          <p>
            <strong>Valor esperado = probabilidad × cuota − 1</strong><br />
            {{ p.toFixed(3) }} × {{ odds.toFixed(2) }} − 1 = <strong :class="ev >= 0 ? 'text-value' : 'text-novalue'">{{ signed(ev) }}</strong>
          </p>
          <p>
            Significa lo que ganas (o pierdes) <strong>en promedio por cada S/1 apostado</strong> si la probabilidad del modelo es
            cierta. Un valor positivo quiere decir que la cuota paga más de lo que el riesgo merece; uno negativo, que paga menos.
          </p>
          <p>
            <strong>Ganancia esperada en soles = monto × valor esperado.</strong>
            <template v-if="plan"> Con {{ formatMoney(stake!) }}: {{ stake }} × {{ ev.toFixed(3) }} = {{ money(plan.expectedProfit) }}.</template>
          </p>
          <p v-if="hundred">
            <strong>Un ejemplo con 100 repeticiones:</strong> apostarías {{ formatMoney(hundred.invested) }} en total, acertarías unas
            {{ hundred.wins }} veces (cobrando {{ formatMoney(stake! * odds) }} cada vez) y terminarías con aproximadamente
            <strong :class="hundred.net >= 0 ? 'text-value' : 'text-novalue'">{{ money(hundred.net) }}</strong>. Con pocas apuestas, el azar
            domina y puedes perder aunque el valor sea positivo.
          </p>
        </div>
      </details>
    </section>
  </div>
</template>
