<script setup lang="ts">
import { computed } from 'vue';
import { CheckCircleIcon, ClockIcon, MinusCircleIcon, PlayCircleIcon, XCircleIcon } from '@heroicons/vue/24/solid';
import { liveLabel, phaseOf } from '../lib/evaluation';
import type { RecommendationRow } from '../types/db';

// Estado de una recomendación registrada: pendiente, en curso (con su etiqueta), ganada, perdida o cancelada. Siempre icono y texto.
const props = defineProps<{ rec: RecommendationRow; now: number }>();

const phase = computed(() => phaseOf({ result: props.rec.result, kickoff_at: props.rec.kickoff_at ?? props.rec.match?.kickoff_at ?? null }, props.now));
const badge = computed(() => {
  switch (props.rec.result) {
    case 'won': return { label: 'Ganada', icon: CheckCircleIcon, cls: 'bg-value/15 text-value' };
    case 'lost': return { label: 'Perdida', icon: XCircleIcon, cls: 'bg-novalue/15 text-novalue' };
    case 'void': return { label: 'Cancelada', icon: MinusCircleIcon, cls: 'bg-tint text-ink/65' };
    default:
      return phase.value === 'upcoming'
        ? { label: 'Pendiente', icon: ClockIcon, cls: 'bg-tint text-brand' }
        : { label: liveLabel({ kickoff_at: props.rec.kickoff_at }, props.rec.match?.status ?? null, props.now), icon: PlayCircleIcon, cls: 'bg-marginal/15 text-marginal' };
  }
});
</script>

<template>
  <span class="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-cap font-bold" :class="badge.cls">
    <component :is="badge.icon" class="h-3.5 w-3.5" aria-hidden="true" />{{ badge.label }}
  </span>
</template>
