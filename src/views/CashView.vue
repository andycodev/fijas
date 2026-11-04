<script setup lang="ts">
import Betano from '../components/Betano.vue';
import { computed, reactive, ref } from 'vue';
import { TrashIcon } from '@heroicons/vue/24/outline';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import MonthlyChart from '../components/MonthlyChart.vue';
import { useCash } from '../composables/useCash';
import { useBets } from '../composables/useBets';
import { betTotals, capitalStatus, monthlySummaries, riskAlerts } from '../lib/finance';
import { formatDate, formatMoney } from '../lib/format';

const cash = useCash();
const bets = useBets();

const today = () => new Date().toISOString().slice(0, 10);
const form = reactive({ type: 'deposit' as 'deposit' | 'withdrawal', amount: null as number | null, occurred_on: today(), note: '' });
const betanoBalance = ref<number | null>(null);

const lastReconciliation = computed(() => cash.reconciliations.data.value?.[0] ?? null);

const initial = computed(() => Number(cash.profile.data.value?.initial_bankroll ?? 0));
const balance = computed(() => cash.balance.value);
const betList = computed(() => bets.data.value ?? []);
const totals = computed(() => betTotals(betList.value));
const status = computed(() => (balance.value === null ? null : capitalStatus(initial.value, balance.value)));
const months = computed(() => monthlySummaries(initial.value, cash.movements.data.value ?? [], betList.value));
const alerts = computed(() =>
  cash.profile.data.value && balance.value !== null
    ? riskAlerts({ settings: cash.profile.data.value, balance: balance.value, bets: betList.value })
    : [],
);
const monthsDesc = computed(() => [...months.value].reverse());

