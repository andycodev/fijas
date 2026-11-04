<script setup lang="ts">
import { computed, reactive } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import { actualOf, realTotal, useBets, useCloseBet, useConfirmBet, useVoidBet } from '../composables/useBets';
import { formatMoney } from '../lib/format';
import { MARKET_LABEL, selectionLabel } from '../lib/markets';
import type { Bet } from '../types/db';

const bets = useBets();
const close = useCloseBet();
const voidBet = useVoidBet();
const confirm = useConfirmBet();

const open = computed(() => (bets.data.value ?? []).filter((b) => b.status === 'open'));
const history = computed(() => (bets.data.value ?? []).filter((b) => b.status !== 'open'));

// Resumen de apuestas con resultado (cerradas y confirmadas).
const summary = computed(() => {
  const settled = (bets.data.value ?? []).filter((b) => b.status === 'closed' || b.status === 'confirmed');
  const staked = settled.reduce((s, b) => s + Number(b.stake), 0);
  const profit = settled.reduce((s, b) => s + Number(b.profit_loss ?? 0), 0);
  const won = settled.filter((b) => b.result === 'won').length;
  return {
    count: settled.length,
    profit,
    roi: staked ? (profit / staked) * 100 : null,
    winRate: settled.length ? (won / settled.length) * 100 : null,
  };
});

// Córners escritos a mano; si el partido ya terminó se sugiere el dato real de la base.
const typed = reactive<Record<number, number | null>>({});
const valueFor = (b: Bet) => typed[b.id] ?? realTotal(b);

const sideLabel = (b: Bet) => selectionLabel(b.market, b.side, Number(b.line));
const matchLabel = (b: Bet) => `${b.match?.home?.name ?? '?'} vs ${b.match?.away?.name ?? '?'}`;
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const RESULT_LABEL = { won: 'Ganada', lost: 'Perdida', void: 'Anulada' } as const;
const RESULT_CLASS = { won: 'bg-value/10 text-value', lost: 'bg-novalue/10 text-novalue', void: 'bg-line text-ink/70' } as const;
const STATUS_LABEL = { open: 'Abierta', closed: 'Cerrada', confirmed: 'Confirmada', void: 'Anulada' } as const;

function doClose(b: Bet) {
  const c = valueFor(b);
  if (c === null || c === undefined || c < 0) return;
  close.mutate({ bet: b, value: c });
}
</script>

<template>
  <PageHeader title="Apuestas" subtitle="Tus apuestas registradas" />

  <section class="mb-4 grid grid-cols-3 gap-2">
    <div class="card p-3">
      <p class="text-[11px] font-semibold text-ink/60">Resultado</p>
      <p class="font-extrabold" :class="summary.profit >= 0 ? 'text-value' : 'text-novalue'">
        {{ summary.profit >= 0 ? '+' : '−' }}{{ formatMoney(Math.abs(summary.profit)) }}
      </p>
    </div>
    <div class="card p-3">
      <p class="text-[11px] font-semibold text-ink/60">Retorno (ROI)</p>
      <p class="font-extrabold">{{ summary.roi === null ? '—' : `${summary.roi.toFixed(1)}%` }}</p>
    </div>
    <div class="card p-3">
      <p class="text-[11px] font-semibold text-ink/60">Acierto</p>
      <p class="font-extrabold">{{ summary.winRate === null ? '—' : `${summary.winRate.toFixed(0)}%` }}</p>
      <p class="text-[11px] text-ink/60">{{ summary.count }} cerradas</p>
    </div>
  </section>

  <p v-if="bets.isError.value" role="alert" class="text-novalue">No se pudieron cargar tus apuestas.</p>
  <p v-else-if="bets.isLoading.value" class="text-ink/60">Cargando…</p>

  <template v-else>
    <h2 class="mb-2 font-bold">Abiertas ({{ open.length }})</h2>
    <EmptyState v-if="!open.length" message="No tienes apuestas abiertas. Regístralas desde Picks." />
    <div v-else class="space-y-3">
      <article v-for="b in open" :key="b.id" class="card space-y-3 p-4">
        <div>
          <p class="text-xs text-ink/60">{{ b.match?.league?.name }} · {{ b.match ? fmtDate(b.match.kickoff_at) : '' }}</p>
          <p class="font-bold">{{ matchLabel(b) }}</p>
          <p>
            {{ sideLabel(b) }} · cuota <strong>{{ Number(b.accepted_odds).toFixed(2) }}</strong> · monto
            <strong>{{ formatMoney(Number(b.stake)) }}</strong>
          </p>
        </div>

        <div class="flex items-end gap-2">
          <label class="block flex-1 space-y-1">
            <span class="text-xs font-semibold">
              {{ MARKET_LABEL[b.market] }} reales
              <span v-if="realTotal(b) !== null && typed[b.id] === undefined" class="font-normal text-value">(dato de la base)</span>
            </span>
            <input
              :value="valueFor(b) ?? ''"
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              class="field"
              @input="typed[b.id] = ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value)"
            />
          </label>
          <button class="btn btn-primary" :disabled="valueFor(b) === null || close.isPending.value" @click="doClose(b)">
            Cerrar
          </button>
          <button class="btn" :disabled="voidBet.isPending.value" @click="voidBet.mutate(b.id)">Anular</button>
        </div>
      </article>
    </div>

    <h2 class="mb-2 mt-6 font-bold">Historial ({{ history.length }})</h2>
    <EmptyState v-if="!history.length" message="Aún no hay apuestas cerradas." />
    <ul v-else class="card divide-y divide-line">
      <li v-for="b in history" :key="b.id" class="flex items-center gap-3 px-4 py-3">
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold">{{ matchLabel(b) }}</p>
          <p class="truncate text-xs text-ink/60">
            {{ sideLabel(b) }} @ {{ Number(b.accepted_odds).toFixed(2) }} · {{ formatMoney(Number(b.stake)) }}
            <span v-if="actualOf(b) !== null"> · {{ actualOf(b) }} {{ MARKET_LABEL[b.market].toLowerCase() }}</span>
            · {{ STATUS_LABEL[b.status] }}
          </p>
        </div>
        <div class="text-right">
          <span v-if="b.result" class="inline-block rounded px-2 py-0.5 text-[11px] font-bold" :class="RESULT_CLASS[b.result]">
            {{ RESULT_LABEL[b.result] }}
          </span>
          <p v-if="b.profit_loss !== null" class="font-bold" :class="Number(b.profit_loss) >= 0 ? 'text-value' : 'text-novalue'">
            {{ Number(b.profit_loss) >= 0 ? '+' : '−' }}{{ formatMoney(Math.abs(Number(b.profit_loss))) }}
          </p>
        </div>
        <button
          v-if="b.status === 'closed'"
          class="btn !px-3 text-xs"
          title="Marca que coincide con lo que muestra Betano"
          :disabled="confirm.isPending.value"
          @click="confirm.mutate(b.id)"
        >
          Confirmar
        </button>
      </li>
    </ul>
  </template>
</template>
