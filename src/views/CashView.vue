<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { TrashIcon } from '@heroicons/vue/24/outline';
import Betano from '../components/Betano.vue';
import EmptyState from '../components/EmptyState.vue';
import MonthlyChart from '../components/MonthlyChart.vue';
import PageHeader from '../components/PageHeader.vue';
import { useCash } from '../composables/useCash';
import { useTickets } from '../composables/useTickets';
import { capitalStatus, monthlySummaries, riskAlerts } from '../lib/finance';
import { toFinBet } from '../lib/finbet';
import { formatDate, formatMoney } from '../lib/format';
import type { LedgerType } from '../types/db';

const cash = useCash();
const tickets = useTickets();

const today = () => new Date().toISOString().slice(0, 10);
const form = reactive({ type: 'deposit' as 'deposit' | 'withdrawal', amount: null as number | null, occurred_on: today(), note: '' });
const betanoBalance = ref<number | null>(null);
const showAllLedger = ref(false);

const b = computed(() => cash.bankroll.data.value ?? null);
const initial = computed(() => b.value?.initial ?? Number(cash.profile.data.value?.initial_bankroll ?? 0));
const lastReconciliation = computed(() => cash.reconciliations.data.value?.[0] ?? null);

// Frente al capital inicial se compara lo que es tuyo: disponible + lo comprometido en boletos pendientes.
const status = computed(() => (b.value ? capitalStatus(initial.value, b.value.equity) : null));

const ticketList = computed(() => tickets.data.value ?? []);
const ledger = computed(() => cash.movements.data.value ?? []);
const months = computed(() =>
  monthlySummaries(
    initial.value,
    ledger.value.filter((m) => m.type === 'deposit' || m.type === 'withdrawal').map((m) => ({ type: m.type as 'deposit' | 'withdrawal', amount: m.amount, occurred_on: m.occurred_on })),
    ticketList.value.map(toFinBet),
  ),
);
const monthsDesc = computed(() => [...months.value].reverse());
const alerts = computed(() =>
  cash.profile.data.value && b.value
    ? riskAlerts({ settings: cash.profile.data.value, balance: b.value.available, bets: ticketList.value.map(toFinBet) })
    : [],
);

