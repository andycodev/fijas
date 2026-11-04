<script setup lang="ts">
import Betano from '../components/Betano.vue';
import { computed, reactive, ref } from 'vue';
import { PlusIcon } from '@heroicons/vue/24/outline';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ManualBetDialog from '../components/ManualBetDialog.vue';
import { actualOf, realTotal, useBets, useCloseBet, useConfirmBet, useResolveBet } from '../composables/useBets';
import { betTotals, modelReport } from '../lib/finance';
import { formatMoney } from '../lib/format';
import { MARKET_LABEL, selectionLabel } from '../lib/markets';
import type { Bet } from '../types/db';

const bets = useBets();
const close = useCloseBet();
const resolve = useResolveBet();
const confirm = useConfirmBet();
const adding = ref(false);

const open = computed(() => (bets.data.value ?? []).filter((b) => b.status === 'open'));
const history = computed(() => (bets.data.value ?? []).filter((b) => b.status !== 'open'));
const totals = computed(() => betTotals(bets.data.value ?? []));
const winRate = computed(() => {
  const decided = (bets.data.value ?? []).filter((b) => (b.status === 'closed' || b.status === 'confirmed') && b.result !== 'void');
  return decided.length ? (decided.filter((b) => b.result === 'won').length / decided.length) * 100 : null;
});
const report = computed(() => modelReport(bets.data.value ?? []));

// Resultado real escrito a mano; si el partido ya terminó se sugiere el dato de la base.
const typed = reactive<Record<number, number | null>>({});
const valueFor = (b: Bet) => typed[b.id] ?? realTotal(b);

