<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { PlusIcon } from '@heroicons/vue/24/outline';
import Betano from '../components/Betano.vue';
import EmptyState from '../components/EmptyState.vue';
import PageHeader from '../components/PageHeader.vue';
import TicketCard from '../components/TicketCard.vue';
import { useBankroll, useTickets } from '../composables/useTickets';
import { formatMoney } from '../lib/format';
import { summarizeTickets } from '../lib/tickets';
import { useBetSlipStore } from '../stores/betslip';

const tickets = useTickets();
const bankroll = useBankroll();
const slip = useBetSlipStore();

const list = computed(() => tickets.data.value ?? []);
const stats = computed(() => summarizeTickets(list.value));

const kind = ref<'all' | 'single' | 'combo'>('all');
const KINDS = [
  { value: 'all', label: 'Todos' },
  { value: 'single', label: 'Simples' },
  { value: 'combo', label: 'Combinadas' },
] as const;
const visible = computed(() => list.value.filter((t) => kind.value === 'all' || t.kind === kind.value));
const open = computed(() => visible.value.filter((t) => t.status === 'open'));
const history = computed(() => visible.value.filter((t) => t.status !== 'open'));

const money = (n: number) => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n))}`;
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);
</script>

<template>
  <PageHeader title="Mis apuestas" eyebrow="Mi control">
    <template #subtitle>Los boletos que realmente haces en <Betano />, simples o combinados.</template>
    <template #actions>
      <button class="btn btn-primary" @click="slip.open = true"><PlusIcon class="h-5 w-5" />Nuevo boleto</button>
    </template>
  </PageHeader>

  <!-- Saldo -->
  <RouterLink v-if="bankroll.data.value" :to="{ name: 'cash' }" class="card mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-xs transition-colors hover:border-accent">
    <span class="text-ink/60">Saldo disponible <strong class="num ml-1 text-base text-ink">{{ formatMoney(bankroll.data.value.available) }}</strong></span>
    <span class="text-ink/60">Comprometido en pendientes <strong class="num ml-1 text-base text-ink">{{ formatMoney(bankroll.data.value.committed) }}</strong></span>
    <span class="ml-auto font-semibold text-brand">Ver bankroll →</span>
  </RouterLink>

  <!-- Rendimiento de MIS apuestas (el del modelo se ve aparte, en Modelo) -->
  <section class="mb-6 space-y-3" aria-labelledby="perf-title">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="perf-title" class="text-lg font-extrabold">Mi rendimiento real</h2>
      <p class="text-xs text-ink/60">Tu dinero en <Betano />. La precisión del modelo se mide aparte: <RouterLink :to="{ name: 'model' }" class="font-semibold text-brand underline">ver Modelo</RouterLink>.</p>
    </div>

    <dl class="grid grid-cols-2 gap-2 md:grid-cols-5">
      <div class="card p-3"><dt class="text-[11px] font-semibold text-ink/60">Apostado</dt><dd class="num text-lg font-extrabold">{{ formatMoney(stats.all.staked) }}</dd><dd class="text-[11px] text-ink/50">{{ stats.all.tickets }} boletos</dd></div>
      <div class="card p-3"><dt class="text-[11px] font-semibold text-ink/60">Retorno cobrado</dt><dd class="num text-lg font-extrabold">{{ formatMoney(stats.all.returned) }}</dd><dd class="text-[11px] text-ink/50">incluye lo apostado</dd></div>
      <div class="card p-3"><dt class="text-[11px] font-semibold text-ink/60">Ganancia neta</dt><dd class="num text-lg font-extrabold" :class="stats.all.net >= 0 ? 'text-value' : 'text-novalue'">{{ money(stats.all.net) }}</dd><dd class="text-[11px] text-ink/50">retorno − apostado</dd></div>
      <div class="card p-3"><dt class="text-[11px] font-semibold text-ink/60">Rentabilidad</dt><dd class="num text-lg font-extrabold">{{ pct(stats.all.roi) }}</dd><dd class="text-[11px] text-ink/50">sobre lo liquidado</dd></div>
      <div class="card col-span-2 p-3 md:col-span-1">
        <dt class="text-[11px] font-semibold text-ink/60">Boletos</dt>
        <dd class="num text-sm font-bold">
          <span class="text-value">{{ stats.all.won }} ganados</span> ·
          <span class="text-novalue">{{ stats.all.lost }} perdidos</span><br />
          {{ stats.all.pending }} pendientes · {{ stats.all.voided }} anulados
        </dd>
      </div>
    </dl>

    <div class="card overflow-x-auto">
      <table class="w-full min-w-[26rem] text-left text-xs">
        <caption class="sr-only">Simples frente a combinadas</caption>
        <thead class="bg-sunken text-ink/60">
          <tr><th scope="col" class="px-3 py-2 font-semibold">Tipo</th><th scope="col" class="px-3 py-2 text-right font-semibold">Boletos</th><th scope="col" class="px-3 py-2 text-right font-semibold">Acierto</th><th scope="col" class="px-3 py-2 text-right font-semibold">Apostado</th><th scope="col" class="px-3 py-2 text-right font-semibold">Neto</th><th scope="col" class="px-3 py-2 text-right font-semibold">Rentab.</th></tr>
        </thead>
        <tbody class="divide-y divide-line">
          <tr v-for="row in [{ k: 'Simples', v: stats.singles }, { k: 'Combinadas', v: stats.combos }]" :key="row.k">
            <th scope="row" class="px-3 py-2 font-semibold">{{ row.k }}</th>
            <td class="num px-3 py-2 text-right">{{ row.v.tickets }}</td>
            <td class="num px-3 py-2 text-right">{{ pct(row.v.hitRate) }}</td>
            <td class="num px-3 py-2 text-right">{{ formatMoney(row.v.staked) }}</td>
            <td class="num px-3 py-2 text-right" :class="row.v.net >= 0 ? 'text-value' : 'text-novalue'">{{ money(row.v.net) }}</td>
            <td class="num px-3 py-2 text-right">{{ pct(row.v.roi) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="stats.all.won + stats.all.lost < 30" class="text-[11px] text-marginal">
      Con menos de 30 boletos liquidados el azar domina: no saques conclusiones todavía.
    </p>
  </section>

  <!-- Listas -->
  <div class="mb-3 inline-flex rounded-lg border border-line bg-sunken p-0.5" role="group" aria-label="Tipo de boleto">
    <button
      v-for="k in KINDS"
      :key="k.value"
      type="button"
      class="inline-flex min-h-touch items-center rounded-md px-4 text-xs font-semibold transition-colors"
      :class="kind === k.value ? 'bg-surface text-brand shadow-sm' : 'text-ink/60 hover:text-ink'"
      :aria-pressed="kind === k.value"
      @click="kind = k.value"
    >
      {{ k.label }}
    </button>
  </div>

  <p v-if="tickets.isError.value" role="alert" class="text-novalue">No se pudieron cargar tus boletos. Si acabas de actualizar la app, ejecuta la migración pendiente en Supabase.</p>
  <p v-else-if="tickets.isLoading.value" class="text-ink/60">Cargando…</p>

  <template v-else>
    <h2 class="mb-2 text-lg font-extrabold">Pendientes ({{ open.length }})</h2>
    <EmptyState v-if="!open.length" message="No tienes boletos pendientes. Arma uno desde Picks o con «Nuevo boleto»." />
    <div v-else class="grid gap-3 xl:grid-cols-2"><TicketCard v-for="t in open" :key="t.id" :ticket="t" /></div>

    <h2 class="mb-2 mt-8 text-lg font-extrabold">Historial ({{ history.length }})</h2>
    <EmptyState v-if="!history.length" message="Aún no hay boletos liquidados." />
    <div v-else class="grid gap-3 xl:grid-cols-2"><TicketCard v-for="t in history" :key="t.id" :ticket="t" /></div>
  </template>
</template>