const money = (n: number) => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n))}`;
const monthName = (key: string) =>
  new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date(`${key}-15T12:00:00`));
const ALERT_CLASS = { info: 'text-ink/70', warn: 'text-marginal', stop: 'text-novalue' } as const;

async function submitMovement() {
  if (!form.amount) return;
  await cash.addMovement.mutateAsync({ type: form.type, amount: form.amount, occurred_on: form.occurred_on, note: form.note.trim() });
  form.amount = null;
  form.note = '';
}

async function submitReconciliation() {
  if (betanoBalance.value === null) return;
  await cash.addReconciliation.mutateAsync(betanoBalance.value);
  betanoBalance.value = null;
}

function diffClass(diff: number) {
  return Math.abs(diff) < 0.01 ? 'text-value' : 'text-novalue';
}
</script>

<template>
  <PageHeader title="Caja" subtitle="Tu capital, como un pequeño negocio" />

  <!-- Saldo y estado frente al capital protegido -->
  <section class="card mb-4 space-y-3 p-4" aria-labelledby="balance-title">
    <div>
      <p id="balance-title" class="text-xs font-semibold text-ink/60">Saldo disponible</p>
      <p class="text-3xl font-extrabold tracking-tight">{{ balance === null ? '—' : formatMoney(balance) }}</p>
      <p v-if="totals.openCount" class="text-xs text-ink/60">
        {{ formatMoney(totals.openStake) }} en juego en {{ totals.openCount }} apuesta{{ totals.openCount === 1 ? '' : 's' }} pendiente{{ totals.openCount === 1 ? '' : 's' }}
      </p>
    </div>

    <div v-if="status" class="flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <span
        class="rounded px-2 py-0.5 text-xs font-bold"
        :class="status.state === 'below' ? 'bg-novalue/10 text-novalue' : 'bg-value/10 text-value'"
      >
        <template v-if="status.state === 'above'">Por encima de tu capital: {{ money(status.diff) }}</template>
        <template v-else-if="status.state === 'below'">Por debajo de tu capital: {{ money(status.diff) }}</template>
        <template v-else>En tu capital inicial</template>
      </span>
      <span class="text-xs text-ink/60">
        Capital protegido {{ formatMoney(status.protectedCapital) }}
        <template v-if="status.state === 'above'"> + ganancia acumulada {{ formatMoney(status.diff) }}</template>
      </span>
    </div>
    <p v-if="initial === 0" class="text-xs font-semibold text-marginal">
      Define tu capital inicial en Ajustes para ver el seguimiento.
    </p>
  </section>

  <ul v-if="alerts.length" class="card mb-4 space-y-1 p-4" role="alert" aria-label="Alertas de protección del capital">
    <li v-for="a in alerts" :key="a.id" class="text-xs font-semibold" :class="ALERT_CLASS[a.level]">{{ a.message }}</li>
  </ul>

  <!-- Indicadores -->
  <section class="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3" aria-label="Indicadores">
    <div class="card p-3">
      <p class="text-[11px] font-semibold text-ink/60">Capital inicial</p>
      <p class="font-extrabold">{{ formatMoney(initial) }}</p>
    </div>
    <div class="card p-3">
      <p class="text-[11px] font-semibold text-ink/60">Total apostado</p>
      <p class="font-extrabold">{{ formatMoney(totals.totalStaked) }}</p>
    </div>
    <div class="card p-3">
      <p class="text-[11px] font-semibold text-ink/60">Ganancias</p>
      <p class="font-extrabold text-value">{{ formatMoney(totals.gains) }}</p>
    </div>
    <div class="card p-3">
      <p class="text-[11px] font-semibold text-ink/60">Pérdidas</p>
      <p class="font-extrabold text-novalue">{{ formatMoney(totals.losses) }}</p>
    </div>
    <div class="card p-3">
      <p class="text-[11px] font-semibold text-ink/60">Ganancia o pérdida neta</p>
      <p class="font-extrabold" :class="totals.net >= 0 ? 'text-value' : 'text-novalue'">{{ money(totals.net) }}</p>
    </div>
    <div class="card p-3">
      <p class="text-[11px] font-semibold text-ink/60">Rendimiento</p>
      <p class="font-extrabold">{{ totals.roiPct === null ? '—' : `${totals.roiPct.toFixed(1)}%` }}</p>
      <p class="text-[11px] text-ink/60">sobre lo apostado y cerrado</p>
    </div>
  </section>

  <!-- Meses -->
  <section class="card mb-4 space-y-3 p-4" aria-labelledby="months-title">
    <h2 id="months-title" class="font-bold">Evolución mensual</h2>
    <MonthlyChart :months="months" :base="initial" />

    <!-- Celular: una tarjeta por mes -->
    <ul class="space-y-2 md:hidden">
      <li v-for="m in monthsDesc" :key="m.key" class="rounded-lg border border-line bg-sunken p-3 text-xs">
        <div class="flex items-baseline justify-between gap-2">
          <p class="font-bold first-letter:uppercase">{{ monthName(m.key) }}</p>
          <p class="num text-base font-extrabold">{{ formatMoney(m.final) }}</p>
        </div>
        <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          <div class="flex justify-between"><dt class="text-ink/60">Inicio</dt><dd class="num">{{ formatMoney(m.start) }}</dd></div>
          <div class="flex justify-between"><dt class="text-ink/60">Rendimiento</dt><dd class="num">{{ m.returnPct === null ? '—' : m.returnPct.toFixed(1) + '%' }}</dd></div>
          <div class="flex justify-between"><dt class="text-ink/60">Ganancias</dt><dd class="num text-value">{{ formatMoney(m.gains) }}</dd></div>
          <div class="flex justify-between"><dt class="text-ink/60">Pérdidas</dt><dd class="num text-novalue">{{ formatMoney(m.losses) }}</dd></div>
          <div class="col-span-2 flex justify-between">
            <dt class="text-ink/60">Frente al mes anterior</dt>
            <dd class="num" :class="m.vsPreviousMonth === null ? '' : m.vsPreviousMonth >= 0 ? 'text-value' : 'text-novalue'">{{ m.vsPreviousMonth === null ? '—' : money(m.vsPreviousMonth) }}</dd>
          </div>
        </dl>
      </li>
    </ul>

    <!-- Pantallas anchas: tabla -->
    <div class="hidden overflow-x-auto md:block">
      <table class="w-full min-w-[34rem] text-left text-xs">
        <caption class="sr-only">Resumen por mes</caption>
        <thead class="text-ink/60">
          <tr>
            <th scope="col" class="py-1 pr-2 font-semibold">Mes</th>
            <th scope="col" class="py-1 pr-2 text-right font-semibold">Inicio</th>
            <th scope="col" class="py-1 pr-2 text-right font-semibold">Ganancias</th>
            <th scope="col" class="py-1 pr-2 text-right font-semibold">Pérdidas</th>
            <th scope="col" class="py-1 pr-2 text-right font-semibold">Final</th>
            <th scope="col" class="py-1 pr-2 text-right font-semibold">Rend.</th>
            <th scope="col" class="py-1 text-right font-semibold">vs mes anterior</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <tr v-for="m in monthsDesc" :key="m.key">
            <th scope="row" class="py-2 pr-2 font-semibold first-letter:uppercase">{{ monthName(m.key) }}</th>
            <td class="py-2 pr-2 text-right">{{ formatMoney(m.start) }}</td>
            <td class="py-2 pr-2 text-right text-value">{{ formatMoney(m.gains) }}</td>
            <td class="py-2 pr-2 text-right text-novalue">{{ formatMoney(m.losses) }}</td>
            <td class="py-2 pr-2 text-right font-bold">{{ formatMoney(m.final) }}</td>
            <td class="py-2 pr-2 text-right">{{ m.returnPct === null ? '—' : `${m.returnPct.toFixed(1)}%` }}</td>
            <td class="py-2 text-right" :class="m.vsPreviousMonth === null ? '' : m.vsPreviousMonth >= 0 ? 'text-value' : 'text-novalue'">
              {{ m.vsPreviousMonth === null ? '—' : money(m.vsPreviousMonth) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-ink/60">
      El saldo final de cada mes no cuenta apuestas aún pendientes. Las ganancias no son dinero asegurado y no hay garantía de
      que todos los meses sean positivos.
    </p>
  </section>

  <!-- Movimientos -->
  <form class="card mb-4 space-y-3 p-4" @submit.prevent="submitMovement">
    <h2 class="font-bold">Depósito o retiro</h2>

    <div class="grid grid-cols-2 gap-2">
      <label class="btn cursor-pointer has-[:checked]:border-primary has-[:checked]:text-brand">
        <input v-model="form.type" type="radio" value="deposit" class="sr-only" />
        Depósito
      </label>
      <label class="btn cursor-pointer has-[:checked]:border-primary has-[:checked]:text-brand">
        <input v-model="form.type" type="radio" value="withdrawal" class="sr-only" />
        Retiro
      </label>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label class="block space-y-1">
        <span class="text-xs font-semibold">Monto</span>
        <input v-model.number="form.amount" type="number" min="0.01" step="0.01" required class="field" />
      </label>
      <label class="block space-y-1">
        <span class="text-xs font-semibold">Fecha</span>
        <input v-model="form.occurred_on" type="date" required class="field" />
      </label>
    </div>

    <label class="block space-y-1">
      <span class="text-xs font-semibold">Nota (opcional)</span>
      <input v-model="form.note" type="text" maxlength="120" class="field" />
    </label>

    <p v-if="cash.addMovement.isError.value" role="alert" class="text-xs font-semibold text-novalue">
      No se pudo guardar el movimiento.
    </p>
    <button type="submit" class="btn btn-primary w-full" :disabled="cash.addMovement.isPending.value">Guardar</button>
  </form>

  <form class="card mb-4 space-y-3 p-4" @submit.prevent="submitReconciliation">
    <h2 class="font-bold">Conciliación con <Betano /></h2>
    <div class="flex gap-2">
      <label class="block flex-1 space-y-1">
        <span class="text-xs font-semibold">Saldo que muestra <Betano /></span>
        <input v-model.number="betanoBalance" type="number" step="0.01" required class="field" />
      </label>
      <button type="submit" class="btn self-end" :disabled="cash.balance.value === null || cash.addReconciliation.isPending.value">
        Conciliar
      </button>
    </div>
    <p v-if="lastReconciliation" class="text-xs">
      Última ({{ formatDate(lastReconciliation.checked_on) }}): diferencia
      <strong :class="diffClass(lastReconciliation.difference)">{{ formatMoney(lastReconciliation.difference) }}</strong>
      (<Betano /> {{ formatMoney(lastReconciliation.betano_balance) }} vs calculado {{ formatMoney(lastReconciliation.calculated_balance) }})
    </p>
  </form>

  <h2 class="mb-2 font-bold">Movimientos</h2>
  <EmptyState v-if="!cash.movements.data.value?.length" message="Aún no hay depósitos ni retiros." />
  <ul v-else class="card divide-y divide-line">
    <li v-for="m in cash.movements.data.value" :key="m.id" class="flex items-center gap-3 px-4 py-2">
      <div class="min-w-0 flex-1">
        <p class="font-semibold">{{ m.type === 'deposit' ? 'Depósito' : 'Retiro' }}</p>
        <p class="truncate text-xs text-ink/60">{{ formatDate(m.occurred_on) }}<span v-if="m.note"> · {{ m.note }}</span></p>
      </div>
      <span class="font-bold" :class="m.type === 'deposit' ? 'text-value' : 'text-novalue'">
        {{ m.type === 'deposit' ? '+' : '−' }}{{ formatMoney(m.amount) }}
      </span>
      <button
        class="btn !border-transparent !px-2"
        aria-label="Eliminar movimiento"
        :disabled="cash.removeMovement.isPending.value"
        @click="cash.removeMovement.mutate(m.id)"
      >
        <TrashIcon class="h-5 w-5" />
      </button>
    </li>
  </ul>
</template>
