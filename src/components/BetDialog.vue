<script setup lang="ts">
import { computed, ref } from 'vue';
import { useBets, useCreateBet } from '../composables/useBets';
import { useCash } from '../composables/useCash';
import { suggestedStake } from '../lib/settle';
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
}>();
const emit = defineEmits<{ close: [] }>();

const cash = useCash();
const bets = useBets();
const create = useCreateBet();

const profile = computed(() => cash.profile.data.value);
const bankroll = computed(() => cash.balance.value ?? Number(profile.value?.initial_bankroll ?? 0));
const stake = ref<number | null>(
  profile.value ? suggestedStake(profile.value.stake_mode, Number(profile.value.stake_value), bankroll.value) : null,
);
const odds = ref(props.odds);

const limit = computed(() => profile.value?.daily_bet_limit ?? 0);
const limitReached = computed(() => limit.value > 0 && bets.placedToday.value >= limit.value);
const insufficient = computed(() => (stake.value ?? 0) > bankroll.value);

async function submit() {
  if (!stake.value || limitReached.value) return;
  await create.mutateAsync({
    match_id: props.matchId,
    pick_id: props.pickId,
    market: props.market,
    line: props.line,
    side: props.side,
    odds: odds.value,
    stake: stake.value,
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
      class="card w-full max-w-sm space-y-3 rounded-b-none p-4 md:rounded-b-lg"
      @submit.prevent="submit"
    >
      <div>
        <h2 class="font-bold">Registrar apuesta</h2>
        <p class="text-xs text-ink/60">{{ matchLabel }}</p>
        <p class="font-semibold">{{ selectionLabel(market, side, line) }}</p>
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

      <p class="text-xs text-ink/60">Saldo calculado: {{ formatMoney(bankroll) }}</p>
      <p v-if="limitReached" role="alert" class="text-xs font-semibold text-novalue">
        Alcanzaste tu tope diario ({{ limit }} apuestas). Cámbialo en Ajustes si quieres seguir.
      </p>
      <p v-else-if="insufficient" role="alert" class="text-xs font-semibold text-marginal">
        El monto supera tu saldo calculado.
      </p>
      <p v-if="create.isError.value" role="alert" class="text-xs font-semibold text-novalue">No se pudo registrar.</p>

      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="btn" @click="emit('close')">Cancelar</button>
        <button type="submit" class="btn btn-primary" :disabled="create.isPending.value || limitReached">Registrar</button>
      </div>
    </form>
  </div>
</template>
