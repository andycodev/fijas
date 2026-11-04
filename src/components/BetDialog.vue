<script setup lang="ts">
import { computed, ref } from 'vue';
import { useBets, useCreateBet } from '../composables/useBets';
import { useCash } from '../composables/useCash';
import { suggestedStake } from '../lib/settle';
import { riskAlerts } from '../lib/finance';
import { formatMoney } from '../lib/format';
import { selectionLabel } from '../lib/markets';
import type { Market } from '../types/db';

const props = defineProps<{
  matchId: number;
  pickId: number | null;
  market: Market;
  matchLabel: string;
  line: number;
  side: 'over' | 'under';
  odds: number;
  modelProbability?: number | null; // probabilidad del modelo para esta selección
}>();
const emit = defineEmits<{ close: [] }>();

const cash = useCash();
const bets = useBets();
const create = useCreateBet();

const profile = computed(() => cash.profile.data.value);
const balance = computed(() => cash.balance.value ?? Number(profile.value?.initial_bankroll ?? 0));

// El monto sugerido sale del capital base, no del saldo: no aumenta después de ganar ni intenta recuperar pérdidas.
const base = profile.value
  ? Math.min(suggestedStake(profile.value.stake_mode, Number(profile.value.stake_value), Number(profile.value.initial_bankroll)), Math.max(balance.value, 0))
  : null;
const stake = ref<number | null>(base);
const odds = ref(props.odds);
const confirmed = ref(false);

const alerts = computed(() =>
  profile.value
    ? riskAlerts({ settings: profile.value, balance: balance.value, bets: bets.data.value ?? [], extraStake: stake.value ?? 0 })
    : [],
);
const stops = computed(() => alerts.value.filter((a) => a.level === 'stop'));
const hardBlock = computed(() => alerts.value.some((a) => a.id === 'count'));
const insufficient = computed(() => (stake.value ?? 0) > balance.value);
const canSubmit = computed(
  () => !!stake.value && !hardBlock.value && (stops.value.length === 0 || confirmed.value) && !create.isPending.value,
);

const ALERT_CLASS = { info: 'text-ink/70', warn: 'text-marginal', stop: 'text-novalue' } as const;

async function submit() {
  if (!canSubmit.value || !stake.value) return;
  await create.mutateAsync({
    match_id: props.matchId,
    pick_id: props.pickId,
    market: props.market,
    line: props.line,
    side: props.side,
    odds: odds.value,
    stake: stake.value,
    model_probability: props.modelProbability ?? null,
  });
  emit('close');
}
</script>

<template>
  <div class="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 p-0 md:items-center md:p-4" @click.self="emit('close')">
    <form
      role="dialog"
      aria-modal="true"
      aria-label="Registrar apuesta"
      class="card max-h-full w-full max-w-sm space-y-3 overflow-y-auto rounded-b-none p-4 md:rounded-b-lg"
      @submit.prevent="submit"
    >
      <div>
        <h2 class="font-bold">Registrar apuesta</h2>
        <p class="text-xs text-ink/60">{{ matchLabel }}</p>
        <p class="font-semibold">{{ selectionLabel(market, side, line) }}</p>
        <p v-if="modelProbability" class="text-xs text-ink/60">
          Modelo {{ (modelProbability * 100).toFixed(1) }}% · cuota justa {{ (1 / modelProbability).toFixed(2) }}
        </p>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <label class="block space-y-1">
          <span class="text-xs font-semibold">Cuota aceptada</span>
          <input v-model.number="odds" type="number" step="0.01" min="1.01" required inputmode="decimal" class="field" />
        </label>
        <label class="block space-y-1">
          <span class="text-xs font-semibold">Monto</span>
          <input v-model.number="stake" type="number" step="0.01" min="0.01" required inputmode="decimal" class="field" />
        </label>
      </div>

      <p class="text-xs text-ink/60">
        Saldo disponible {{ formatMoney(balance) }}. El monto sugerido sale de tu capital base y no cambia con tus resultados.
      </p>

      <ul v-if="alerts.length || insufficient" class="space-y-1" role="alert">
        <li v-for="a in alerts" :key="a.id" class="text-xs font-semibold" :class="ALERT_CLASS[a.level]">{{ a.message }}</li>
        <li v-if="insufficient" class="text-xs font-semibold text-marginal">El monto supera tu saldo disponible.</li>
      </ul>

      <label v-if="stops.length && !hardBlock" class="flex min-h-touch items-center gap-3 text-xs font-semibold">
        <input v-model="confirmed" type="checkbox" class="h-5 w-5 accent-novalue" />
        Entiendo que supero un límite que yo mismo definí y quiero continuar.
      </label>
      <p v-if="hardBlock" class="text-xs font-semibold text-novalue">
        Alcanzaste tu tope de apuestas por día. Cámbialo en Ajustes si quieres seguir.
      </p>
      <p v-if="create.isError.value" role="alert" class="text-xs font-semibold text-novalue">No se pudo registrar.</p>

      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="btn" @click="emit('close')">Cancelar</button>
        <button type="submit" class="btn btn-primary" :disabled="!canSubmit">Registrar</button>
      </div>
    </form>
  </div>
</template>
