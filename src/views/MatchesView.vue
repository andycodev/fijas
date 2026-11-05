<script setup lang="ts">
import FootballLoader from '../components/FootballLoader.vue';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MagnifyingGlassIcon } from '@heroicons/vue/24/outline';
import Betano from '../components/Betano.vue';
import EmptyState from '../components/EmptyState.vue';
import MatchPickCard from '../components/MatchPickCard.vue';
import PageHeader from '../components/PageHeader.vue';
import DayFilterChips from '../components/DayFilterChips.vue';
import { useMinProbability } from '../composables/useMinProbability';
import { filterByDay } from '../lib/dayFilter';
import { useFiltersStore } from '../stores/filters';
import { useOdds, useUpcomingMatches } from '../composables/usePicks';
import { useProfile } from '../composables/useProfile';
import { MARKET_LABEL } from '../lib/markets';
import type { Market, UpcomingMatch } from '../types/db';

const route = useRoute();
const router = useRouter();
const matches = useUpcomingMatches();
const profile = useProfile();
const filters = useFiltersStore(); // el filtro de fecha se comparte con Picks
const { minProbability } = useMinProbability();

const TABS: Market[] = ['goals_total', 'corners_total'];
const SLUG: Record<Market, string> = { goals_total: 'goles', corners_total: 'corners' };
const market = computed<Market>(() => (route.query.mercado === 'corners' ? 'corners_total' : 'goals_total'));
const selectMarket = (m: Market) => router.replace({ query: { ...route.query, mercado: SLUG[m] } });

// Solo se muestran las ligas activas (si aún no elegiste ninguna, todas).
const activeIds = computed(() => profile.data.value?.active_league_ids ?? []);
const activeMatches = computed(() => (matches.data.value ?? []).filter((m) => !activeIds.value.length || activeIds.value.includes(m.league_id)));

// Filtros
const league = ref('');
const team = ref('');
const showBelowMinimum = ref(false);
const cardMinimum = computed(() => (showBelowMinimum.value ? 0 : minProbability.value));

const sameDay = (iso: string, offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(iso).toDateString() === d.toDateString();
};
const leagues = computed(() => [...new Set(activeMatches.value.map((m) => m.league?.name).filter(Boolean))] as string[]);

// Por la fecha real del partido (hora local), sin partidos que ya empezaron y en orden cronológico.
const filtered = computed(() =>
  filterByDay(activeMatches.value, filters.day).filter((m) => {
    if (league.value && m.league?.name !== league.value) return false;
    const q = team.value.trim().toLowerCase();
    if (q && !`${m.home?.name} ${m.away?.name}`.toLowerCase().includes(q)) return false;
    return true;
  }),
);

// Un partido se muestra si, en este mercado, alguna selección (más de o menos de) llega a la probabilidad mínima.
const reachesMinimum = (m: UpcomingMatch) =>
  m.picks.some((p) => p.market === market.value && (Number(p.probability) >= cardMinimum.value || 1 - Number(p.probability) >= cardMinimum.value));
const withPicks = computed(() => filtered.value.filter(reachesMinimum));
const withoutPicks = computed(() => filtered.value.filter((m) => !reachesMinimum(m)));
const noHistory = (m: UpcomingMatch) => !m.picks.some((p) => p.market === market.value);

// Agrupados por día para leer el calendario de un vistazo
const dayLabel = (iso: string) => {
  if (sameDay(iso, 0)) return 'Hoy';
  if (sameDay(iso, 1)) return 'Mañana';
  return new Intl.DateTimeFormat('es', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(iso));
};
const groups = computed(() => {
  const map = new Map<string, UpcomingMatch[]>();
  for (const m of withPicks.value) {
    const k = dayLabel(m.kickoff_at);
    map.set(k, [...(map.get(k) ?? []), m]);
  }
  return [...map.entries()];
});

// Partidos por opción de fecha (todas las ligas activas; los filtros de liga y equipo se aplican aparte).
const dayStats = computed(() => ({
  today: { matches: filterByDay(activeMatches.value, 'today').length },
  tomorrow: { matches: filterByDay(activeMatches.value, 'tomorrow').length },
  all: { matches: filterByDay(activeMatches.value, 'all').length },
}));

