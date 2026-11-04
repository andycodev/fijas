<script setup lang="ts">
import { computed } from 'vue';

// Medidor: una proporción frente a un límite. La pista es un paso más claro del mismo azul que el relleno.
// `min` dibuja una marca en tu probabilidad mínima, para ver de un vistazo si la selección la alcanza.
const props = defineProps<{ value: number; min?: number | null; label?: string }>();

const pct = computed(() => Math.max(0, Math.min(1, props.value)) * 100);
const minPct = computed(() => (props.min ? Math.max(0, Math.min(1, props.min)) * 100 : null));
const reaches = computed(() => props.min == null || props.value >= props.min);
</script>

<template>
  <div class="relative pb-6">
    <div
      class="h-2.5 w-full overflow-hidden rounded-full bg-tint"
      role="meter"
      :aria-valuenow="Math.round(pct)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="label ?? 'Probabilidad según el modelo'"
    >
      <div class="h-full rounded-full transition-all" :class="reaches ? 'bg-primary' : 'bg-ink/35'" :style="{ width: `${pct}%` }" />
    </div>
    <template v-if="minPct !== null">
      <span class="absolute top-[-3px] h-4 w-0.5 rounded bg-ink/60" :style="{ left: `calc(${minPct}% - 1px)` }" aria-hidden="true" />
      <span
        class="absolute top-[18px] -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-ink/55"
        :style="{ left: `${Math.min(Math.max(minPct, 8), 92)}%` }"
      >
        tu mínimo {{ Math.round(minPct) }}%
      </span>
    </template>
  </div>
</template>
