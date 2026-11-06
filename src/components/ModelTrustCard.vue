<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowRightIcon, BeakerIcon } from '@heroicons/vue/24/outline';
import { MARKET_LABEL } from '../lib/markets';
import type { CalibrationBucket } from '../lib/opportunities';
import backtest from '../data/backtest.json';
import type { Market } from '../types/db';

// Indicador compacto de fiabilidad: en el tramo de tu probabilidad mínima, ¿lo que el modelo prevé es lo que ocurre?
// El detalle completo vive en la sección Modelo.
const props = defineProps<{ minProbability: number }>();

const pills = computed(() =>
  (['goals_total', 'corners_total'] as Market[]).flatMap((m) => {
    const buckets = (backtest.markets as Record<string, { buckets: CalibrationBucket[] }>)[m]?.buckets ?? [];
    const b = buckets.find((x) => props.minProbability >= x.from && props.minProbability < (x.to >= 1 ? 1.0001 : x.to));
    return b && b.n > 0 && b.predicted !== null && b.actual !== null
      ? [{ market: m, label: b.label, predicted: b.predicted, actual: b.actual, gap: b.actual - b.predicted }]
      : [];
  }),
);
</script>

<template>
  <RouterLink
    :to="{ name: 'model' }"
    class="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-2.5 transition-colors hover:border-accent"
    aria-label="Fiabilidad del modelo: ver estadísticas detalladas"
  >
    <span class="flex items-center gap-2 text-sm font-bold"><BeakerIcon class="h-5 w-5 text-brand" aria-hidden="true" />Fiabilidad del modelo</span>
    <ul class="flex flex-1 flex-wrap items-center gap-2 text-[11px]">
      <li v-for="p in pills" :key="p.market" class="rounded-lg bg-sunken px-2.5 py-1">
        <span class="font-semibold">{{ MARKET_LABEL[p.market] }}</span>
        <span class="text-ink/60"> · tramo {{ p.label }}: previó </span><span class="num font-bold">{{ p.predicted }}%</span>
        <span class="text-ink/60">, real </span><span class="num font-bold" :class="Math.abs(p.gap) <= 3 ? 'text-value' : 'text-marginal'">{{ p.actual }}%</span>
      </li>
      <li v-if="!pills.length" class="text-ink/55">Sin datos históricos para tu probabilidad mínima.</li>
    </ul>
    <span class="inline-flex items-center gap-1 text-xs font-semibold text-brand">
      Estadísticas <ArrowRightIcon class="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </span>
  </RouterLink>
</template>