const sideLabel = (b: Bet) => selectionLabel(b.market, b.side, Number(b.line));
const matchLabel = (b: Bet) => `${b.match?.home?.name ?? '?'} vs ${b.match?.away?.name ?? '?'}`;
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const money = (n: number) => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n))}`;

const RESULT_LABEL = { won: 'Ganada', lost: 'Perdida', void: 'Reembolsada' } as const;
const RESULT_CLASS = { won: 'bg-value/10 text-value', lost: 'bg-novalue/10 text-novalue', void: 'bg-line text-ink/70' } as const;
const STATUS_LABEL = { open: 'Pendiente', closed: 'Cerrada', confirmed: 'Confirmada', void: 'Reembolsada' } as const;

function doClose(b: Bet) {
  const c = valueFor(b);
  if (c === null || c === undefined || c < 0) return;
  close.mutate({ bet: b, value: c });
}
</script>

<template>
  <div class="flex items-start justify-between gap-3">
    <PageHeader title="Apuestas">
      <template #subtitle>Registro y resultados en <Betano /></template>
    </PageHeader>
    <button class="btn btn-primary shrink-0" @click="adding = true"><PlusIcon class="h-5 w-5" />Nueva</button>
  </div>

  <section class="mb-4 grid grid-cols-3 gap-2">
    <div class="card p-3">
      <p class="text-[11px] font-semibold text-ink/60">Resultado neto</p>
      <p class="font-extrabold" :class="totals.net >= 0 ? 'text-value' : 'text-novalue'">{{ money(totals.net) }}</p>
    </div>
    <div class="card p-3">
      <p class="text-[11px] font-semibold text-ink/60">Retorno (ROI)</p>
      <p class="font-extrabold">{{ totals.roiPct === null ? '—' : `${totals.roiPct.toFixed(1)}%` }}</p>
    </div>
    <div class="card p-3">
      <p class="text-[11px] font-semibold text-ink/60">Acierto</p>
      <p class="font-extrabold">{{ winRate === null ? '—' : `${winRate.toFixed(0)}%` }}</p>
      <p class="text-[11px] text-ink/60">{{ totals.settledCount }} cerradas</p>
    </div>
  </section>

  <p v-if="bets.isError.value" role="alert" class="text-novalue">No se pudieron cargar tus apuestas.</p>
  <p v-else-if="bets.isLoading.value" class="text-ink/60">Cargando…</p>

  <template v-else>
    <h2 class="mb-2 font-bold">Pendientes ({{ open.length }})</h2>
    <EmptyState v-if="!open.length" message="No tienes apuestas pendientes. Regístrala con Nueva o desde Picks." />
    <div v-else class="space-y-3">
      <article v-for="b in open" :key="b.id" class="card space-y-3 p-4">
        <div>
          <p class="text-xs text-ink/60">{{ b.match?.league?.name }} · {{ b.match ? fmtDate(b.match.kickoff_at) : '' }}</p>
          <p class="font-bold">{{ matchLabel(b) }}</p>
          <p>
            {{ sideLabel(b) }} · cuota <strong>{{ Number(b.accepted_odds).toFixed(2) }}</strong> · monto
            <strong>{{ formatMoney(Number(b.stake)) }}</strong>
          </p>
          <p v-if="b.model_probability" class="text-xs text-ink/60">
            Modelo {{ (Number(b.model_probability) * 100).toFixed(1) }}% · cuota justa {{ (1 / Number(b.model_probability)).toFixed(2) }}
          </p>
        </div>

        <div class="grid grid-cols-3 gap-2" role="group" aria-label="Resultado">
          <button class="btn !px-2 text-xs" :disabled="resolve.isPending.value" @click="resolve.mutate({ bet: b, result: 'won' })">Ganada</button>
          <button class="btn !px-2 text-xs" :disabled="resolve.isPending.value" @click="resolve.mutate({ bet: b, result: 'lost' })">Perdida</button>
          <button class="btn !px-2 text-xs" :disabled="resolve.isPending.value" @click="resolve.mutate({ bet: b, result: 'void' })">Reembolsada</button>
        </div>

        <div v-if="realTotal(b) !== null || typed[b.id] !== undefined" class="flex items-end gap-2 border-t border-line pt-3">
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
            Cerrar con este dato
          </button>
        </div>
      </article>
    </div>

    <section v-if="report" class="card mt-6 space-y-2 p-4" aria-labelledby="model-title">
      <h2 id="model-title" class="font-bold">¿Está funcionando el modelo?</h2>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs md:grid-cols-4">
        <div><dt class="text-ink/60">Probabilidad prevista</dt><dd class="font-bold">{{ report.avgModelProbability.toFixed(1) }}%</dd></div>
        <div><dt class="text-ink/60">Acierto real</dt><dd class="font-bold">{{ report.winRate.toFixed(1) }}%</dd></div>
        <div><dt class="text-ink/60">Cuota justa media</dt><dd class="font-bold">{{ report.avgFairOdds.toFixed(2) }}</dd></div>
        <div><dt class="text-ink/60">Cuota usada media</dt><dd class="font-bold">{{ report.avgOddsUsed.toFixed(2) }}</dd></div>
        <div><dt class="text-ink/60">Retorno (ROI)</dt><dd class="font-bold">{{ report.roiPct === null ? '—' : `${report.roiPct.toFixed(1)}%` }}</dd></div>
        <div><dt class="text-ink/60">Error (Brier)</dt><dd class="font-bold">{{ report.brier }}</dd></div>
        <div><dt class="text-ink/60">Apuestas medidas</dt><dd class="font-bold">{{ report.n }}</dd></div>
      </dl>
      <p class="text-xs" :class="report.enough ? 'text-ink/60' : 'text-marginal'">
        {{ report.enough
          ? 'Si la probabilidad prevista y el acierto real se parecen, el modelo está bien calibrado.'
          : 'Con menos de 30 apuestas el azar domina: no saques conclusiones todavía.' }}
      </p>
    </section>

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
          <p v-if="b.model_probability" class="truncate text-[11px] text-ink/50">
            Modelo {{ (Number(b.model_probability) * 100).toFixed(1) }}% · justa {{ (1 / Number(b.model_probability)).toFixed(2) }} · usada {{ Number(b.accepted_odds).toFixed(2) }}
          </p>
        </div>
        <div class="text-right">
          <span v-if="b.result" class="inline-block rounded px-2 py-0.5 text-[11px] font-bold" :class="RESULT_CLASS[b.result]">
            {{ RESULT_LABEL[b.result] }}
          </span>
          <p v-if="b.profit_loss !== null" class="font-bold" :class="Number(b.profit_loss) >= 0 ? 'text-value' : 'text-novalue'">
            {{ money(Number(b.profit_loss)) }}
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

  <ManualBetDialog v-if="adding" @close="adding = false" />
</template>
