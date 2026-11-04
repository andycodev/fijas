<script setup lang="ts">
import { computed } from 'vue';
import { ArrowPathIcon } from '@heroicons/vue/24/outline';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import MatchPickCard from '../components/MatchPickCard.vue';
import { useManualOdds, useRefresh, useUpcomingMatches } from '../composables/usePicks';
import { useProfile } from '../composables/useProfile';

const matches = useUpcomingMatches();
const profile = useProfile();
const refresh = useRefresh();

const withPicks = computed(() => (matches.data.value ?? []).filter((m) => m.picks.length > 0));
const withoutPicks = computed(() => (matches.data.value ?? []).filter((m) => m.picks.length === 0));
const odds = useManualOdds(() => withPicks.value.map((m) => m.id));
const threshold = computed(() => Number(profile.data.value?.value_threshold ?? 0.05));
const ready = computed(() => !matches.isLoading.value && !odds.isLoading.value && !profile.isLoading.value);
</script>

<template>
  <PageHeader title="Picks" subtitle="Córners totales de hoy y mañana" />

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
      {{ refresh.data.value.summary.fixtures.apiRequestsToday }}/90 solicitudes hoy.
    </p>
    <p
      v-if="refresh.data.value?.summary.fixtures.unmatched.length"
      class="text-xs font-semibold text-marginal"
    >
      Equipos sin unir: {{ refresh.data.value.summary.fixtures.unmatched.join(', ') }}
    </p>

    <p class="text-xs text-ink/60">
      El modelo está bien calibrado pero supera por poco al promedio de la liga. Un valor muy alto frente a la
      cuota de Betano suele indicar una cuota mal leída, no una ventaja real.
    </p>
  </div>

  <p v-if="matches.isError.value" role="alert" class="text-novalue">No se pudieron cargar los partidos.</p>
  <p v-else-if="!ready" class="text-ink/60">Cargando…</p>

  <template v-else>
    <EmptyState v-if="!withPicks.length" message="No hay picks para hoy ni mañana. Pulsa Actualizar." />
    <div v-else class="space-y-3">
      <MatchPickCard
        v-for="m in withPicks"
        :key="`${m.id}-${odds.data.value?.length ?? 0}`"
        :match="m"
        :odds="(odds.data.value ?? []).filter((o) => o.match_id === m.id)"
        :threshold="threshold"
      />
    </div>

    <details v-if="withoutPicks.length" class="card mt-4 p-4">
      <summary class="min-h-touch cursor-pointer font-bold">
        Sin historial suficiente ({{ withoutPicks.length }})
      </summary>
      <p class="mb-2 text-xs text-ink/60">
        Alguno de los dos equipos no tiene al menos 8 partidos con córners en la base. No se inventa una proyección.
      </p>
      <ul class="space-y-1 text-xs">
        <li v-for="m in withoutPicks" :key="m.id">
          <span class="text-ink/60">{{ m.league?.name }} ·</span> {{ m.home?.name }} vs {{ m.away?.name }}
        </li>
      </ul>
    </details>
  </template>
</template>
