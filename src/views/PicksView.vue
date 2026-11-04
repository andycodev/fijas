<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowPathIcon } from '@heroicons/vue/24/outline';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import MatchPickCard from '../components/MatchPickCard.vue';
import AnalysisSummary from '../components/AnalysisSummary.vue';
import ModelAccuracy from '../components/ModelAccuracy.vue';
import { useOdds, useRefresh, useUpcomingMatches } from '../composables/usePicks';
import { useProfile, useUpdateProfile } from '../composables/useProfile';
import { MARKET_LABEL } from '../lib/markets';
import { DEFAULT_MIN_PROBABILITY } from '../lib/probability';
import type { Market } from '../types/db';

const route = useRoute();
const router = useRouter();
const matches = useUpcomingMatches();
const profile = useProfile();
const updateProfile = useUpdateProfile();
const refresh = useRefresh();

const TABS: Market[] = ['goals_total', 'corners_total'];
const SLUG: Record<Market, string> = { goals_total: 'goles', corners_total: 'corners' };
const market = computed<Market>(() => (route.query.mercado === 'corners' ? 'corners_total' : 'goals_total'));
const selectMarket = (m: Market) => router.replace({ query: { ...route.query, mercado: SLUG[m] } });

// Probabilidad mínima configurable (se guarda en el perfil)
const minProbability = ref(DEFAULT_MIN_PROBABILITY);
watch(
  () => profile.data.value?.min_probability,
  (v) => { if (v !== undefined && v !== null) minProbability.value = Number(v); },
  { immediate: true },
);
function setMinProbability(v: number) {
  minProbability.value = v;
  updateProfile.mutate({ min_probability: v });
}
const showBelowMinimum = ref(false);
const cardMinimum = computed(() => (showBelowMinimum.value ? 0 : minProbability.value));

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

// Un partido se muestra si, en este mercado, alguna selección (más de o menos de) llega a la probabilidad mínima.
const reachesMinimum = (m: (typeof filtered.value)[number]) =>
  m.picks.some((p) => p.market === market.value && (Number(p.probability) >= cardMinimum.value || 1 - Number(p.probability) >= cardMinimum.value));
const withPicks = computed(() => filtered.value.filter(reachesMinimum));
const withoutPicks = computed(() => filtered.value.filter((m) => !reachesMinimum(m)));
const noHistory = (m: (typeof filtered.value)[number]) => !m.picks.some((p) => p.market === market.value);

const odds = useOdds(() => (matches.data.value ?? []).map((m) => m.id));
const threshold = computed(() => Number(profile.data.value?.value_threshold ?? 0.05));
const ready = computed(() => !matches.isLoading.value && !odds.isLoading.value && !profile.isLoading.value);
</script>

