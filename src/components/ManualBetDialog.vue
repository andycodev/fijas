<script setup lang="ts">
import Betano from './Betano.vue';
import { computed, reactive, ref } from 'vue';
import { modelProbabilityFor, useCreateBet, useSelectableMatches } from '../composables/useBets';
import { useCash } from '../composables/useCash';
import { suggestedStake } from '../lib/settle';
import { MARKET_LABEL } from '../lib/markets';
import type { Market } from '../types/db';

const emit = defineEmits<{ close: [] }>();

const matches = useSelectableMatches();
const cash = useCash();
const create = useCreateBet();

const LINES: Record<Market, number[]> = {
  goals_total: [0.5, 1.5, 2.5, 3.5, 4.5],
  corners_total: [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5],
};
const RESULTS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'won', label: 'Ganada' },
  { value: 'lost', label: 'Perdida' },
  { value: 'void', label: 'Reembolsada' },
] as const;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const profile = computed(() => cash.profile.data.value);
const form = reactive({
  matchId: null as number | null,
  market: 'goals_total' as Market,
  side: 'over' as 'over' | 'under',
  line: 2.5,
  odds: null as number | null,
  stake: profile.value ? suggestedStake(profile.value.stake_mode, Number(profile.value.stake_value), Number(profile.value.initial_bankroll)) : (null as number | null),
  date: today(),
  result: 'pending' as (typeof RESULTS)[number]['value'],
});

function setMarket(m: Market) {
  form.market = m;
  form.line = LINES[m].includes(form.line) ? form.line : LINES[m][Math.floor(LINES[m].length / 2)]!;
}

const label = (m: NonNullable<typeof matches.data.value>[number]) =>
  `${m.home?.name} vs ${m.away?.name} · ${new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' }).format(new Date(m.kickoff_at))}`;

const error = ref<string | null>(null);

async function submit() {
  error.value = null;
  if (!form.matchId || !form.odds || !form.stake) return;
  try {
    // Si el modelo tenía un pick para esta selección, se guarda su probabilidad para medir la precisión después.
    const { pickId, probability } = await modelProbabilityFor(form.matchId, form.market, form.line, form.side);
    const placed = form.date === today() ? new Date() : new Date(`${form.date}T12:00:00`);
    await create.mutateAsync({
      match_id: form.matchId,
      pick_id: pickId,
      market: form.market,
      line: form.line,
      side: form.side,
      odds: form.odds,
      stake: form.stake,
      model_probability: probability,
      placed_at: placed.toISOString(),
      result: form.result,
    });
    emit('close');
  } catch {
    error.value = 'No se pudo registrar la apuesta.';
  }
}
</script>

<template>
  <div class="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 md:items-center md:p-4" @click.self="emit('close')">
    <form
      role="dialog"
      aria-modal="true"
      aria-label="Nueva apuesta"
      class="card max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-b-none p-4 md:rounded-b-lg"
      @submit.prevent="submit"
    >
      <h2 class="font-bold">Nueva apuesta</h2>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Partido</span>
        <select v-model.number="form.matchId" required class="field">
          <option :value="null" disabled>Elige un partido</option>
          <option v-for="m in matches.data.value ?? []" :key="m.id" :value="m.id">{{ label(m) }}</option>
        </select>
      </label>

      <div class="grid grid-cols-2 gap-2" role="group" aria-label="Mercado">
        <button
          v-for="m in (['goals_total', 'corners_total'] as Market[])"
          :key="m"
          type="button"
          class="btn"
          :class="form.market === m ? '!border-primary !text-brand' : ''"
          @click="setMarket(m)"
        >
          {{ MARKET_LABEL[m] }}
        </button>
      </div>

      <div class="grid grid-cols-[1fr_1fr] gap-2">
        <div class="grid grid-cols-2 gap-2" role="group" aria-label="Selección">
          <button type="button" class="btn !px-2" :class="form.side === 'over' ? '!border-primary !text-brand' : ''" @click="form.side = 'over'">Más de</button>
          <button type="button" class="btn !px-2" :class="form.side === 'under' ? '!border-primary !text-brand' : ''" @click="form.side = 'under'">Menos de</button>
        </div>
        <select v-model.number="form.line" class="field" aria-label="Línea">
          <option v-for="l in LINES[form.market]" :key="l" :value="l">{{ l }}</option>
        </select>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <label class="block space-y-1">
          <span class="text-xs font-semibold">Cuota de <Betano /></span>
          <input v-model.number="form.odds" type="number" step="0.01" min="1.01" required inputmode="decimal" class="field" />
        </label>
        <label class="block space-y-1">
          <span class="text-xs font-semibold">Monto</span>
          <input v-model.number="form.stake" type="number" step="0.01" min="0.01" required inputmode="decimal" class="field" />
        </label>
      </div>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Fecha de la apuesta</span>
        <input v-model="form.date" type="date" :max="today()" required class="field" />
      </label>

      <fieldset class="space-y-1">
        <legend class="text-xs font-semibold">Resultado</legend>
        <div class="grid grid-cols-2 gap-2">
          <label
            v-for="r in RESULTS"
            :key="r.value"
            class="btn cursor-pointer has-[:checked]:border-primary has-[:checked]:text-brand"
          >
            <input v-model="form.result" type="radio" :value="r.value" class="sr-only" />
            {{ r.label }}
          </label>
        </div>
      </fieldset>

      <p v-if="error" role="alert" class="text-xs font-semibold text-novalue">{{ error }}</p>

      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="btn" @click="emit('close')">Cancelar</button>
        <button type="submit" class="btn btn-primary" :disabled="create.isPending.value || !form.matchId">Guardar</button>
      </div>
    </form>
  </div>
</template>
