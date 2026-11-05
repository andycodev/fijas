<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import AnalyzeBar from '../components/AnalyzeBar.vue';
import Betano from '../components/Betano.vue';
import DayFilterChips from '../components/DayFilterChips.vue';
import EmptyState from '../components/EmptyState.vue';
import ModelTrustCard from '../components/ModelTrustCard.vue';
import OpportunityCard from '../components/OpportunityCard.vue';
import PageHeader from '../components/PageHeader.vue';
import PicksSummary from '../components/PicksSummary.vue';
import { useMinProbability } from '../composables/useMinProbability';
import { useOdds, useUpcomingMatches } from '../composables/usePicks';
import { useProfile } from '../composables/useProfile';
import { DAY_LABEL, filterByDay, type DayFilter } from '../lib/dayFilter';
import { selectionLabel } from '../lib/markets';
import { analyze, type Selection } from '../lib/opportunities';
import { useFiltersStore } from '../stores/filters';
import type { Market } from '../types/db';

const matches = useUpcomingMatches();
const profile = useProfile();
const filters = useFiltersStore();
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
const FILTERS: { value: 'all' | Market; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'goals_total', label: 'Goles' },
  { value: 'corners_total', label: 'Córners' },
];
const recommended = computed(() =>
  analysis.value.recommended.filter((s) => marketFilter.value === 'all' || s.market === marketFilter.value).sort(byKickoff),
);
const noValue = computed(() => [...analysis.value.highProbabilityNoValue].sort(byKickoff));
const noOdds = computed(() => [...analysis.value.highProbabilityNoOdds].sort(byKickoff));
const countOf = (m: 'all' | Market) => analysis.value.recommended.filter((s) => m === 'all' || s.market === m).length;

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
  <p v-else-if="!ready" class="text-ink/60">Cargando…</p>

  <div v-else class="space-y-6">
    <DayFilterChips :stats="dayStats" />

    <EmptyState v-if="!dayMatches.length" :message="emptyDayMessage" />

    <template v-else>
      <PicksSummary
        :analysis="analysis"
        :min-probability="minProbability"
        :value-threshold="threshold"
        @update:min-probability="setMinProbability"
      />

      <!-- Recomendaciones -->
      <section aria-labelledby="recs-title" class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="recs-title" class="text-lg font-extrabold">Recomendaciones <span class="text-sm font-semibold text-ink/50">· {{ DAY_LABEL[filters.day].toLowerCase() }}</span></h2>
          <div class="inline-flex rounded-lg border border-line bg-sunken p-0.5" role="group" aria-label="Filtrar por mercado">
            <button
              v-for="f in FILTERS"
              :key="f.value"
              type="button"
              class="inline-flex min-h-touch items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors"
              :class="marketFilter === f.value ? 'bg-surface text-brand shadow-sm' : 'text-ink/60 hover:text-ink'"
              :aria-pressed="marketFilter === f.value"
              @click="marketFilter = f.value"
            >
              {{ f.label }} <span class="num rounded-full bg-primary/10 px-1.5 text-[10px] text-brand">{{ countOf(f.value) }}</span>
            </button>
          </div>
        </div>

        <EmptyState v-if="!recommended.length" message="No se encontraron oportunidades que cumplan los criterios. No se fuerzan recomendaciones.">
          <p class="max-w-md text-xs text-ink/55">
            Criterios: {{ Math.round(minProbability * 100) }}% o más de probabilidad, cuota de <Betano /> disponible y valor esperado de
            {{ (threshold * 100).toFixed(1) }}% o más. Si quieres ver más partidos, revisa
            <RouterLink :to="{ name: 'matches' }" class="font-semibold text-brand underline">Partidos</RouterLink>.
          </p>
        </EmptyState>
        <div v-else class="grid gap-4 xl:grid-cols-2">
          <OpportunityCard v-for="s in recommended" :key="s.key" :selection="s" :threshold="threshold" :min-probability="minProbability" />
        </div>
      </section>

      <!-- Probables pero sin valor -->
      <details v-if="noValue.length" class="card p-4">
        <summary class="min-h-touch cursor-pointer font-bold">Probables, pero sin valor ({{ noValue.length }}) <span class="text-xs font-semibold text-ink/50">· {{ DAY_LABEL[filters.day].toLowerCase() }}</span></summary>
        <p class="mb-3 text-xs text-ink/60">
          Cumplen {{ Math.round(minProbability * 100) }}% o más, pero <Betano /> paga menos de lo que necesitarían. Acertar a menudo no basta si la cuota no compensa.
        </p>
        <ul class="divide-y divide-line text-xs">
          <li v-for="s in noValue" :key="s.key" class="flex flex-wrap items-center justify-between gap-2 py-2">
            <div class="min-w-0">
              <p class="font-bold">{{ selectionLabel(s.market, s.side, s.line) }}</p>
              <p class="truncate text-ink/60">{{ s.match.home?.name }} vs {{ s.match.away?.name }} · {{ when(s.match.kickoff_at) }}</p>
            </div>
            <p class="num text-right text-ink/70">
              Modelo {{ pct(s.probability) }} · <Betano /> paga {{ s.betano!.odds.toFixed(2) }}, necesitaría {{ ((1 + threshold) / s.probability).toFixed(2) }}
              · <span class="font-bold text-novalue">{{ evText(s.ev!) }}</span>
            </p>
          </li>
        </ul>
      </details>

      <details v-if="noOdds.length" class="card p-4">
        <summary class="min-h-touch cursor-pointer font-bold">Probables sin cuota de <Betano /> ({{ noOdds.length }}) <span class="text-xs font-semibold text-ink/50">· {{ DAY_LABEL[filters.day].toLowerCase() }}</span></summary>
        <p class="mb-3 text-xs text-ink/60">No se puede calcular su valor. Si ves la cuota en tu <Betano />, escríbela en la tarjeta del partido (sección Partidos).</p>
        <ul class="divide-y divide-line text-xs">
          <li v-for="s in noOdds" :key="s.key" class="flex flex-wrap items-center justify-between gap-2 py-2">
            <div class="min-w-0">
              <p class="font-bold">{{ selectionLabel(s.market, s.side, s.line) }}</p>
              <p class="truncate text-ink/60">{{ s.match.home?.name }} vs {{ s.match.away?.name }} · {{ when(s.match.kickoff_at) }}</p>
            </div>
            <p class="num text-ink/70">Modelo {{ pct(s.probability) }} · cuota justa {{ s.fairOdds.toFixed(2) }}</p>
          </li>
        </ul>
      </details>
    </template>

    <ModelTrustCard :min-probability="minProbability" />
  </div>
</template>
