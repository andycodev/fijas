<script setup lang="ts">
import { computed } from 'vue';

// Las últimas recomendaciones resueltas, de la más antigua a la más reciente: punto lleno = ganada, anillo con × = perdida.
// La forma distingue el resultado aunque no se vean los colores.
const props = defineProps<{ results: ('won' | 'lost')[]; max?: number }>();
const shown = computed(() => props.results.slice(-(props.max ?? 30)));
</script>

<template>
  <figure class="card space-y-2 p-4">
    <figcaption class="flex flex-wrap items-baseline justify-between gap-2">
      <span class="text-sm font-bold">Últimos resultados</span>
      <span class="flex items-center gap-3 text-cap text-ink/60">
        <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-3 rounded-full bg-value" aria-hidden="true" />Ganada</span>
        <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-3 rounded-full border-2 border-novalue" aria-hidden="true" />Perdida</span>
      </span>
    </figcaption>
    <p v-if="!shown.length" class="text-xs text-ink/60">Sin recomendaciones resueltas todavía.</p>
    <ol v-else class="flex flex-wrap gap-1.5" :aria-label="`Últimos ${shown.length} resultados, del más antiguo al más reciente`">
      <li v-for="(r, i) in shown" :key="i" class="flex h-5 w-5 items-center justify-center rounded-full" :class="r === 'won' ? 'bg-value' : 'border-2 border-novalue text-novalue'" :title="r === 'won' ? 'Ganada' : 'Perdida'">
        <span v-if="r === 'lost'" class="text-cap font-extrabold leading-none" aria-hidden="true">×</span>
        <span class="sr-only">{{ r === 'won' ? 'Ganada' : 'Perdida' }}</span>
      </li>
    </ol>
  </figure>
</template>
