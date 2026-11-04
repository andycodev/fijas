<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useExplanation } from '../composables/useExplanation';
import { summarize, type Direction } from '../lib/explain';
import { confidenceFor, type CalibrationBucket, type Confidence, type Selection } from '../lib/opportunities';
import { BAND_LABEL } from '../lib/probability';
import { MARKET_LABEL, selectionLabel } from '../lib/markets';
import backtest from '../data/backtest.json';

const props = defineProps<{ selection: Selection }>();

const selection = toRef(props, 'selection');
const { explanation, isLoading, isError } = useExplanation(selection, computed(() => true));

const buckets = computed(
  () => (backtest.markets as Record<string, { buckets: CalibrationBucket[] }>)[props.selection.market]?.buckets,
);
const confidence = computed(() => confidenceFor(props.selection, buckets.value));
const groups = computed(() => (explanation.value ? summarize(explanation.value.factors) : null));

const CONF_LABEL: Record<Confidence, string> = { high: 'Confianza alta', medium: 'Confianza media', low: 'Confianza baja' };
const CONF_CLASS: Record<Confidence, string> = { high: 'text-value', medium: 'text-marginal', low: 'text-novalue' };
const DIR_MARK: Record<Direction, string> = { for: '▲', against: '▼', neutral: '•', info: '•', unavailable: '—' };
const DIR_CLASS: Record<Direction, string> = {
  for: 'text-value', against: 'text-novalue', neutral: 'text-ink/50', info: 'text-ink/50', unavailable: 'text-ink/40',
};

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
</script>

<template>
  <section class="space-y-3 rounded-md border border-line bg-canvas/60 p-3 text-xs" aria-label="Por qué esta probabilidad">
    <p>
      El modelo estima <strong>{{ pct(selection.probability) }}</strong> para
      <strong>{{ selectionLabel(selection.market, selection.side, selection.line) }}</strong>
      ({{ BAND_LABEL[selection.band].toLowerCase() }}). Parte de una proyección de
      <strong>{{ selection.projection.toFixed(1) }}</strong> {{ MARKET_LABEL[selection.market].toLowerCase() }} para el partido, que sale de
      cruzar el ataque de cada equipo con la defensa del rival en sus últimos 10 partidos, acercándolo a la media de la liga cuando
      hay pocos datos.
    </p>

    <p v-if="isLoading" class="text-ink/60">Cargando datos…</p>
    <p v-else-if="isError" role="alert" class="font-semibold text-novalue">No se pudieron cargar los datos del análisis.</p>

    <template v-else-if="explanation && groups">
      <div v-for="g in [
        { key: 'for', title: `Factores que favorecen esta selección (${groups.favor.length})`, items: groups.favor },
        { key: 'against', title: `Factores que reducen la probabilidad (${groups.against.length})`, items: groups.against },
        { key: 'neutral', title: `Informativos o neutrales (${groups.neutral.length})`, items: groups.neutral },
      ]" :key="g.key">
        <template v-if="g.items.length">
          <h3 class="mb-1 font-bold">{{ g.title }}</h3>
          <ul class="space-y-1.5">
            <li v-for="f in g.items" :key="f.id" class="flex gap-2">
              <span class="mt-0.5 w-3 shrink-0 text-center" :class="DIR_CLASS[f.direction]" aria-hidden="true">{{ DIR_MARK[f.direction] }}</span>
              <span><strong>{{ f.title }}.</strong> {{ f.detail }}</span>
            </li>
          </ul>
        </template>
      </div>

      <div v-if="groups.unavailable.length || explanation.unavailable.length">
        <h3 class="mb-1 font-bold">No disponible</h3>
        <ul class="space-y-1 text-ink/70">
          <li v-for="f in groups.unavailable" :key="f.id">{{ f.title }}: {{ f.detail }}</li>
          <li v-for="u in explanation.unavailable" :key="u">{{ u }}</li>
        </ul>
      </div>
    </template>

    <div class="border-t border-line pt-2">
      <h3 class="mb-1 font-bold">Calidad de los datos y confianza</h3>
      <p class="font-bold" :class="CONF_CLASS[confidence.level]">{{ CONF_LABEL[confidence.level] }} (la más baja de estas evidencias)</p>
      <ul class="mt-1 space-y-0.5 text-ink/70">
        <li v-for="r in confidence.reasons" :key="r.label">
          <span :class="CONF_CLASS[r.level]">●</span> {{ r.label }}
        </li>
      </ul>
      <p class="mt-1 text-[11px] text-ink/50">
        Los partidos de ligas nacionales se usan también para copas europeas; el estilo puede cambiar contra rivales de otro nivel.
      </p>
    </div>
  </section>
</template>