<template>
  <PageHeader title="Picks" subtitle="Goles y córners de partido completo · hoy y mañana" />

  <div class="card mb-4 space-y-2 p-4">
    <button class="btn btn-primary w-full" :disabled="refresh.isPending.value" @click="refresh.mutate()">
      <ArrowPathIcon class="h-5 w-5" :class="{ 'animate-spin': refresh.isPending.value }" />
      {{ refresh.isPending.value ? 'Actualizando…' : 'Actualizar partidos, picks y cuotas' }}
    </button>

    <p v-if="refresh.isError.value" role="alert" class="text-xs font-semibold text-novalue">
      {{ (refresh.error.value as Error).message }}
    </p>
    <p v-else-if="refresh.data.value" class="text-xs text-value">
      Listo: {{ refresh.data.value.summary.fixtures.saved }} partidos guardados,
      {{ refresh.data.value.summary.picks.matches }} con proyección. Cuotas de Betano:
      {{ refresh.data.value.summary.odds.withOdds }} partidos con cuotas, {{ refresh.data.value.summary.odds.without }} sin cuotas
      disponibles. API-Football: {{ refresh.data.value.summary.fixtures.apiRequestsToday }}/90 solicitudes hoy.
    </p>
    <p v-if="refresh.data.value?.summary.fixtures.unmatched.length" class="text-xs font-semibold text-marginal">
      Equipos sin unir: {{ refresh.data.value.summary.fixtures.unmatched.join(', ') }}
    </p>

    <details class="text-xs text-ink/70">
      <summary class="min-h-touch cursor-pointer py-2 font-bold text-ink">Cómo leer esta pantalla</summary>
      <ul class="list-disc space-y-1 pl-4">
        <li><strong>Probabilidad mínima:</strong> solo se recomienda lo que el modelo cree que acierta con ese porcentaje o más (por defecto 75%).</li>
        <li><strong>Cuota justa:</strong> 1 / probabilidad. Es lo mínimo que debería pagar Betano para que no pierdas con el tiempo. No es una cuota de Betano.</li>
        <li><strong>Cuota de Betano:</strong> «vía proveedor» no está verificada; si la escribes tú, queda confirmada.</li>
        <li><strong>Valor esperado:</strong> lo que ganas en promedio por cada S/1 apostado si el modelo acierta. Muy probable no significa buena apuesta: solo conviene cuando el valor es positivo.</li>
        <li>Un valor muy alto suele ser una cuota mal leída. Compárala con tu Betano antes de apostar.</li>
      </ul>
    </details>
  </div>

  <AnalysisSummary
    v-if="ready"
    :matches="filtered"
    :odds="odds.data.value ?? []"
    :min-probability="minProbability"
    :value-threshold="threshold"
    @update:min-probability="setMinProbability"
  />

  <h2 class="mb-2 font-bold">Todos los partidos</h2>
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

  <div class="mb-2 grid grid-cols-2 gap-2 md:grid-cols-3">
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
  <label class="mb-4 flex min-h-touch items-center gap-3 text-xs">
    <input v-model="showBelowMinimum" type="checkbox" class="h-5 w-5 accent-value" />
    Mostrar también las selecciones por debajo de {{ Math.round(minProbability * 100) }}% (solo para consultar; no se recomiendan)
  </label>

  <p v-if="matches.isError.value" role="alert" class="text-novalue">
    No se pudieron cargar los partidos. Si acabas de actualizar la app, ejecuta la migración 07 en Supabase.
  </p>
  <p v-else-if="!ready" class="text-ink/60">Cargando…</p>

  <template v-else>
    <EmptyState
      v-if="!withPicks.length"
      :message="`Ningún partido tiene selecciones de ${MARKET_LABEL[market].toLowerCase()} con ${Math.round(cardMinimum * 100)}% o más con estos filtros.`"
    />
    <div v-else class="space-y-3">
      <MatchPickCard
        v-for="m in withPicks"
        :key="`${m.id}-${market}-${odds.data.value?.length ?? 0}`"
        :match="m"
        :market="market"
        :odds="(odds.data.value ?? []).filter((o) => o.match_id === m.id)"
        :threshold="threshold"
        :min-probability="cardMinimum"
      />
    </div>

    <details v-if="withoutPicks.length" class="card mt-4 p-4">
      <summary class="min-h-touch cursor-pointer font-bold">Sin selecciones que cumplan ({{ withoutPicks.length }})</summary>
      <p class="mb-2 text-xs text-ink/60">
        Ningún lado de ninguna línea llega al mínimo, o algún equipo no tiene al menos 8 partidos con datos (no se inventa una proyección).
      </p>
      <ul class="space-y-1 text-xs">
        <li v-for="m in withoutPicks" :key="m.id">
          <span class="text-ink/60">{{ m.league?.name }} ·</span> {{ m.home?.name }} vs {{ m.away?.name }}
          <span class="text-ink/50">— {{ noHistory(m) ? 'sin historial suficiente' : 'bajo la probabilidad mínima' }}</span>
        </li>
      </ul>
    </details>

    <div class="mt-6"><ModelAccuracy /></div>
  </template>
</template>