const odds = useOdds(() => (matches.data.value ?? []).map((m) => m.id));
const threshold = computed(() => Number(profile.data.value?.value_threshold ?? 0.05));
const ready = computed(() => !matches.isLoading.value && !odds.isLoading.value && !profile.isLoading.value);
</script>

<template>
  <PageHeader title="Partidos" eyebrow="Calendario">
    <template #subtitle>Todos los partidos de tus ligas activas, con sus cuotas de <Betano /> y su análisis por línea.</template>
  </PageHeader>

  <div class="z-10 -mx-4 mb-4 md:sticky md:top-0 space-y-3 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
    <div role="tablist" class="inline-flex rounded-lg border border-line bg-sunken p-0.5">
      <button
        v-for="m in TABS"
        :key="m"
        role="tab"
        :aria-selected="market === m"
        class="inline-flex min-h-touch items-center rounded-md px-5 text-sm font-semibold transition-colors"
        :class="market === m ? 'bg-surface text-brand shadow-sm' : 'text-ink/60 hover:text-ink'"
        @click="selectMarket(m)"
      >
        {{ MARKET_LABEL[m] }}
      </button>
    </div>

    <DayFilterChips :stats="dayStats" />

    <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
      <select v-model="league" class="field" aria-label="Liga">
        <option value="">Todas las ligas</option>
        <option v-for="l in leagues" :key="l" :value="l">{{ l }}</option>
      </select>
      <div class="relative md:col-span-2">
        <MagnifyingGlassIcon class="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/40" aria-hidden="true" />
        <input v-model="team" type="search" placeholder="Buscar equipo" class="field !pl-10" aria-label="Equipo" />
      </div>
    </div>

    <label class="flex min-h-touch items-center gap-3 text-xs text-ink/70">
      <input v-model="showBelowMinimum" type="checkbox" class="h-5 w-5 accent-primary" />
      Mostrar también selecciones por debajo de {{ Math.round(minProbability * 100) }}% (solo consulta; no se recomiendan)
    </label>
  </div>

  <p v-if="matches.isError.value" role="alert" class="text-novalue">
    No se pudieron cargar los partidos. Si acabas de actualizar la app, ejecuta las migraciones pendientes en Supabase.
  </p>
  <FootballLoader v-else-if="!ready" size="sm" label="Cargando partidos…" />

  <template v-else>
    <EmptyState
      v-if="!withPicks.length"
      :message="`Ningún partido tiene selecciones de ${MARKET_LABEL[market].toLowerCase()} con ${Math.round(cardMinimum * 100)}% o más con estos filtros.`"
    />

    <div v-else class="space-y-6">
      <section v-for="[label, list] in groups" :key="label" :aria-label="label">
        <h2 class="eyebrow mb-2 capitalize">{{ label }} · {{ list.length }} partido{{ list.length === 1 ? '' : 's' }}</h2>
        <div class="grid gap-3 xl:grid-cols-2">
          <MatchPickCard
            v-for="m in list"
            :key="`${m.id}-${market}-${odds.data.value?.length ?? 0}`"
            :match="m"
            :market="market"
            :odds="(odds.data.value ?? []).filter((o) => o.match_id === m.id)"
            :threshold="threshold"
            :min-probability="cardMinimum"
          />
        </div>
      </section>
    </div>

    <details v-if="withoutPicks.length" class="card mt-6 p-4">
      <summary class="min-h-touch cursor-pointer font-bold">Sin selecciones que cumplan ({{ withoutPicks.length }})</summary>
      <p class="mb-3 text-xs text-ink/60">
        Ningún lado de ninguna línea llega al mínimo, o algún equipo no tiene al menos 8 partidos con datos (no se inventa una proyección).
      </p>
      <ul class="divide-y divide-line text-xs">
        <li v-for="m in withoutPicks" :key="m.id" class="flex flex-wrap items-center justify-between gap-2 py-2">
          <span><span class="text-ink/55">{{ m.league?.name }} ·</span> <strong>{{ m.home?.name }} vs {{ m.away?.name }}</strong></span>
          <span class="text-ink/55">{{ noHistory(m) ? 'sin historial suficiente' : 'bajo la probabilidad mínima' }}</span>
        </li>
      </ul>
    </details>
  </template>
</template>
