<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowPathIcon } from '@heroicons/vue/24/outline';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import MatchPickCard from '../components/MatchPickCard.vue';
import OpportunitiesPanel from '../components/OpportunitiesPanel.vue';
import { useOdds, useRefresh, useUpcomingMatches } from '../composables/usePicks';
import { useProfile } from '../composables/useProfile';
import { MARKET_LABEL } from '../lib/markets';
import type { Market } from '../types/db';

const route = useRoute();
const router = useRouter();
const matches = useUpcomingMatches();
const profile = useProfile();
const refresh = useRefresh();

const TABS: Market[] = ['goals_total', 'corners_total'];
const SLUG: Record<Market, string> = { goals_total: 'goles', corners_total: 'corners' };
const market = computed<Market>(() => (route.query.mercado === 'corners' ? 'corners_total' : 'goals_total'));
const selectMarket = (m: Market) => router.replace({ query: { ...route.query, mercado: SLUG[m] } });

// Filtros
const day = ref<'all' | 'today' | 'tomorrow'>('all');
const league = ref('');
const team = ref('');

const sameDay = (iso: string, offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(iso).toDateString() === d.toDateString();
};

const leagues = computed(() => [...new Set((matches.data.value ?? []).map((m) => m.league?.name).filter(Boolean))] as string[]);

const filtered = computed(() =>
  (matches.data.value ?? []).filter((m) => {
    if (day.value === 'today' && !sameDay(m.kickoff_at, 0)) return false;
    if (day.value === 'tomorrow' && !sameDay(m.kickoff_at, 1)) return false;
    if (league.value && m.league?.name !== league.value) return false;
    const q = team.value.trim().toLowerCase();
    if (q && !`${m.home?.name} ${m.away?.name}`.toLowerCase().includes(q)) return false;
    return true;
  }),
);

const withPicks = computed(() => filtered.value.filter((m) => m.picks.some((p) => p.market === market.value)));
const withoutPicks = computed(() => filtered.value.filter((m) => !m.picks.some((p) => p.market === market.value)));
const odds = useOdds(() => (matches.data.value ?? []).map((m) => m.id));
const threshold = computed(() => Number(profile.data.value?.value_threshold ?? 0.05));
const ready = computed(() => !matches.isLoading.value && !odds.isLoading.value && !profile.isLoading.value);
</script>

<template>
  <PageHeader title="Picks" subtitle="Partidos completos de hoy y mañana" />

  <div class="card mb-4 space-y-3 p-4">
    <button class="btn btn-primary w-full" :disabled="refresh.isPending.value" @click="refresh.mutate()">
      <ArrowPathIcon class="h-5 w-5" :class="{ 'animate-spin': refresh.isPending.value }" />
      {{ refresh.isPending.value ? 'Actualizando…' : 'Actualizar partidos y picks' }}
    </button>

    <p v-if="refresh.isError.value" role="alert" class="text-xs font-semibold text-novalue">
      {{ (refresh.error.value as Error).message }}
    </p>
    <p v-else-if="refresh.data.value" class="text-xs text-value">
      Listo: {{ refresh.data.value.summary.fixtures.saved }} partidos guardados,
      {{ refresh.data.value.summary.picks.matches }} con proyección. API-Football:
      {{ refresh.data.value.summary.fixtures.apiRequestsToday }}/90 solicitudes hoy. Cuotas de Betano:
      {{ refresh.data.value.summary.odds.withOdds }} partidos con cuotas, {{ refresh.data.value.summary.odds.without }} sin cuotas disponibles.
    </p>
    <p v-if="refresh.data.value?.summary.fixtures.unmatched.length" class="text-xs font-semibold text-marginal">
      Equipos sin unir: {{ refresh.data.value.summary.fixtures.unmatched.join(', ') }}
    </p>

    <p class="text-xs text-ink/60">
      <strong>Modelo</strong> es la probabilidad que calcula el modelo; <strong>Cuota justa</strong> es 1 / esa
      probabilidad y no es una cuota de Betano; <strong>Betano</strong> es la cuota de esa casa: la del proveedor (sin verificar) o la que tú escribes (confirmada). El modelo está bien
      calibrado pero supera por poco al promedio de la liga: un valor muy alto suele indicar una cuota mal leída.
    </p>
  </div>

  <OpportunitiesPanel v-if="ready" :matches="filtered" :odds="odds.data.value ?? []" :threshold="threshold" />

  <div role="tablist" class="mb-3 grid grid-cols-2 gap-2">
    <button
      v-for="m in TABS"
      :key="m"
      role="tab"
      :aria-selected="market === m"
      class="btn"
      :class="market === m ? '!border-value !text-value' : ''"
      @click="selectMarket(m)"
    >
      {{ MARKET_LABEL[m] }}
    </button>
  </div>

  <div class="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
    <select v-model="day" class="field" aria-label="Fecha">
      <option value="all">Hoy y mañana</option>
      <option value="today">Hoy</option>
      <option value="tomorrow">Mañana</option>
    </select>
    <select v-model="league" class="field" aria-label="Liga">
      <option value="">Todas las ligas</option>
      <option v-for="l in leagues" :key="l" :value="l">{{ l }}</option>
    </select>
    <input v-model="team" type="search" placeholder="Equipo" class="field col-span-2 md:col-span-1" aria-label="Equipo" />
  </div>

  <p v-if="matches.isError.value" role="alert" class="text-novalue">No se pudieron cargar los partidos.</p>
  <p v-else-if="!ready" class="text-ink/60">Cargando…</p>

  <template v-else>
    <EmptyState v-if="!withPicks.length" message="No hay picks con estos filtros. Prueba Actualizar o cambia los filtros." />
    <div v-else class="space-y-3">
      <MatchPickCard
        v-for="m in withPicks"
        :key="`${m.id}-${market}-${odds.data.value?.length ?? 0}`"
        :match="m"
        :market="market"
        :odds="(odds.data.value ?? []).filter((o) => o.match_id === m.id)"
        :threshold="threshold"
      />
    </div>

    <details v-if="withoutPicks.length" class="card mt-4 p-4">
      <summary class="min-h-touch cursor-pointer font-bold">Sin historial suficiente ({{ withoutPicks.length }})</summary>
      <p class="mb-2 text-xs text-ink/60">
        Alguno de los dos equipos no tiene al menos 8 partidos con datos en la base. No se inventa una proyección.
      </p>
      <ul class="space-y-1 text-xs">
        <li v-for="m in withoutPicks" :key="m.id">
          <span class="text-ink/60">{{ m.league?.name }} ·</span> {{ m.home?.name }} vs {{ m.away?.name }}
        </li>
      </ul>
    </details>
  </template>
</template>
