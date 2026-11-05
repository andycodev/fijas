<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/solid';
import { useApiUsage } from '../composables/useApiUsage';
import { useAnalyze } from '../composables/usePicks';
import { useProfile } from '../composables/useProfile';
import { useAnalysisRuns } from '../composables/useTickets';
import { describeAnalysis } from '../lib/analysis';
import { usageLevel, usagePercent } from '../lib/apiUsage';

// Control del análisis: cuándo se hizo, si los datos siguen vigentes, cuánta API se ha gastado y cómo lanzarlo sin desperdiciar peticiones.
const analyze = useAnalyze();
const runs = useAnalysisRuns();
const profile = useProfile();
const { snapshot: api } = useApiUsage();

const interval = computed(() => Number(profile.data.value?.refresh_interval_minutes ?? 60));
const status = computed(() => describeAnalysis(runs.data.value ?? [], interval.value));
const running = computed(() => analyze.isPending.value || status.value.state === 'running');

const askForce = ref(false);
const outcome = computed(() => analyze.data.value ?? null);

// Si los datos siguen vigentes no se llama a la API: se pide confirmación para forzar.
function onAnalyze() {
  if (running.value) return;
  if (status.value.fresh) { askForce.value = true; return; }
  askForce.value = false;
  analyze.mutate(false);
}
function force() {
  askForce.value = false;
  analyze.mutate(true);
}

