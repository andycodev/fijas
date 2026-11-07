<script setup lang="ts">
import { ArrowsPointingInIcon, ArrowsPointingOutIcon } from '@heroicons/vue/24/outline';
import { useDensityStore, type Density } from '../stores/density';

// Igual que el selector de tema: compact = solo íconos; stack = en columna (barra lateral estrecha); block = ocupa todo el ancho.
defineProps<{ compact?: boolean; block?: boolean; stack?: boolean }>();

const store = useDensityStore();
const options: { value: Density; label: string; icon: typeof ArrowsPointingInIcon }[] = [
  { value: 'compact', label: 'Compacto', icon: ArrowsPointingInIcon },
  { value: 'comfortable', label: 'Cómodo', icon: ArrowsPointingOutIcon },
];
</script>

<template>
  <div
    class="rounded-ctl border border-line bg-sunken p-0.5"
    :class="stack ? 'flex flex-col' : block ? 'grid w-full grid-cols-2' : 'inline-flex'"
    role="radiogroup"
    aria-label="Densidad de la interfaz"
  >
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      :aria-checked="store.density === o.value"
      :aria-label="o.label"
      :title="o.label"
      class="inline-flex min-h-touch items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors"
      :class="[block ? 'px-1' : 'min-w-touch px-2.5', store.density === o.value ? 'bg-surface text-brand shadow-sm' : 'text-ink/60 hover:text-ink']"
      @click="store.setDensity(o.value)"
    >
      <component :is="o.icon" class="h-4 w-4" aria-hidden="true" />
      <span v-if="!compact">{{ o.label }}</span>
    </button>
  </div>
</template>
