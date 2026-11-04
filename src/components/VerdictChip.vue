<script setup lang="ts">
import { CheckCircleIcon, ExclamationTriangleIcon, MinusCircleIcon, XCircleIcon } from '@heroicons/vue/24/solid';
import type { Signal } from '../lib/value';

// Veredicto sobre el valor: siempre con icono y texto, nunca solo color.
defineProps<{ signal: Signal | null }>();

const MAP = {
  green: { label: 'Vale la pena', cls: 'bg-value/15 text-value', icon: CheckCircleIcon },
  yellow: { label: 'Marginal', cls: 'bg-marginal/15 text-marginal', icon: MinusCircleIcon },
  red: { label: 'No conviene', cls: 'bg-novalue/15 text-novalue', icon: XCircleIcon },
  none: { label: 'Sin cuota', cls: 'bg-sunken text-ink/65', icon: ExclamationTriangleIcon },
} as const;
</script>

<template>
  <span class="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" :class="MAP[signal ?? 'none'].cls">
    <component :is="MAP[signal ?? 'none'].icon" class="h-3.5 w-3.5" aria-hidden="true" />
    {{ MAP[signal ?? 'none'].label }}
  </span>
</template>
