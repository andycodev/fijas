<script setup lang="ts">
import { computed, ref } from 'vue';
import { InformationCircleIcon } from '@heroicons/vue/24/outline';
import Betano from './Betano.vue';
import { DAY_LABEL, type DayFilter } from '../lib/dayFilter';
import { useFiltersStore } from '../stores/filters';

// Filtro por día, en una sola franja: botones con su cantidad de PARTIDOS y, al lado, el resumen de lo seleccionado.
// stats.analyzed = partidos con análisis del modelo; stats.recommended = selecciones que pasan todos los filtros.
export interface DayStats { matches: number; analyzed?: number; recommended?: number }
const props = defineProps<{ stats?: Partial<Record<DayFilter, DayStats>>; bare?: boolean; summaryOnly?: boolean }>();
const filters = useFiltersStore();
const OPTIONS: DayFilter[] = ['today', 'tomorrow', 'all'];
const hint = ref(false);

const fmt = new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short' });
const dateOf = (d: DayFilter): string => {
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
      ? 'ya no queda ningún partido por empezar. Prueba con Mañana.'
      : 'no hay partidos en tus ligas activas.';
  }
  const parts = [plural(s.matches, 'partido', 'partidos')];
  if (s.analyzed !== undefined) parts.push(`${s.analyzed} con análisis`);
  if (s.recommended !== undefined) parts.push(plural(s.recommended, 'recomendación', 'recomendaciones'));
  return parts.join(' · ');
});
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <div v-if="!summaryOnly" class="inline-flex rounded-ctl border border-line bg-sunken p-0.5" role="group" aria-label="Filtrar por fecha del partido">
        <button
          v-for="d in OPTIONS"
          :key="d"
          type="button"
          class="inline-flex min-h-touch items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors sm:px-3"
          :class="filters.day === d ? 'bg-surface text-brand shadow-sm' : 'text-ink/60 hover:text-ink'"
          :aria-pressed="filters.day === d"
          :title="dateOf(d)"
          @click="filters.day = d"
        >
          {{ DAY_LABEL[d] }}
          <span v-if="stats?.[d]" class="num rounded-full bg-primary/10 px-1.5 text-cap text-brand" :class="stats[d]!.matches ? '' : 'opacity-60'">{{ stats[d]!.matches }}</span>
        </button>
      </div>

      <p v-if="summary && !bare" class="flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-ink/70">
        <strong class="text-ink">{{ DAY_LABEL[filters.day] }}</strong>
        <span class="text-ink/45">({{ dateOf(filters.day) }}):</span> {{ summary }}
        <button type="button" class="inline-flex h-7 w-7 items-center justify-center rounded text-brand" :aria-expanded="hint" aria-label="¿Qué significan estas cifras?" @click="hint = !hint">
          <InformationCircleIcon class="h-4 w-4" aria-hidden="true" />
        </button>
      </p>
    </div>

    <ul v-if="hint && !bare" class="list-disc space-y-0.5 rounded-lg bg-sunken p-2 pl-6 text-xs text-ink/70">
      <li><strong>Partidos:</strong> los que aún no empiezan en tus ligas activas, en hora local. «Hoy» solo cuenta lo que falta por jugar.</li>
      <li v-if="current?.analyzed !== undefined"><strong>Con análisis:</strong> el modelo tiene historial suficiente de ambos equipos (mínimo 8 partidos).</li>
      <li v-if="current?.recommended !== undefined"><strong>Recomendaciones:</strong> cumplen tu probabilidad mínima, tienen cuota de <Betano /> y superan el valor esperado mínimo.</li>
    </ul>
  </div>
</template>
