<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowPathIcon, ArrowRightIcon, BeakerIcon } from '@heroicons/vue/24/outline';
import Betano from '../components/Betano.vue';
import EmptyState from '../components/EmptyState.vue';
import OpportunityCard from '../components/OpportunityCard.vue';
import PageHeader from '../components/PageHeader.vue';
import PicksSummary from '../components/PicksSummary.vue';
import { useApiUsage } from '../composables/useApiUsage';
import { useMinProbability } from '../composables/useMinProbability';
import { useOdds, useRefresh, useUpcomingMatches } from '../composables/usePicks';
import { useProfile } from '../composables/useProfile';
import { analyze, type CalibrationBucket } from '../lib/opportunities';
import { MARKET_LABEL, selectionLabel } from '../lib/markets';
import backtest from '../data/backtest.json';
import type { Market } from '../types/db';

const matches = useUpcomingMatches();
const profile = useProfile();
const refresh = useRefresh();
const { snapshot: apiUsage } = useApiUsage();
const { minProbability, setMinProbability } = useMinProbability();

// Solo se analizan las ligas activas (si aún no elegiste ninguna, todas).
const activeIds = computed(() => profile.data.value?.active_league_ids ?? []);
const activeMatches = computed(() => (matches.data.value ?? []).filter((m) => !activeIds.value.length || activeIds.value.includes(m.league_id)));
const odds = useOdds(() => (matches.data.value ?? []).map((m) => m.id));
const threshold = computed(() => Number(profile.data.value?.value_threshold ?? 0.05));
const ready = computed(() => !matches.isLoading.value && !odds.isLoading.value && !profile.isLoading.value);

const analysis = computed(() =>
  analyze(activeMatches.value, odds.data.value ?? [], { minProbability: minProbability.value, valueThreshold: threshold.value }),
);

// Filtro de mercado de las recomendaciones
const marketFilter = ref<'all' | Market>('all');
const FILTERS: { value: 'all' | Market; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'goals_total', label: 'Goles' },
  { value: 'corners_total', label: 'Córners' },
];
const recommended = computed(() => analysis.value.recommended.filter((s) => marketFilter.value === 'all' || s.market === marketFilter.value));
const countOf = (m: 'all' | Market) => analysis.value.recommended.filter((s) => m === 'all' || s.market === m).length;

// Indicador de confianza en el modelo, con el tramo de tu probabilidad mínima (el detalle vive en «Modelo»).
const trust = computed(() =>
  (['goals_total', 'corners_total'] as Market[]).map((m) => {
    const buckets = (backtest.markets as Record<string, { buckets: CalibrationBucket[] }>)[m]?.buckets ?? [];
    const b = buckets.find((x) => minProbability.value >= x.from && minProbability.value < (x.to >= 1 ? 1.0001 : x.to));
    return { market: m, bucket: b };
  }),
);

const minutesAgo = computed(() => {
  const at = profile.data.value?.last_refresh_at;
  return at ? Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60_000)) : null;
});
const ago = (min: number) => (min < 1 ? 'hace un momento' : min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.floor(min / 60)} h` : `hace ${Math.floor(min / 1440)} d`);

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const evText = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)}%`;
</script>

