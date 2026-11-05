<script setup lang="ts">
import { computed } from 'vue';
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/vue/24/solid';
import { useAutomationRuns } from '../composables/useAutomation';
import { ANALYSIS_UTC_HOURS, automationHealth, describeRun, KIND_LABEL, nextAnalysis, nextResolve, SOURCE_LABEL, whenLabel, type AutomationRun } from '../lib/automation';

// Qué hizo el robot automático (GitHub Actions) y cuándo vuelve a correr. «only» limita a un tipo de ejecución.
const props = defineProps<{ only?: AutomationRun['kind'] }>();
const runsQ = useAutomationRuns();
const runs = computed(() => (runsQ.data.value ?? []).filter((r) => !props.only || r.kind === props.only));

const latest = (k: AutomationRun['kind']) => runs.value.find((r) => r.kind === k) ?? null;
const kinds = computed(() => (props.only ? [props.only] : (['analyze', 'resolve'] as const)));
const health = computed(() => automationHealth(runs.value));

const clock = (d: Date) => new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(d);
const hoursLocal = computed(() => ANALYSIS_UTC_HOURS.map((h) => clock(new Date(Date.UTC(2026, 0, 1, h)))).join(', '));
const nextText = (k: AutomationRun['kind']) => whenLabel((k === 'analyze' ? nextAnalysis() : nextResolve()).toISOString());
</script>

<template>
  <section v-if="runsQ.data.value" class="card space-y-2 p-3 text-xs" aria-label="Actividad automática">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="font-bold text-sm">Actividad automática</p>
      <p v-if="!health.ok" class="inline-flex items-center gap-1 font-semibold text-novalue" role="alert"><ExclamationTriangleIcon class="h-4 w-4" aria-hidden="true" />{{ health.reason }}</p>
    </div>

    <p v-if="!runs.length" class="text-ink/65">
      Aún no hay ejecuciones automáticas registradas. El robot de GitHub corre solo; aquí verás cada una cuando termine.
    </p>

    <ul v-else class="space-y-1.5">
      <li v-for="k in kinds" :key="k" class="flex items-start gap-2">
        <template v-if="latest(k)">
          <component :is="latest(k)!.status === 'succeeded' ? CheckCircleIcon : XCircleIcon" class="mt-0.5 h-4 w-4 shrink-0" :class="latest(k)!.status === 'succeeded' ? 'text-value' : 'text-novalue'" aria-hidden="true" />
          <p class="min-w-0">
            <strong>{{ KIND_LABEL[k] }}</strong> · {{ whenLabel(latest(k)!.started_at) }}
            <span class="block text-ink/65">{{ describeRun(latest(k)!) }}</span>
            <span class="block text-ink/50">Próxima: {{ nextText(k) }}</span>
          </p>
        </template>
        <p v-else class="text-ink/60"><strong>{{ KIND_LABEL[k] }}</strong>: sin ejecuciones todavía.</p>
      </li>
    </ul>

    <details v-if="runs.length">
      <summary class="inline-flex min-h-touch cursor-pointer items-center font-semibold text-brand">Ver las últimas ejecuciones</summary>
      <ul class="divide-y divide-line">
        <li v-for="r in runs.slice(0, 12)" :key="r.id" class="flex items-start gap-2 py-1.5">
          <component :is="r.status === 'succeeded' ? CheckCircleIcon : XCircleIcon" class="mt-0.5 h-4 w-4 shrink-0" :class="r.status === 'succeeded' ? 'text-value' : 'text-novalue'" aria-hidden="true" />
          <p class="min-w-0">
            <span class="font-semibold">{{ KIND_LABEL[r.kind] }}</span> · {{ whenLabel(r.started_at) }} · <span class="text-ink/55">{{ SOURCE_LABEL[r.source] }}</span>
            <span class="block text-ink/65">{{ describeRun(r) }}</span>
          </p>
        </li>
      </ul>
    </details>

    <p v-if="!only || only === 'analyze'" class="text-ink/50">Análisis programados a las {{ hoursLocal }} (tu hora). La revisión de resultados corre cada hora.</p>
  </section>
</template>