const money = (n: number) => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n))}`;
const monthName = (key: string) => new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date(`${key}-15T12:00:00`));
const ALERT_CLASS = { info: 'text-ink/70', warn: 'text-marginal', stop: 'text-novalue' } as const;

// Historial de transacciones: cada movimiento del bankroll, con su signo.
const LEDGER: Record<LedgerType, { label: string; sign: 1 | -1 }> = {
  deposit: { label: 'Depósito', sign: 1 },
  withdrawal: { label: 'Retiro', sign: -1 },
  stake: { label: 'Importe apostado', sign: -1 },
  payout: { label: 'Retorno cobrado', sign: 1 },
  refund: { label: 'Devolución (anulado)', sign: 1 },
};
const shownLedger = computed(() => (showAllLedger.value ? ledger.value : ledger.value.slice(0, 15)));

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
const diffClass = (diff: number) => (Math.abs(diff) < 0.01 ? 'text-value' : 'text-novalue');
</script>

<template>
  <PageHeader title="Caja" eyebrow="Bankroll">
    <template #subtitle>Tu capital, como un pequeño negocio: lo que tienes, lo que arriesgas y lo que has ganado o perdido.</template>
  </PageHeader>

  <p v-if="cash.bankroll.isError.value" role="alert" class="mb-4 text-novalue">
    No se pudo cargar el bankroll. Si acabas de actualizar la app, ejecuta la migración pendiente en Supabase.
  </p>

  <!-- Saldo -->
  <section class="card pitch mb-4 grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]" aria-labelledby="balance-title">
    <div class="space-y-2">
      <p id="balance-title" class="eyebrow text-brand">Saldo disponible</p>
      <p class="num text-5xl font-extrabold leading-none tracking-tight">{{ b ? formatMoney(b.available) : '—' }}</p>
      <p class="text-xs text-ink/65">
        Es lo que puedes usar ahora y lo que <Betano /> muestra como saldo. No incluye el dinero de los boletos pendientes.
      </p>
      <div v-if="status && b" class="flex flex-wrap items-center gap-2 pt-1">
        <span class="rounded-full px-2.5 py-1 text-xs font-bold" :class="status.state === 'below' ? 'bg-novalue/15 text-novalue' : 'bg-value/15 text-value'">
          <template v-if="status.state === 'above'">Por encima de tu capital: {{ money(status.diff) }}</template>
          <template v-else-if="status.state === 'below'">Por debajo de tu capital: {{ money(status.diff) }}</template>
          <template v-else>En tu capital inicial</template>
        </span>
        <span class="text-[11px] text-ink/55">frente a {{ formatMoney(initial) }} de capital inicial</span>
      </div>
    </div>

    <dl class="grid grid-cols-2 gap-2 text-xs">
      <div class="rounded-lg bg-sunken p-3"><dt class="text-ink/60">Capital inicial</dt><dd class="num text-lg font-extrabold">{{ formatMoney(initial) }}</dd></div>
      <div class="rounded-lg bg-sunken p-3">
        <dt class="text-ink/60">Comprometido en pendientes</dt>
        <dd class="num text-lg font-extrabold">{{ b ? formatMoney(b.committed) : '—' }}</dd>
        <dd class="text-[11px] text-ink/50">ya descontado del disponible</dd>
      </div>
      <div class="col-span-2 rounded-lg bg-tint/45 p-3">
        <dt class="text-ink/60">Total tuyo (disponible + comprometido)</dt>
        <dd class="num text-lg font-extrabold text-brand">{{ b ? formatMoney(b.equity) : '—' }}</dd>
      </div>
    </dl>
  </section>

  <ul v-if="alerts.length" class="card mb-4 space-y-1 p-4" role="alert" aria-label="Alertas de protección del capital">
    <li v-for="a in alerts" :key="a.id" class="text-xs font-semibold" :class="ALERT_CLASS[a.level]">{{ a.message }}</li>
  </ul>

  <!-- Apostado, retorno y ganancia: tres cosas distintas -->
  <section class="mb-4 space-y-2" aria-labelledby="flow-title">
    <h2 id="flow-title" class="text-lg font-extrabold">Apostado, retorno y ganancia</h2>
    <div class="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
      <div class="card p-3"><p class="text-[11px] font-semibold text-ink/60">Dinero apostado</p><p class="num text-lg font-extrabold">{{ b ? formatMoney(b.total_staked) : '—' }}</p><p class="text-[11px] text-ink/50">boletos no anulados</p></div>
      <div class="card p-3"><p class="text-[11px] font-semibold text-ink/60">Retorno cobrado</p><p class="num text-lg font-extrabold">{{ b ? formatMoney(b.total_returned) : '—' }}</p><p class="text-[11px] text-ink/50">incluye lo apostado</p></div>
      <div class="card p-3"><p class="text-[11px] font-semibold text-ink/60">Ganancias</p><p class="num text-lg font-extrabold text-value">{{ b ? formatMoney(b.gains) : '—' }}</p></div>
      <div class="card p-3"><p class="text-[11px] font-semibold text-ink/60">Pérdidas</p><p class="num text-lg font-extrabold text-novalue">{{ b ? formatMoney(b.losses) : '—' }}</p></div>
      <div class="card p-3"><p class="text-[11px] font-semibold text-ink/60">Beneficio neto</p><p class="num text-lg font-extrabold" :class="(b?.net ?? 0) >= 0 ? 'text-value' : 'text-novalue'">{{ b ? money(b.net) : '—' }}</p></div>
      <div class="card p-3"><p class="text-[11px] font-semibold text-ink/60">Rentabilidad</p><p class="num text-lg font-extrabold">{{ b?.roi == null ? '—' : `${b.roi.toFixed(1)}%` }}</p><p class="text-[11px] text-ink/50">sobre lo liquidado</p></div>
    </div>
    <p class="text-[11px] text-ink/55">
      Retorno = lo que cobras al ganar (importe + ganancia). Ganancia neta = retorno − importe. Cada boleto descuenta su importe una sola vez, tenga una o varias selecciones.
      Tu rendimiento por boleto está en <RouterLink :to="{ name: 'bets' }" class="font-semibold text-brand underline">Mis apuestas</RouterLink>.
    </p>
  </section>

  <!-- Meses -->
  <section class="card mb-4 space-y-3 p-4" aria-labelledby="months-title">
    <h2 id="months-title" class="font-bold">Evolución mensual</h2>
    <MonthlyChart :months="months" :base="initial" />

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
            <td class="num py-2 pr-2 text-right">{{ formatMoney(m.start) }}</td>
            <td class="num py-2 pr-2 text-right text-value">{{ formatMoney(m.gains) }}</td>
            <td class="num py-2 pr-2 text-right text-novalue">{{ formatMoney(m.losses) }}</td>
            <td class="num py-2 pr-2 text-right font-bold">{{ formatMoney(m.final) }}</td>
            <td class="num py-2 pr-2 text-right">{{ m.returnPct === null ? '—' : `${m.returnPct.toFixed(1)}%` }}</td>
            <td class="num py-2 text-right" :class="m.vsPreviousMonth === null ? '' : m.vsPreviousMonth >= 0 ? 'text-value' : 'text-novalue'">{{ m.vsPreviousMonth === null ? '—' : money(m.vsPreviousMonth) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-ink/60">
      El saldo final de cada mes no cuenta boletos aún pendientes. Las ganancias no son dinero asegurado y no hay garantía de que todos los meses sean positivos.
    </p>
  </section>

  <div class="grid gap-4 lg:grid-cols-2">
    <form class="card space-y-3 p-4" @submit.prevent="submitMovement">
      <h2 class="font-bold">Depósito o retiro</h2>
      <div class="grid grid-cols-2 gap-2">
        <label class="btn cursor-pointer has-[:checked]:border-primary has-[:checked]:text-brand"><input v-model="form.type" type="radio" value="deposit" class="sr-only" />Depósito</label>
        <label class="btn cursor-pointer has-[:checked]:border-primary has-[:checked]:text-brand"><input v-model="form.type" type="radio" value="withdrawal" class="sr-only" />Retiro</label>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <label class="block space-y-1"><span class="text-xs font-semibold">Monto</span><input v-model.number="form.amount" type="number" min="0.01" step="0.01" required class="field" /></label>
        <label class="block space-y-1"><span class="text-xs font-semibold">Fecha</span><input v-model="form.occurred_on" type="date" required class="field" /></label>
      </div>
      <label class="block space-y-1"><span class="text-xs font-semibold">Nota (opcional)</span><input v-model="form.note" type="text" maxlength="120" class="field" /></label>
      <p v-if="cash.addMovement.isError.value" role="alert" class="text-xs font-semibold text-novalue">No se pudo guardar el movimiento.</p>
      <button type="submit" class="btn btn-primary w-full" :disabled="cash.addMovement.isPending.value">Guardar</button>
    </form>

    <form class="card space-y-3 p-4" @submit.prevent="submitReconciliation">
      <h2 class="font-bold">Conciliación con <Betano /></h2>
      <div class="flex gap-2">
        <label class="block flex-1 space-y-1"><span class="text-xs font-semibold">Saldo que muestra <Betano /></span><input v-model.number="betanoBalance" type="number" step="0.01" required class="field" /></label>
        <button type="submit" class="btn self-end" :disabled="cash.balance.value === null || cash.addReconciliation.isPending.value">Conciliar</button>
      </div>
      <p v-if="lastReconciliation" class="text-xs">
        Última ({{ formatDate(lastReconciliation.checked_on) }}): diferencia
        <strong :class="diffClass(lastReconciliation.difference)">{{ formatMoney(lastReconciliation.difference) }}</strong>
        (<Betano /> {{ formatMoney(lastReconciliation.betano_balance) }} vs calculado {{ formatMoney(lastReconciliation.calculated_balance) }})
      </p>
    </form>
  </div>

  <!-- Historial de transacciones -->
  <section class="mt-6" aria-labelledby="ledger-title">
    <h2 id="ledger-title" class="mb-2 text-lg font-extrabold">Historial de transacciones</h2>
    <EmptyState v-if="!ledger.length" message="Aún no hay movimientos." />
    <template v-else>
      <ul class="card divide-y divide-line">
        <li v-for="m in shownLedger" :key="m.id" class="flex items-center gap-3 px-4 py-2.5 text-xs">
          <div class="min-w-0 flex-1">
            <p class="font-semibold">{{ LEDGER[m.type].label }}<span v-if="m.bet_id" class="text-ink/50"> · boleto #{{ m.bet_id }}</span></p>
            <p class="truncate text-ink/60">{{ formatDate(m.occurred_on) }}<span v-if="m.note && !m.bet_id"> · {{ m.note }}</span></p>
          </div>
          <span class="num text-sm font-bold" :class="LEDGER[m.type].sign > 0 ? 'text-value' : 'text-ink'">{{ LEDGER[m.type].sign > 0 ? '+' : '−' }}{{ formatMoney(m.amount) }}</span>
          <button
            v-if="m.type === 'deposit' || m.type === 'withdrawal'"
            class="btn !min-h-9 !border-transparent !px-2"
            aria-label="Eliminar movimiento"
            :disabled="cash.removeMovement.isPending.value"
            @click="cash.removeMovement.mutate(m.id)"
          >
            <TrashIcon class="h-4 w-4" />
          </button>
        </li>
      </ul>
      <button v-if="ledger.length > 15" class="btn mt-2 w-full" @click="showAllLedger = !showAllLedger">
        {{ showAllLedger ? 'Ver menos' : `Ver los ${ledger.length - 15} restantes` }}
      </button>
    </template>
  </section>
</template>
