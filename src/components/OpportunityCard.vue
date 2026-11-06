<script setup lang="ts">
import { computed, ref } from 'vue';
import { ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/vue/24/outline';
import Betano from './Betano.vue';
import EvModal from './EvModal.vue';
import HighValueNotice from './HighValueNotice.vue';
import WhyModal from './WhyModal.vue';
import { MARKET_LABEL, selectionLabel } from '../lib/markets';
import { confidenceFor, type CalibrationBucket, type Confidence, type Selection } from '../lib/opportunities';
import { HIGH_EV } from '../lib/stake';
import { signalFor } from '../lib/value';
import backtest from '../data/backtest.json';

// Una oportunidad en una tarjeta compacta: lo esencial de un vistazo (probabilidad, cuota, cuota justa, evidencia y valor)
// y el análisis detallado bajo demanda, en una ventana.
const props = defineProps<{ selection: Selection; threshold: number; minProbability: number }>();

const s = computed(() => props.selection);
const odds = computed(() => s.value.betano!.odds);
const ev = computed(() => s.value.ev ?? 0);
const signal = computed(() => signalFor(ev.value, props.threshold));
const confidence = computed(() =>
  confidenceFor(s.value, (backtest.markets as Record<string, { buckets: CalibrationBucket[] }>)[s.value.market]?.buckets),
);

const whyOpen = ref(false);
const evOpen = ref(false);

const CONF: Record<Confidence, { label: string; dot: string }> = {
  high: { label: 'Alta', dot: 'bg-value' },
  medium: { label: 'Media', dot: 'bg-marginal' },
  low: { label: 'Baja', dot: 'bg-novalue' },
};

const evText = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)}%`;
const when = (iso: string) =>
  new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const hour = (iso: string) => new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const reaches = computed(() => s.value.probability >= props.minProbability);
</script>

<template>
  <article class="card flex flex-col gap-2 p-3">
    <!-- Partido y valor -->
    <header class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="eyebrow truncate">{{ s.match.league?.name }} · {{ when(s.match.kickoff_at) }}</p>
        <h3 class="truncate text-[15px] font-extrabold leading-tight">
          {{ s.match.home?.name }} <span class="font-semibold text-ink/45">vs</span> {{ s.match.away?.name }}
        </h3>
      </div>
      <button
        type="button"
        class="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-sm font-extrabold"
        :class="signal === 'green' ? 'bg-value/15 text-value' : signal === 'yellow' ? 'bg-marginal/15 text-marginal' : 'bg-novalue/15 text-novalue'"
        aria-haspopup="dialog"
        :aria-label="`Valor esperado ${evText(ev)}. Ver cómo se calcula`"
        @click="evOpen = true"
      >
        {{ evText(ev) }}
        <InformationCircleIcon class="h-4 w-4" aria-hidden="true" />
      </button>
    </header>

    <!-- Selección -->
    <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span class="text-base font-extrabold text-brand">{{ selectionLabel(s.market, s.side, s.line) }}</span>
      <span class="rounded-full bg-sunken px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/60">{{ MARKET_LABEL[s.market] }}</span>
    </p>

    <!-- Cifras clave -->
    <dl class="grid grid-cols-4 gap-1 rounded-lg bg-tint/45 px-2 py-2 text-center">
      <div>
        <dt class="text-[10px] text-ink/60">Prob. modelo</dt>
        <dd class="num text-lg font-extrabold leading-tight text-brand">{{ (s.probability * 100).toFixed(1) }}%</dd>
      </div>
      <div>
        <dt class="text-[10px] text-ink/60">Cuota <Betano /></dt>
        <dd class="num text-lg font-extrabold leading-tight">{{ odds.toFixed(2) }}</dd>
      </div>
      <div>
        <dt class="text-[10px] text-ink/60">Cuota justa</dt>
        <dd class="num text-lg font-extrabold leading-tight text-ink/75">{{ s.fairOdds.toFixed(2) }}</dd>
      </div>
      <div>
        <dt class="text-[10px] text-ink/60">Evidencia</dt>
        <dd class="flex min-h-7 items-center justify-center gap-1 text-sm font-bold leading-tight">
          <span class="h-2 w-2 rounded-full" :class="CONF[confidence.level].dot" aria-hidden="true" />{{ CONF[confidence.level].label }}
        </dd>
      </div>
    </dl>
    <div class="relative -mt-0.5 h-1.5 rounded-full bg-tint" role="meter" :aria-valuenow="Math.round(s.probability * 100)" aria-valuemin="0" aria-valuemax="100" aria-label="Probabilidad según el modelo">
      <div class="h-full rounded-full" :class="reaches ? 'bg-primary' : 'bg-ink/35'" :style="{ width: `${s.probability * 100}%` }" />
      <span class="absolute -top-0.5 h-2.5 w-0.5 bg-ink/60" :style="{ left: `${minProbability * 100}%` }" :title="`Tu mínimo: ${Math.round(minProbability * 100)}%`" aria-hidden="true" />
    </div>

    <!-- Pie: origen de la cuota y análisis bajo demanda -->
    <footer class="flex flex-wrap items-center justify-between gap-2">
      <p class="min-w-0 text-[11px] text-ink/55">
        <template v-if="s.betano!.origin === 'manual'">Cuota escrita por ti</template>
        <template v-else><Betano /> · {{ hour(s.betano!.capturedAt) }} · <strong>sin verificar</strong></template>
        · Proyección <strong class="num">{{ s.projection.toFixed(1) }}</strong>
      </p>
      <button type="button" class="btn !min-h-9 shrink-0 !px-3 text-xs" aria-haspopup="dialog" @click="whyOpen = true">¿Por qué esta probabilidad?</button>
    </footer>

    <details v-if="ev > HIGH_EV" class="rounded-md border border-marginal bg-marginal/10 text-xs">
      <summary class="flex min-h-9 cursor-pointer items-center gap-1.5 px-2 font-bold text-marginal">
        <ExclamationTriangleIcon class="h-4 w-4 shrink-0" aria-hidden="true" />Valor inusualmente alto: verifica la cuota
      </summary>
      <div class="p-2 pt-0"><HighValueNotice :ev="ev" :probability="s.probability" :odds="odds" :origin="s.betano!.origin" :captured-at="s.betano!.capturedAt" /></div>
    </details>

    <WhyModal v-if="whyOpen" :selection="s" @close="whyOpen = false" />
    <EvModal v-if="evOpen" :selection="s" @close="evOpen = false" />
  </article>
</template>
