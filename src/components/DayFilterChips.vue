<script setup lang="ts">
import { computed } from 'vue';
import { DAY_LABEL, type DayFilter } from '../lib/dayFilter';
import { useFiltersStore } from '../stores/filters';

// Filtro por día con sus cifras explicadas: cada opción dice cuántos PARTIDOS hay y, debajo, qué significa lo seleccionado.
// stats.analyzed = partidos con análisis del modelo; stats.recommended = selecciones que pasan todos los filtros.
export interface DayStats { matches: number; analyzed?: number; recommended?: number }
const props = defineProps<{ stats?: Partial<Record<DayFilter, DayStats>> }>();
const filters = useFiltersStore();
const OPTIONS: DayFilter[] = ['today', 'tomorrow', 'all'];

const fmt = new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short' });
const dateOf = (d: DayFilter): string | null => {
  if (d === 'all') return 'próximas 72 h';
  const t = new Date();
  if (d === 'tomorrow') t.setDate(t.getDate() + 1);
  return fmt.format(t);
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const current = computed(() => props.stats?.[filters.day]);
const summary = computed(() => {
  const s = current.value;
  if (!s) return '';
  if (s.matches === 0) {
    return filters.day === 'today'
      ? 'Hoy ya no queda ningún partido por empezar (los de hoy ya empezaron o terminaron). Prueba con Mañana.'
      : `No hay partidos ${DAY_LABEL[filters.day].toLowerCase()} en tus ligas activas.`;
  }
  const parts = [plural(s.matches, 'partido', 'partidos')];
  if (s.analyzed !== undefined) parts.push(`${s.analyzed} con análisis`);
  if (s.recommended !== undefined) parts.push(plural(s.recommended, 'recomendación', 'recomendaciones'));
  return parts.join(' · ');
});
</script>

<template>
  <div class="space-y-2">
    <div class="grid grid-cols-3 gap-1 rounded-xl border border-line bg-sunken p-1 sm:inline-grid sm:min-w-[24rem]" role="group" aria-label="Filtrar por fecha del partido">
      <button
        v-for="d in OPTIONS"
        :key="d"
        type="button"
        class="flex min-h-touch flex-col items-center justify-center rounded-lg px-3 py-1.5 text-center transition-colors"
        :class="filters.day === d ? 'bg-surface text-brand shadow-sm' : 'text-ink/60 hover:text-ink'"
        :aria-pressed="filters.day === d"
        @click="filters.day = d"
      >
        <span class="text-sm font-bold">{{ DAY_LABEL[d] }}</span>
        <span class="text-[10px] font-normal capitalize text-ink/55">{{ dateOf(d) }}</span>
        <span v-if="stats?.[d]" class="num mt-0.5 text-[11px] font-semibold" :class="stats[d]!.matches ? '' : 'text-ink/45'">{{ plural(stats[d]!.matches, 'partido', 'partidos') }}</span>
      </button>
    </div>

    <div v-if="summary" class="text-xs text-ink/70">
      <p><strong class="text-ink">{{ DAY_LABEL[filters.day] }}:</strong> {{ summary }}</p>
      <details class="mt-1">
        <summary class="inline-flex min-h-touch cursor-pointer items-center font-semibold text-brand">¿Qué significan estas cifras?</summary>
        <ul class="mt-1 list-disc space-y-0.5 pl-5 text-ink/65">
          <li><strong>Partidos:</strong> los que aún no empiezan en tus ligas activas, según su hora local. «Hoy» solo cuenta lo que falta por jugar.</li>
          <li v-if="current?.analyzed !== undefined"><strong>Con análisis:</strong> partidos donde el modelo tiene historial suficiente de ambos equipos (mínimo 8 partidos). Los demás no se pueden analizar.</li>
          <li v-if="current?.recommended !== undefined"><strong>Recomendaciones:</strong> selecciones que cumplen tu probabilidad mínima, tienen cuota de <span class="betano-word">Betano</span> y superan el valor esperado mínimo.</li>
        </ul>
      </details>
    </div>
  </div>
</template>
