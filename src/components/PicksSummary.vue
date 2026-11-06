<script setup lang="ts">
import { computed } from 'vue';
import Betano from './Betano.vue';
import type { Analysis } from '../lib/opportunities';

// Resumen del análisis en una franja: cuántas se recomiendan y el embudo que explica por qué son pocas.
const props = defineProps<{ analysis: Analysis; minProbability: number; valueThreshold: number }>();
const emit = defineEmits<{ 'update:minProbability': [value: number] }>();

const minPct = computed({
  get: () => Math.round(props.minProbability * 100),
  set: (v: number) => {
    if (Number.isFinite(v) && v >= 50 && v <= 99) emit('update:minProbability', v / 100);
  },
});

const total = computed(() => Math.max(props.analysis.selectionsEvaluated, 1));
interface Step { key: string; count: number; strong?: boolean }
const steps = computed<Step[]>(() => [
  { key: 'evaluated', count: props.analysis.selectionsEvaluated },
  { key: 'minimum', count: props.analysis.meetMinimum.length },
  { key: 'odds', count: props.analysis.withOdds.length },
  { key: 'value', count: props.analysis.recommended.length, strong: true },
]);
// Una barra con cuenta > 0 nunca desaparece: mínimo 2 % de ancho.
const width = (n: number) => (n === 0 ? 0 : Math.max((n / total.value) * 100, 2));
</script>

<template>
  <section class="card p-3" aria-label="Resultado del análisis">
    <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
      <!-- Cifra principal -->
      <div class="flex items-baseline gap-2" :aria-label="`${analysis.recommended.length} recomendadas`">
        <span class="num text-4xl font-extrabold leading-none tracking-tight text-brand">{{ analysis.recommended.length }}</span>
        <span class="text-xs font-semibold leading-tight text-ink/70">{{ analysis.recommended.length === 1 ? 'selección' : 'selecciones' }}<br />recomendadas</span>
      </div>

      <!-- Embudo: cuatro pasos, una sola fila -->
      <ol class="order-last grid w-full min-w-0 grid-cols-2 gap-x-4 gap-y-2 sm:order-none sm:w-auto sm:flex-1 sm:grid-cols-4">
        <li v-for="(st, i) in steps" :key="st.key" class="min-w-0">
          <div class="flex items-baseline justify-between gap-2 text-[11px]">
            <span class="truncate font-semibold" :class="st.strong ? 'text-brand' : 'text-ink/70'">
              <template v-if="st.key === 'evaluated'">Evaluadas</template>
              <template v-else-if="st.key === 'minimum'">≥ {{ minPct }}% prob.</template>
              <template v-else-if="st.key === 'odds'">Con cuota <Betano /></template>
              <template v-else>Valor ≥ {{ (valueThreshold * 100).toFixed(0) }}%</template>
            </span>
            <span class="num text-sm font-extrabold">{{ st.count }}</span>
          </div>
          <div class="mt-0.5 h-1.5 w-full rounded-full bg-tint">
            <div class="h-full rounded-full transition-all" :class="st.strong ? 'bg-accent' : 'bg-primary'" :style="{ width: `${width(st.count)}%` }" :aria-label="`Paso ${i + 1}`" />
          </div>
        </li>
      </ol>

      <!-- Probabilidad mínima -->
      <label class="ml-auto flex items-center gap-2 text-xs font-bold sm:ml-0">
        Prob. mínima
        <span class="flex items-center gap-1">
          <input v-model.number="minPct" type="number" min="50" max="99" step="1" inputmode="numeric" class="field !min-h-9 !h-9 !w-16 text-right font-bold" aria-label="Probabilidad mínima en porcentaje" />
          <span>%</span>
        </span>
      </label>
    </div>
    <p class="mt-1.5 text-[11px] text-ink/55">
      {{ analysis.selectionsEvaluated }} selecciones en {{ analysis.matchesAnalyzed }} partidos y {{ analysis.marketsEvaluated }} mercados.
      <template v-if="analysis.highProbabilityNoOdds.length">{{ analysis.highProbabilityNoOdds.length }} probables sin cuota de <Betano />. </template>
      <template v-if="analysis.highProbabilityNoValue.length">{{ analysis.highProbabilityNoValue.length }} probables con cuota por debajo de la justa. </template>
      Se guarda en tu perfil.
    </p>
  </section>
</template>
