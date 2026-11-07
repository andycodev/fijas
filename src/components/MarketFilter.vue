<script setup lang="ts">
import type { Market } from '../types/db';

// Filtro por mercado (Todos / Goles / Córners) con la cantidad de recomendaciones de cada uno.
defineProps<{ modelValue: 'all' | Market; counts: Record<'all' | Market, number> }>();
const emit = defineEmits<{ 'update:modelValue': [value: 'all' | Market] }>();

const FILTERS: { value: 'all' | Market; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'goals_total', label: 'Goles' },
  { value: 'corners_total', label: 'Córners' },
];
</script>

<template>
  <div class="inline-flex rounded-ctl border border-line bg-sunken p-0.5" role="group" aria-label="Filtrar por mercado">
    <button
      v-for="f in FILTERS"
      :key="f.value"
      type="button"
      class="inline-flex min-h-touch items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors"
      :class="modelValue === f.value ? 'bg-surface text-brand shadow-sm' : 'text-ink/60 hover:text-ink'"
      :aria-pressed="modelValue === f.value"
      @click="emit('update:modelValue', f.value)"
    >
      {{ f.label }} <span class="num rounded-full bg-primary/10 px-1.5 text-cap text-brand">{{ counts[f.value] }}</span>
    </button>
  </div>
</template>