const fmtTime = (iso: string | null) => (iso ? new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—');
const fmtDay = (iso: string) => new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' }).format(new Date(iso));

const apiLimit = computed(() => api.value?.daily_limit ?? null);
const apiUsed = computed(() => api.value?.requests_used ?? null);
const apiLevel = computed(() => (apiLimit.value && apiUsed.value !== null ? usageLevel(apiUsed.value, apiLimit.value) : 'ok'));
const apiPct = computed(() => (apiLimit.value && apiUsed.value !== null ? usagePercent(apiUsed.value, apiLimit.value) : 0));
</script>

<template>
  <section class="card mb-4 space-y-3 p-4" aria-label="Análisis">
    <div class="flex flex-wrap items-center gap-3">
      <button class="btn btn-primary min-w-36" :disabled="running" @click="onAnalyze">
        <ArrowPathIcon class="h-5 w-5" :class="{ 'animate-spin': running }" aria-hidden="true" />
        {{ running ? 'Analizando…' : 'Analizar' }}
      </button>

      <!-- Estado del último análisis -->
      <div class="min-w-0 flex-1 text-xs" role="status" aria-live="polite">
        <template v-if="running">
          <p class="font-bold text-brand">Análisis iniciado{{ status.startedAt ? ` a las ${fmtTime(status.startedAt)}` : '' }}…</p>
          <p class="text-ink/60">Aún no terminó: no se considera completado hasta que finalice.</p>
        </template>
        <template v-else-if="status.state === 'failed'">
          <p class="flex items-center gap-1 font-bold text-novalue"><ExclamationTriangleIcon class="h-4 w-4" aria-hidden="true" />El último intento falló{{ status.startedAt ? ` (${fmtTime(status.startedAt)})` : '' }}</p>
          <p class="text-ink/60">{{ status.error }}</p>
        </template>
        <template v-if="!running && status.lastSuccessAt">
          <p class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span class="inline-flex items-center gap-1 font-bold"><CheckCircleIcon class="h-4 w-4 text-value" aria-hidden="true" />Último análisis completado
              {{ status.analyzedToday ? `hoy a las ${fmtTime(status.lastSuccessAt)}` : `el ${fmtDay(status.lastSuccessAt)} a las ${fmtTime(status.lastSuccessAt)}` }}</span>
            <span v-if="status.analyzedToday" class="rounded-full bg-value/15 px-2 py-0.5 text-[10px] font-bold text-value">Ya analizado hoy</span>
          </p>
          <p class="text-ink/60">
            <template v-if="status.fresh">Datos vigentes hasta las {{ fmtTime(status.validUntil) }} (cada {{ interval }} min).</template>
            <template v-else>Los datos pueden estar desactualizados: ya pasó la vigencia de {{ interval }} min.</template>
          </p>
        </template>
        <p v-else-if="!running && status.state === 'none'" class="text-ink/60">Aún no hay ningún análisis. Pulsa Analizar para empezar.</p>
      </div>

      <!-- Consumo de API (cifras del proveedor) -->
      <div v-if="api" class="w-full text-xs md:w-56">
        <p class="flex items-baseline justify-between">
          <span class="text-ink/60">API hoy</span>
          <span class="num font-bold">{{ apiUsed }}/{{ apiLimit ?? '?' }}<span class="font-normal text-ink/55"> · quedan {{ apiLimit !== null && apiUsed !== null ? apiLimit - apiUsed : '?' }}</span></span>
        </p>
        <div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-tint" role="progressbar" :aria-valuenow="apiPct" aria-valuemin="0" aria-valuemax="100" aria-label="Consumo de la API de hoy">
          <div class="h-full rounded-full" :class="apiLevel === 'ok' ? 'bg-primary' : apiLevel === 'critical' || apiLevel === 'exhausted' ? 'bg-novalue' : 'bg-marginal'" :style="{ width: `${apiPct}%` }" />
        </div>
        <p class="mt-1 text-[11px] text-ink/55">
          <template v-if="api.reset_observed_at">Último reinicio observado: {{ fmtDay(api.reset_observed_at) }} {{ fmtTime(api.reset_observed_at) }}. </template>
          <template v-else>La API no informa cuándo se renueva. </template>
          <RouterLink :to="{ name: 'settings-api' }" class="font-semibold text-brand underline">Detalle</RouterLink>
        </p>
      </div>
    </div>

    <!-- Confirmación para forzar -->
    <div v-if="askForce" class="rounded-lg border border-marginal bg-marginal/10 p-3 text-xs" role="alertdialog" aria-label="Confirmar nuevo análisis">
      <p class="font-bold text-marginal">Los datos siguen vigentes.</p>
      <p class="text-ink/75">
        El último análisis terminó a las {{ fmtTime(status.lastSuccessAt) }} y vale hasta las {{ fmtTime(status.validUntil) }}. Volver a analizar ahora
        gasta solicitudes de la API (tienes un máximo diario) y probablemente no cambie nada. ¿Quieres forzarlo?
      </p>
      <div class="mt-2 flex gap-2">
        <button class="btn !min-h-9 text-xs" @click="askForce = false">Cancelar</button>
        <button class="btn btn-primary !min-h-9 text-xs" @click="force">Forzar análisis</button>
      </div>
    </div>

    <!-- Resultado de la llamada -->
    <p v-if="analyze.isError.value" role="alert" class="text-xs font-semibold text-novalue">{{ (analyze.error.value as Error).message }}</p>
    <template v-else-if="outcome && !running">
      <p v-if="outcome.skipped && outcome.reason === 'running'" class="text-xs font-semibold text-marginal">Ya hay un análisis en curso: espera a que termine.</p>
      <p v-else-if="outcome.skipped" class="text-xs font-semibold text-marginal">Los datos siguen vigentes: no se gastó ninguna solicitud de API.</p>
      <template v-else>
        <p v-if="outcome.apiStopped" role="alert" class="text-xs font-semibold text-novalue">
          Se alcanzó el tope de solicitudes: el análisis se completó con los datos ya guardados, sin consultar la API.
        </p>
        <p class="text-xs text-value">
          Completado: {{ outcome.fixtures.saved }} partidos guardados, {{ outcome.picks.matches }} con proyección,
          {{ outcome.odds.withOdds }} con cuotas y {{ outcome.recommendations.total }} recomendaciones.
        </p>
        <p v-if="outcome.fixtures.unmatched.length" class="text-xs font-semibold text-marginal">Equipos sin unir: {{ outcome.fixtures.unmatched.join(', ') }}</p>
      </template>
    </template>
  </section>
</template>
