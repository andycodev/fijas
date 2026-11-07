<script setup lang="ts">
import { computed, ref } from 'vue';
import { CheckCircleIcon, ChevronDownIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/vue/24/solid';
import { useAutomationRuns } from '../composables/useAutomation';
import { ANALYSIS_UTC_HOURS, automationHealth, describeRun, KIND_LABEL, nextAnalysis, nextResolve, SOURCE_LABEL, whenLabel, type AutomationRun } from '../lib/automation';

// Qué hizo el robot automático (GitHub Actions) y cuándo vuelve a correr, en una sola franja. El detalle se despliega.
// «only» limita a un tipo de ejecución; «embedded» quita el marco para incrustarlo dentro de otra tarjeta.
const props = defineProps<{ only?: AutomationRun['kind']; embedded?: boolean }>();
const runsQ = useAutomationRuns();
const runs = computed(() => (runsQ.data.value ?? []).filter((r) => !props.only || r.kind === props.only));
const open = ref(false);

const latest = (k: AutomationRun['kind']) => runs.value.find((r) => r.kind === k) ?? null;
const kinds = computed(() => (props.only ? [props.only] : (['analyze', 'resolve'] as const)));
const health = computed(() => automationHealth(runs.value));

const clock = (d: Date) => new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(d);
const hoursLocal = computed(() => ANALYSIS_UTC_HOURS.map((h) => clock(new Date(Date.UTC(2026, 0, 1, h)))).join(', '));
const nextText = (k: AutomationRun['kind']) => whenLabel((k === 'analyze' ? nextAnalysis() : nextResolve()).toISOString());
const SHORT: Record<AutomationRun['kind'], string> = { analyze: 'Análisis', resolve: 'Resultados' };
</script>

<template>
  <section v-if="runsQ.data.value" :class="embedded ? 'border-t border-line pt-2' : 'card p-pad-sm'" class="text-xs" aria-label="Actividad automática">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span class="inline-flex items-center gap-1">
        <span class="font-bold">Automático</span>
        <button v-if="runs.length" type="button" class="inline-flex min-h-touch items-center gap-0.5 font-semibold text-brand" :aria-expanded="open" aria-label="Ver detalle de las ejecuciones automáticas" @click="open = !open">
          Detalle <ChevronDownIcon class="h-4 w-4 transition-transform" :class="{ 'rotate-180': open }" aria-hidden="true" />
        </button>
      </span>

      <template v-if="runs.length">
        <span v-for="k in kinds" :key="k" class="inline-flex items-center gap-1">
          <template v-if="latest(k)">
            <component :is="latest(k)!.status === 'succeeded' ? CheckCircleIcon : XCircleIcon" class="h-4 w-4 shrink-0" :class="latest(k)!.status === 'succeeded' ? 'text-value' : 'text-novalue'" aria-hidden="true" />
            <span class="font-semibold">{{ SHORT[k] }}</span> <span class="text-ink/65">{{ whenLabel(latest(k)!.started_at) }}</span>
            <span class="hidden text-ink/45 md:inline">· próx. {{ nextText(k) }}</span>
          </template>
          <template v-else><span class="font-semibold">{{ SHORT[k] }}</span> <span class="text-ink/55">sin ejecuciones</span></template>
        </span>
      </template>
      <span v-else class="text-ink/60">aún sin ejecuciones registradas</span>

      <span v-if="!health.ok" class="inline-flex items-center gap-1 font-semibold text-novalue" role="alert">
        <ExclamationTriangleIcon class="h-4 w-4" aria-hidden="true" />{{ health.reason }}
      </span>

    </div>

    <div v-if="open" class="mt-1.5 space-y-1">
      <ul class="divide-y divide-line rounded-lg bg-sunken px-2">
        <li v-for="r in runs.slice(0, 10)" :key="r.id" class="flex items-start gap-2 py-1.5">
          <component :is="r.status === 'succeeded' ? CheckCircleIcon : XCircleIcon" class="mt-0.5 h-4 w-4 shrink-0" :class="r.status === 'succeeded' ? 'text-value' : 'text-novalue'" aria-hidden="true" />
          <p class="min-w-0">
            <span class="font-semibold">{{ KIND_LABEL[r.kind] }}</span> · {{ whenLabel(r.started_at) }} · <span class="text-ink/55">{{ SOURCE_LABEL[r.source] }}</span>
            <span class="block text-ink/65">{{ describeRun(r) }}</span>
          </p>
        </li>
      </ul>
      <p class="text-ink/50">Análisis programados a las {{ hoursLocal }} (tu hora); la revisión de resultados, cada hora. GitHub puede retrasarlos varios minutos.</p>
    </div>
  </section>
</template>
