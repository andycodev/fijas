<script setup lang="ts">
import { computed, ref } from 'vue';
import { CheckCircleIcon, ClockIcon, MinusCircleIcon, XCircleIcon } from '@heroicons/vue/24/solid';
import Betano from './Betano.vue';
import { realTotal, useApplyLegResults, useConfirmTicket, useSettleTicket } from '../composables/useTickets';
import { formatMoney } from '../lib/format';
import { MARKET_LABEL, selectionLabel } from '../lib/markets';
import { suggestTicketOutcome, ticketPlan } from '../lib/tickets';
import type { LegResult, Ticket } from '../types/db';

const props = defineProps<{ ticket: Ticket }>();

const settle = useSettleTicket();
const applyLegs = useApplyLegResults();
const confirm = useConfirmTicket();

const t = computed(() => props.ticket);
const isOpen = computed(() => t.value.status === 'open');
const plan = computed(() => ticketPlan(Number(t.value.stake), Number(t.value.accepted_odds)));
const suggestion = computed(() => suggestTicketOutcome(t.value.selections));
const dataAvailable = computed(() => t.value.selections.some((s) => s.result === 'pending' && realTotal(s) !== null));

const STATUS = computed(() => {
  if (t.value.status === 'open') return { label: 'Pendiente', cls: 'bg-marginal/15 text-marginal' };
  if (t.value.result === 'won') return { label: t.value.status === 'confirmed' ? 'Ganada · confirmada' : 'Ganada', cls: 'bg-value/15 text-value' };
  if (t.value.result === 'lost') return { label: t.value.status === 'confirmed' ? 'Perdida · confirmada' : 'Perdida', cls: 'bg-novalue/15 text-novalue' };
  return { label: 'Anulada', cls: 'bg-sunken text-ink/65' };
});

const LEG = {
  pending: { icon: ClockIcon, cls: 'text-ink/40', label: 'Pendiente' },
  won: { icon: CheckCircleIcon, cls: 'text-value', label: 'Acertó' },
  lost: { icon: XCircleIcon, cls: 'text-novalue', label: 'Falló' },
  void: { icon: MinusCircleIcon, cls: 'text-ink/50', label: 'Anulada' },
} as const satisfies Record<LegResult, object>;

// Liquidar: se elige el resultado real que muestra Betano y se confirma antes de mover dinero.
const choice = ref<'won' | 'lost' | 'void' | null>(null);
const realPayout = ref<number | null>(null);
const CHOICE_TEXT = { won: 'ganado', lost: 'perdido', void: 'anulado' } as const;

async function doSettle() {
  if (!choice.value) return;
  await settle.mutateAsync({ id: t.value.id, result: choice.value, payout: choice.value === 'won' ? realPayout.value : null });
  choice.value = null;
  realPayout.value = null;
}

