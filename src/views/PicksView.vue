<script setup lang="ts">
import FootballLoader from '../components/FootballLoader.vue';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { ChevronDownIcon, FunnelIcon, Squares2X2Icon, TableCellsIcon } from '@heroicons/vue/24/outline';
import AnalyzeBar from '../components/AnalyzeBar.vue';
import Betano from '../components/Betano.vue';
import DayFilterChips from '../components/DayFilterChips.vue';
import EmptyState from '../components/EmptyState.vue';
import MarketFilter from '../components/MarketFilter.vue';
import ModelTrustCard from '../components/ModelTrustCard.vue';
import OpportunityCard from '../components/OpportunityCard.vue';
import PageHeader from '../components/PageHeader.vue';
import PicksSummary from '../components/PicksSummary.vue';
import RecommendationsTable from '../components/RecommendationsTable.vue';
import { useMediaQuery } from '../composables/useMediaQuery';
import { useMinProbability } from '../composables/useMinProbability';
import { useOdds, useUpcomingMatches } from '../composables/usePicks';
import { useProfile } from '../composables/useProfile';
import { DAY_LABEL, filterByDay, type DayFilter } from '../lib/dayFilter';
import { selectionLabel } from '../lib/markets';
import { analyze, type Selection } from '../lib/opportunities';
import { useFiltersStore } from '../stores/filters';
import { usePicksViewStore } from '../stores/picksView';
import type { Market } from '../types/db';

const matches = useUpcomingMatches();
const profile = useProfile();
const filters = useFiltersStore();
const view = usePicksViewStore();
const isWide = useMediaQuery('(min-width: 768px)'); // la tabla densa solo cabe desde tablet; en móvil se usan las tarjetas
const { minProbability, setMinProbability } = useMinProbability();

// Solo se analizan las ligas activas (si aún no elegiste ninguna, todas).
const activeIds = computed(() => profile.data.value?.active_league_ids ?? []);
const activeMatches = computed(() => (matches.data.value ?? []).filter((m) => !activeIds.value.length || activeIds.value.includes(m.league_id)));
const odds = useOdds(() => (matches.data.value ?? []).map((m) => m.id));
const threshold = computed(() => Number(profile.data.value?.value_threshold ?? 0.05));
const ready = computed(() => !matches.isLoading.value && !odds.isLoading.value && !profile.isLoading.value);

// Filtro de fecha por la fecha real del partido (hora local), sin partidos que ya empezaron, en orden cronológico.
const dayMatches = computed(() => filterByDay(activeMatches.value, filters.day));
// Por cada opción: partidos, partidos con análisis y recomendaciones (con los mismos filtros que la pantalla).
const DAYS: DayFilter[] = ['today', 'tomorrow', 'all'];
const dayStats = computed(() =>
  Object.fromEntries(
    DAYS.map((d) => {
      const ms = filterByDay(activeMatches.value, d);
      const a = analyze(ms, odds.data.value ?? [], { minProbability: minProbability.value, valueThreshold: threshold.value });
      return [d, { matches: ms.length, analyzed: a.matchesAnalyzed, recommended: a.recommended.length }];
    }),
  ) as Record<DayFilter, { matches: number; analyzed: number; recommended: number }>,
);

const analysis = computed(() =>
  analyze(dayMatches.value, odds.data.value ?? [], { minProbability: minProbability.value, valueThreshold: threshold.value }),
);

// Cronológico primero (lo que se juega antes), y a igual hora, lo de mayor valor.
const byKickoff = (a: Selection, b: Selection) =>
  Date.parse(a.match.kickoff_at) - Date.parse(b.match.kickoff_at) || (b.ev ?? 0) - (a.ev ?? 0);

