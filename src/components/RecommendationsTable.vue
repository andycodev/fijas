<script setup lang="ts">
import { ref } from 'vue';
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

// Tabla densa de recomendaciones: los mismos datos que las tarjetas (probabilidad, cuota de Betano, cuota justa, evidencia,
// valor, hora de la cuota, proyección y el análisis detallado) en una fila por selección.
const props = defineProps<{ selections: Selection[]; threshold: number; minProbability: number }>();

const whyFor = ref<Selection | null>(null);
const evFor = ref<Selection | null>(null);
const warnOpen = ref<string | null>(null); // fila con el aviso de valor alto desplegado

const CONF: Record<Confidence, { label: string; dot: string }> = {
  high: { label: 'Alta', dot: 'bg-value' },
  medium: { label: 'Media', dot: 'bg-marginal' },
  low: { label: 'Baja', dot: 'bg-novalue' },
};
const confidenceOf = (s: Selection) =>
  confidenceFor(s, (backtest.markets as Record<string, { buckets: CalibrationBucket[] }>)[s.market]?.buckets).level;
const evText = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)}%`;
const when = (iso: string) =>
  new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const hour = (iso: string) => new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const evClass = (s: Selection) => {
  const sig = signalFor(s.ev ?? 0, props.threshold);
  return sig === 'green' ? 'bg-value/15 text-value' : sig === 'yellow' ? 'bg-marginal/15 text-marginal' : 'bg-novalue/15 text-novalue';
};
</script>

<template>
  <div class="card overflow-x-auto">
    <table class="w-full min-w-[44rem] text-left text-xs">
      <caption class="sr-only">Recomendaciones del análisis</caption>
      <thead class="bg-sunken text-ink/60">
        <tr>
          <th scope="col" class="px-pad-sm py-stack-sm font-semibold">Partido</th>
          <th scope="col" class="px-pad-sm py-stack-sm font-semibold">Selección</th>
          <th scope="col" class="px-pad-sm py-stack-sm text-right font-semibold">Prob. modelo</th>
          <th scope="col" class="px-pad-sm py-stack-sm text-right font-semibold">Cuota <Betano /></th>
          <th scope="col" class="px-pad-sm py-stack-sm text-right font-semibold">Cuota justa</th>
          <th scope="col" class="px-pad-sm py-stack-sm text-right font-semibold">Proyección</th>
          <th scope="col" class="px-pad-sm py-stack-sm font-semibold">Evidencia</th>
          <th scope="col" class="px-pad-sm py-stack-sm text-right font-semibold">Valor</th>
          <th scope="col" class="px-pad-sm py-stack-sm"><span class="sr-only">Análisis</span></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-line">
        <template v-for="s in selections" :key="s.key">
          <tr class="align-top">
            <td class="px-pad-sm py-stack-sm">
              <p class="font-extrabold">{{ s.match.home?.name }} <span class="font-semibold text-ink/45">vs</span> {{ s.match.away?.name }}</p>
              <p class="text-ink/60">{{ s.match.league?.name }} · {{ when(s.match.kickoff_at) }}</p>
            </td>
            <td class="px-pad-sm py-stack-sm">
              <p class="font-bold text-brand">{{ selectionLabel(s.market, s.side, s.line) }}</p>
              <p class="text-cap uppercase tracking-wide text-ink/55">{{ MARKET_LABEL[s.market] }}</p>
            </td>
            <td class="num px-pad-sm py-stack-sm text-right font-bold text-brand">{{ (s.probability * 100).toFixed(1) }}%</td>
            <td class="num px-pad-sm py-stack-sm text-right">
              <p class="font-bold">{{ s.betano!.odds.toFixed(2) }}</p>
              <p class="text-cap font-normal text-ink/55">
                <template v-if="s.betano!.origin === 'manual'">escrita por ti</template>
                <template v-else>{{ hour(s.betano!.capturedAt) }} · sin verificar</template>
              </p>
            </td>
            <td class="num px-pad-sm py-stack-sm text-right text-ink/75">{{ s.fairOdds.toFixed(2) }}</td>
            <td class="num px-pad-sm py-stack-sm text-right">{{ s.projection.toFixed(1) }}</td>
            <td class="px-pad-sm py-stack-sm">
              <span class="inline-flex items-center gap-1 font-semibold">
                <span class="h-2 w-2 rounded-full" :class="CONF[confidenceOf(s)].dot" aria-hidden="true" />{{ CONF[confidenceOf(s)].label }}
              </span>
            </td>
            <td class="px-pad-sm py-stack-sm text-right">
              <button
                type="button"
                class="inline-flex min-h-touch items-center gap-1 rounded-ctl px-2 font-extrabold"
                :class="evClass(s)"
                aria-haspopup="dialog"
                :aria-label="`Valor esperado ${evText(s.ev ?? 0)}. Ver cómo se calcula`"
                @click="evFor = s"
              >
                {{ evText(s.ev ?? 0) }}<InformationCircleIcon class="h-4 w-4" aria-hidden="true" />
              </button>
            </td>
            <td class="px-pad-sm py-stack-sm">
              <div class="flex items-center justify-end gap-1">
                <button
                  v-if="(s.ev ?? 0) > HIGH_EV"
                  type="button"
                  class="btn !min-w-touch !px-1.5 !text-marginal"
                  :aria-expanded="warnOpen === s.key"
                  title="Valor inusualmente alto: verifica la cuota"
                  aria-label="Valor inusualmente alto: verifica la cuota"
                  @click="warnOpen = warnOpen === s.key ? null : s.key"
                >
                  <ExclamationTriangleIcon class="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" class="btn !px-2 text-xs" aria-haspopup="dialog" @click="whyFor = s">¿Por qué esta probabilidad?</button>
              </div>
            </td>
          </tr>
          <tr v-if="warnOpen === s.key" class="bg-marginal/10">
            <td colspan="9" class="px-pad-sm py-stack-sm">
              <HighValueNotice :ev="s.ev ?? 0" :probability="s.probability" :odds="s.betano!.odds" :origin="s.betano!.origin" :captured-at="s.betano!.capturedAt" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <WhyModal v-if="whyFor" :selection="whyFor" @close="whyFor = null" />
    <EvModal v-if="evFor" :selection="evFor" @close="evFor = null" />
  </div>
</template>