const when = (iso: string) =>
  new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const money = (n: number) => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n))}`;
</script>

<template>
  <article class="card overflow-hidden">
    <header class="flex flex-wrap items-start justify-between gap-2 border-b border-line bg-sunken/60 px-4 py-3">
      <div>
        <p class="eyebrow">Boleto #{{ t.id }} · {{ when(t.placed_at) }}</p>
        <p class="font-extrabold">
          {{ t.kind === 'combo' ? `Combinada de ${t.selections.length}` : 'Apuesta simple' }}
          <span class="font-semibold text-ink/50">· <Betano /></span>
        </p>
      </div>
      <span class="rounded-full px-2.5 py-1 text-[11px] font-bold" :class="STATUS.cls">{{ STATUS.label }}</span>
    </header>

    <!-- Selecciones -->
    <ul class="divide-y divide-line">
      <li v-for="s in t.selections" :key="s.id" class="flex items-start gap-3 px-4 py-3 text-xs">
        <component :is="LEG[s.result].icon" class="mt-0.5 h-5 w-5 shrink-0" :class="LEG[s.result].cls" :aria-label="LEG[s.result].label" role="img" />
        <div class="min-w-0 flex-1">
          <p class="truncate font-bold">{{ s.match?.home?.name }} vs {{ s.match?.away?.name }}</p>
          <p class="text-sm font-extrabold text-brand">{{ selectionLabel(s.market, s.side, Number(s.line)) }}</p>
          <p class="text-ink/60">
            {{ s.match?.league?.name }}
            <template v-if="s.actual_value !== null || realTotal(s) !== null"> · {{ MARKET_LABEL[s.market].toLowerCase() }} reales: <strong class="num">{{ s.actual_value ?? realTotal(s) }}</strong></template>
            <template v-if="s.model_probability"> · modelo {{ (Number(s.model_probability) * 100).toFixed(0) }}%</template>
          </p>
        </div>
        <p class="num text-sm font-extrabold">{{ Number(s.odds).toFixed(2) }}</p>
      </li>
    </ul>

    <!-- Dinero: apostado, retorno y ganancia, por separado -->
    <dl class="grid grid-cols-2 gap-px bg-line text-xs md:grid-cols-4">
      <div class="bg-surface px-4 py-3"><dt class="text-ink/60">Importe apostado</dt><dd class="num text-base font-extrabold">{{ formatMoney(Number(t.stake)) }}</dd></div>
      <div class="bg-surface px-4 py-3">
        <dt class="text-ink/60">Cuota total{{ t.odds_edited ? ' (real)' : '' }}</dt>
        <dd class="num text-base font-extrabold">{{ Number(t.accepted_odds).toFixed(2) }}</dd>
        <dd v-if="t.odds_edited && t.computed_odds" class="text-[11px] text-ink/50">calculada {{ Number(t.computed_odds).toFixed(2) }}</dd>
      </div>
      <div class="bg-surface px-4 py-3">
        <dt class="text-ink/60">{{ isOpen ? 'Retorno potencial' : 'Retorno cobrado' }}</dt>
        <dd class="num text-base font-extrabold">{{ formatMoney(isOpen ? plan.potentialReturn : Number(t.payout ?? 0)) }}</dd>
      </div>
      <div class="bg-surface px-4 py-3">
        <dt class="text-ink/60">{{ isOpen ? 'Ganancia neta potencial' : 'Ganancia neta' }}</dt>
        <dd class="num text-base font-extrabold" :class="isOpen ? '' : Number(t.profit_loss) >= 0 ? 'text-value' : 'text-novalue'">
          {{ isOpen ? formatMoney(plan.potentialNet) : money(Number(t.profit_loss ?? 0)) }}
        </dd>
      </div>
    </dl>

    <!-- Acciones -->
    <div v-if="isOpen" class="space-y-3 border-t border-line p-4">
      <div class="flex flex-wrap items-center gap-2">
        <button v-if="dataAvailable" class="btn !min-h-9 text-xs" :disabled="applyLegs.isPending.value" @click="applyLegs.mutate(t)">
          Marcar selecciones con los datos de la base
        </button>
        <p v-if="suggestion !== 'pending'" class="text-xs text-ink/70">
          Según las selecciones, el boleto sería <strong>{{ suggestion === 'won' ? 'ganado' : suggestion === 'lost' ? 'perdido' : 'anulado' }}</strong>.
          Confírmalo con lo que muestra <Betano />.
        </p>
      </div>

      <div v-if="!choice" class="grid grid-cols-3 gap-2" role="group" aria-label="Resultado del boleto">
        <button class="btn" @click="choice = 'won'">Ganado</button>
        <button class="btn" @click="choice = 'lost'">Perdido</button>
        <button class="btn" @click="choice = 'void'">Anulado</button>
      </div>

      <div v-else class="space-y-2 rounded-lg bg-sunken p-3 text-xs" role="group" aria-label="Confirmar liquidación">
        <p class="font-bold">¿Marcar el boleto #{{ t.id }} como {{ CHOICE_TEXT[choice] }}?</p>
        <p v-if="choice === 'won'" class="text-ink/70">Se registra el retorno total y la ganancia neta. No se puede deshacer.</p>
        <p v-else-if="choice === 'lost'" class="text-ink/70">Queda registrada la pérdida de {{ formatMoney(Number(t.stake)) }}. No se puede deshacer.</p>
        <p v-else class="text-ink/70">Se devuelve el importe de {{ formatMoney(Number(t.stake)) }} a tu saldo. No se puede deshacer.</p>
        <label v-if="choice === 'won'" class="block space-y-1">
          <span class="font-semibold">Retorno real cobrado en <Betano /> (opcional)</span>
          <input v-model.number="realPayout" type="number" step="0.01" :min="Number(t.stake)" inputmode="decimal" class="field" :placeholder="`Calculado: ${plan.potentialReturn.toFixed(2)}`" />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn" @click="choice = null; realPayout = null">Cancelar</button>
          <button class="btn btn-primary" :disabled="settle.isPending.value" @click="doSettle">Confirmar</button>
        </div>
      </div>
      <p v-if="settle.isError.value || applyLegs.isError.value" role="alert" class="text-xs font-semibold text-novalue">
        {{ ((settle.error.value ?? applyLegs.error.value) as Error).message }}
      </p>
    </div>

    <div v-else-if="t.status === 'closed'" class="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs">
      <p class="text-ink/65">Liquidado el {{ when(t.settled_at ?? t.closed_at ?? t.placed_at) }}.</p>
      <button class="btn !min-h-9 text-xs" title="Marca que coincide con lo que muestra Betano" :disabled="confirm.isPending.value" @click="confirm.mutate(t.id)">
        Confirmar con <Betano />
      </button>
    </div>
  </article>
</template>
