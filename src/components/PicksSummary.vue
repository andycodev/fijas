<script setup lang="ts">
import { computed } from 'vue';
import Betano from './Betano.vue';
import type { Analysis } from '../lib/opportunities';

// Resumen del análisis: una cifra principal (las recomendadas) y el embudo que explica por qué son tan pocas.
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
  <section class="card overflow-hidden" aria-labelledby="summary-title">
    <div class="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <!-- Cifra principal -->
      <div class="pitch space-y-3 bg-gradient-to-br from-tint/60 to-transparent p-5">
        <h2 id="summary-title" class="eyebrow text-brand">Resultado del análisis</h2>
        <div class="flex items-end gap-3">
          <p class="text-6xl font-extrabold leading-none tracking-tight text-brand md:text-7xl" :aria-label="`${analysis.recommended.length} recomendadas`">
            {{ analysis.recommended.length }}
          </p>
          <p class="pb-1 text-sm font-semibold leading-tight text-ink/70">
            {{ analysis.recommended.length === 1 ? 'selección recomendada' : 'selecciones recomendadas' }}
          </p>
        </div>
        <p class="text-xs text-ink/60">
          De <strong class="num">{{ analysis.selectionsEvaluated }}</strong> selecciones en <strong class="num">{{ analysis.matchesAnalyzed }}</strong>
          partidos y <strong class="num">{{ analysis.marketsEvaluated }}</strong> mercados. Solo se recomienda lo que cumple los tres filtros.
        </p>

        <label class="flex flex-wrap items-center gap-3 rounded-lg bg-sunken p-3">
          <span class="text-xs font-bold">Probabilidad mínima</span>
          <span class="flex items-center gap-1">
            <input
              v-model.number="minPct"
              type="number"
              min="50"
              max="99"
              step="1"
              inputmode="numeric"
              class="field !w-20 text-right font-bold"
              aria-label="Probabilidad mínima en porcentaje"
            />
            <span class="font-bold">%</span>
          </span>
          <span class="text-[11px] text-ink/55">Se guarda en tu perfil</span>
        </label>
      </div>

      <!-- Embudo -->
      <div class="border-t border-line p-5 lg:border-l lg:border-t-0">
        <h3 class="eyebrow mb-3">Del total a las recomendadas</h3>
        <ol class="space-y-3">
          <li v-for="(st, i) in steps" :key="st.key">
            <div class="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span class="font-semibold" :class="st.strong ? 'text-brand' : 'text-ink/80'">
                <span class="num mr-1 text-ink/40">{{ i + 1 }}.</span>
                <template v-if="st.key === 'evaluated'">Selecciones evaluadas</template>
                <template v-else-if="st.key === 'minimum'">Con {{ minPct }}% o más de probabilidad</template>
                <template v-else-if="st.key === 'odds'">Con cuota de <Betano /> disponible</template>
                <template v-else>Con valor esperado de {{ (valueThreshold * 100).toFixed(1) }}% o más</template>
              </span>
              <span class="num text-sm font-extrabold">{{ st.count }}</span>
            </div>
            <div class="h-2.5 w-full rounded-full bg-tint">
              <div class="h-full rounded-full transition-all" :class="st.strong ? 'bg-accent' : 'bg-primary'" :style="{ width: `${width(st.count)}%` }" />
            </div>
          </li>
        </ol>
        <p class="mt-3 text-[11px] text-ink/55">
          <template v-if="analysis.highProbabilityNoOdds.length">{{ analysis.highProbabilityNoOdds.length }} probables sin cuota de <Betano />. </template>
          <template v-if="analysis.highProbabilityNoValue.length">{{ analysis.highProbabilityNoValue.length }} probables que <Betano /> paga por debajo de su cuota justa.</template>
        </p>
      </div>
    </div>
  </section>
</template>