<template>
  <PageHeader title="Picks" eyebrow="Análisis">
    <template #subtitle>Oportunidades de goles y córners de partido completo frente a la cuota de <Betano />.</template>
    <template #actions>
      <button class="btn btn-primary" :disabled="refresh.isPending.value" @click="refresh.mutate(false)">
        <ArrowPathIcon class="h-5 w-5" :class="{ 'animate-spin': refresh.isPending.value }" />
        {{ refresh.isPending.value ? 'Actualizando…' : 'Actualizar' }}
      </button>
    </template>
  </PageHeader>

  <!-- Estado de la actualización -->
  <div class="mb-4 space-y-2 text-xs">
    <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink/60">
      <span v-if="minutesAgo !== null">Actualizado {{ ago(minutesAgo) }}</span>
      <span v-if="apiUsage">
        API: <strong class="num">{{ apiUsage.requests_used }}/{{ apiUsage.daily_limit ?? '?' }}</strong> solicitudes hoy
        <RouterLink :to="{ name: 'settings-api' }" class="font-semibold text-brand underline">detalle</RouterLink>
      </span>
    </p>

    <p v-if="refresh.isError.value" role="alert" class="font-semibold text-novalue">{{ (refresh.error.value as Error).message }}</p>
    <template v-else-if="refresh.data.value">
      <div v-if="refresh.data.value.skipped" class="card flex flex-wrap items-center justify-between gap-2 p-3">
        <p class="font-semibold text-marginal">
          Se actualizó hace poco. Próxima actualización automática desde las
          {{ new Date(refresh.data.value.nextAllowedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) }}.
        </p>
        <button class="btn !min-h-9 text-xs" :disabled="refresh.isPending.value" @click="refresh.mutate(true)">Actualizar igualmente</button>
      </div>
      <template v-else>
        <p v-if="refresh.data.value.apiStopped" role="alert" class="font-semibold text-novalue">
          Se alcanzó el tope de solicitudes de hoy: se detuvieron las consultas a la API y se usaron los datos guardados.
        </p>
        <p class="text-value">
          Listo: {{ refresh.data.value.fixtures.saved }} partidos guardados, {{ refresh.data.value.picks.matches }} con proyección.
          Cuotas de <Betano />: {{ refresh.data.value.odds.withOdds }} partidos con cuotas, {{ refresh.data.value.odds.without }} sin cuotas.
        </p>
        <p v-if="refresh.data.value.fixtures.unmatched.length" class="font-semibold text-marginal">
          Equipos sin unir: {{ refresh.data.value.fixtures.unmatched.join(', ') }}
        </p>
      </template>
    </template>
  </div>

  <p v-if="matches.isError.value" role="alert" class="text-novalue">
    No se pudieron cargar los partidos. Si acabas de actualizar la app, ejecuta las migraciones pendientes en Supabase.
  </p>
  <p v-else-if="!ready" class="text-ink/60">Cargando…</p>

  <div v-else class="space-y-6">
    <PicksSummary
      :analysis="analysis"
      :min-probability="minProbability"
      :value-threshold="threshold"
      @update:min-probability="setMinProbability"
    />

    <!-- Recomendaciones -->
    <section aria-labelledby="recs-title" class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 id="recs-title" class="text-lg font-extrabold">Recomendaciones</h2>
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

    <!-- Lo que cumple la probabilidad pero no se recomienda -->
    <details v-if="analysis.highProbabilityNoValue.length" class="card p-4">
      <summary class="min-h-touch cursor-pointer font-bold">Probables, pero sin valor ({{ analysis.highProbabilityNoValue.length }})</summary>
      <p class="mb-3 text-xs text-ink/60">
        Cumplen {{ Math.round(minProbability * 100) }}% o más, pero <Betano /> paga menos de lo que necesitarían. Acertar a menudo no basta si la cuota no compensa.
      </p>
      <ul class="divide-y divide-line text-xs">
        <li v-for="s in analysis.highProbabilityNoValue" :key="s.key" class="flex flex-wrap items-center justify-between gap-2 py-2">
          <div class="min-w-0">
            <p class="font-bold">{{ selectionLabel(s.market, s.side, s.line) }}</p>
            <p class="truncate text-ink/60">{{ s.match.home?.name }} vs {{ s.match.away?.name }}</p>
          </div>
          <p class="num text-right text-ink/70">
            Modelo {{ pct(s.probability) }} · <Betano /> paga {{ s.betano!.odds.toFixed(2) }}, necesitaría {{ ((1 + threshold) / s.probability).toFixed(2) }}
            · <span class="font-bold text-novalue">{{ evText(s.ev!) }}</span>
          </p>
        </li>
      </ul>
    </details>

    <details v-if="analysis.highProbabilityNoOdds.length" class="card p-4">
      <summary class="min-h-touch cursor-pointer font-bold">Probables sin cuota de <Betano /> ({{ analysis.highProbabilityNoOdds.length }})</summary>
      <p class="mb-3 text-xs text-ink/60">No se puede calcular su valor. Si ves la cuota en tu <Betano />, escríbela en la tarjeta del partido (sección Partidos).</p>
      <ul class="divide-y divide-line text-xs">
        <li v-for="s in analysis.highProbabilityNoOdds" :key="s.key" class="flex flex-wrap items-center justify-between gap-2 py-2">
          <div class="min-w-0">
            <p class="font-bold">{{ selectionLabel(s.market, s.side, s.line) }}</p>
            <p class="truncate text-ink/60">{{ s.match.home?.name }} vs {{ s.match.away?.name }}</p>
          </div>
          <p class="num text-ink/70">Modelo {{ pct(s.probability) }} · cuota justa {{ s.fairOdds.toFixed(2) }}</p>
        </li>
      </ul>
    </details>

    <!-- Confianza en el modelo (el detalle vive en la sección Modelo) -->
    <RouterLink :to="{ name: 'model' }" class="card group flex flex-wrap items-center gap-4 p-4 transition-colors hover:border-accent">
      <BeakerIcon class="h-8 w-8 shrink-0 text-brand" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="font-bold">¿Qué tan fiable es este modelo?</p>
        <p class="text-xs text-ink/65">
          <template v-for="(t, i) in trust" :key="t.market">
            <template v-if="t.bucket && t.bucket.n > 0">
              {{ i ? ' · ' : '' }}{{ MARKET_LABEL[t.market] }}: en el tramo {{ t.bucket.label }} previó {{ t.bucket.predicted }}% y acertó
              <strong class="num">{{ t.bucket.actual }}%</strong>
            </template>
          </template>
        </p>
      </div>
      <span class="inline-flex items-center gap-1 text-sm font-semibold text-brand">
        Cómo funciona y precisión <ArrowRightIcon class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </RouterLink>
  </div>
</template>