const marketFilter = ref<'all' | Market>('all');
const filtersOpen = ref(false); // en pantallas pequeñas, mercado y resumen van en un panel desplegable
const recommended = computed(() =>
  analysis.value.recommended.filter((s) => marketFilter.value === 'all' || s.market === marketFilter.value).sort(byKickoff),
);
const noValue = computed(() => [...analysis.value.highProbabilityNoValue].sort(byKickoff));
const noOdds = computed(() => [...analysis.value.highProbabilityNoOdds].sort(byKickoff));
const countOf = (m: 'all' | Market) => analysis.value.recommended.filter((s) => m === 'all' || s.market === m).length;
const marketCounts = computed(() => ({ all: countOf('all'), goals_total: countOf('goals_total'), corners_total: countOf('corners_total') }));

const when = (iso: string) =>
  new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const evText = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)}%`;
const emptyDayMessage = computed(() =>
  filters.day === 'all'
    ? 'No hay partidos próximos en tus ligas activas. Pulsa Analizar para traer los de hoy y mañana.'
    : `No hay partidos ${DAY_LABEL[filters.day].toLowerCase()} en tus ligas activas.`,
);
</script>

<template>
  <PageHeader title="Picks" eyebrow="Análisis">
    <template #subtitle>Oportunidades de goles y córners de partido completo frente a la cuota de <Betano />.</template>
  </PageHeader>

  <AnalyzeBar />

  <p v-if="matches.isError.value" role="alert" class="text-novalue">
    No se pudieron cargar los partidos. Si acabas de actualizar la app, ejecuta las migraciones pendientes en Supabase.
  </p>
  <FootballLoader v-else-if="!ready" size="sm" label="Cargando partidos y cuotas…" />

  <div v-else class="space-y-stack">
    <!-- Barra de filtros fija: día, mercado y forma de ver las recomendaciones (en móvil, un panel desplegable) -->
    <div class="sticky-bar">
      <div v-if="isWide" class="flex flex-wrap items-start gap-x-4 gap-y-stack-sm">
        <DayFilterChips :stats="dayStats" class="min-w-0 flex-1" />
        <MarketFilter v-model="marketFilter" :counts="marketCounts" />
        <div class="inline-flex rounded-ctl border border-line bg-sunken p-0.5" role="group" aria-label="Forma de ver las recomendaciones">
          <button
            type="button"
            class="inline-flex min-h-touch items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors"
            :class="view.mode === 'cards' ? 'bg-surface text-brand shadow-sm' : 'text-ink/60 hover:text-ink'"
            :aria-pressed="view.mode === 'cards'"
            @click="view.mode = 'cards'"
          >
            <Squares2X2Icon class="h-4 w-4" aria-hidden="true" />Tarjetas
          </button>
          <button
            type="button"
            class="inline-flex min-h-touch items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors"
            :class="view.mode === 'table' ? 'bg-surface text-brand shadow-sm' : 'text-ink/60 hover:text-ink'"
            :aria-pressed="view.mode === 'table'"
            @click="view.mode = 'table'"
          >
            <TableCellsIcon class="h-4 w-4" aria-hidden="true" />Tabla
          </button>
        </div>
      </div>

      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-stack-sm">
          <DayFilterChips :stats="dayStats" bare />
          <button type="button" class="btn !px-2.5 text-xs" :aria-expanded="filtersOpen" aria-controls="picks-filters" @click="filtersOpen = !filtersOpen">
            <FunnelIcon class="h-4 w-4" aria-hidden="true" />Filtros
            <ChevronDownIcon class="h-4 w-4 transition-transform" :class="{ 'rotate-180': filtersOpen }" aria-hidden="true" />
          </button>
        </div>
        <div v-if="filtersOpen" id="picks-filters" class="mt-stack-sm space-y-stack-sm">
          <DayFilterChips :stats="dayStats" summary-only />
          <MarketFilter v-model="marketFilter" :counts="marketCounts" />
        </div>
      </template>
    </div>

    <EmptyState v-if="!dayMatches.length" :message="emptyDayMessage" />

    <template v-else>
      <PicksSummary
        :analysis="analysis"
        :min-probability="minProbability"
        :value-threshold="threshold"
        @update:min-probability="setMinProbability"
      />

      <!-- Recomendaciones -->
      <section aria-labelledby="recs-title" class="space-y-stack-sm">
        <h2 id="recs-title" class="text-base font-extrabold">Recomendaciones <span class="text-sm font-semibold text-ink/50">· {{ DAY_LABEL[filters.day].toLowerCase() }}</span></h2>

        <EmptyState v-if="!recommended.length" message="No se encontraron oportunidades que cumplan los criterios. No se fuerzan recomendaciones.">
          <p class="max-w-md text-xs text-ink/55">
            Criterios: {{ Math.round(minProbability * 100) }}% o más de probabilidad, cuota de <Betano /> disponible y valor esperado de
            {{ (threshold * 100).toFixed(1) }}% o más. Si quieres ver más partidos, revisa
            <RouterLink :to="{ name: 'matches' }" class="font-semibold text-brand underline">Partidos</RouterLink>.
          </p>
        </EmptyState>
        <RecommendationsTable v-else-if="view.mode === 'table' && isWide" :selections="recommended" :threshold="threshold" :min-probability="minProbability" />
        <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(18.5rem,1fr))] items-start gap-stack">
          <OpportunityCard v-for="s in recommended" :key="s.key" :selection="s" :threshold="threshold" :min-probability="minProbability" />
        </div>
      </section>

      <!-- Probables pero sin valor -->
      <details v-if="noValue.length" class="card px-pad py-1">
        <summary class="flex min-h-touch cursor-pointer items-center font-bold"><span>Probables, pero sin valor ({{ noValue.length }}) <span class="text-xs font-semibold text-ink/50">· {{ DAY_LABEL[filters.day].toLowerCase() }}</span></span></summary>
        <p class="mb-stack-sm text-xs text-ink/60">
          Cumplen {{ Math.round(minProbability * 100) }}% o más, pero <Betano /> paga menos de lo que necesitarían. Acertar a menudo no basta si la cuota no compensa.
        </p>
        <ul class="divide-y divide-line text-xs">
          <li v-for="s in noValue" :key="s.key" class="flex flex-wrap items-center justify-between gap-2 py-stack-sm">
            <div class="min-w-0">
              <p class="font-bold">{{ selectionLabel(s.market, s.side, s.line) }}</p>
              <p class="text-ink/60">{{ s.match.home?.name }} vs {{ s.match.away?.name }} · {{ when(s.match.kickoff_at) }}</p>
            </div>
            <p class="num text-right text-ink/70">
              Modelo {{ pct(s.probability) }} · <Betano /> paga {{ s.betano!.odds.toFixed(2) }}, necesitaría {{ ((1 + threshold) / s.probability).toFixed(2) }}
              · <span class="font-bold text-novalue">{{ evText(s.ev!) }}</span>
            </p>
          </li>
        </ul>
      </details>

      <details v-if="noOdds.length" class="card px-pad py-1">
        <summary class="flex min-h-touch cursor-pointer items-center font-bold"><span>Probables sin cuota de <Betano /> ({{ noOdds.length }}) <span class="text-xs font-semibold text-ink/50">· {{ DAY_LABEL[filters.day].toLowerCase() }}</span></span></summary>
        <p class="mb-stack-sm text-xs text-ink/60">No se puede calcular su valor. Si ves la cuota en tu <Betano />, escríbela en la tarjeta del partido (sección Partidos).</p>
        <ul class="divide-y divide-line text-xs">
          <li v-for="s in noOdds" :key="s.key" class="flex flex-wrap items-center justify-between gap-2 py-stack-sm">
            <div class="min-w-0">
              <p class="font-bold">{{ selectionLabel(s.market, s.side, s.line) }}</p>
              <p class="text-ink/60">{{ s.match.home?.name }} vs {{ s.match.away?.name }} · {{ when(s.match.kickoff_at) }}</p>
            </div>
            <p class="num text-ink/70">Modelo {{ pct(s.probability) }} · cuota justa {{ s.fairOdds.toFixed(2) }}</p>
          </li>
        </ul>
      </details>
    </template>

    <ModelTrustCard :min-probability="minProbability" />
  </div>
</template>
