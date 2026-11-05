<script setup lang="ts">
import { computed } from 'vue';
import type { Group } from '../lib/evaluation';

// ROI teórico por grupo (mercado, liga…) en barras que parten de un cero central: a la derecha ganó, a la izquierda perdió.
// El signo va también escrito, para no depender solo del color.
const props = defineProps<{ title: string; groups: Group[]; labelOf?: (key: string) => string }>();

const rows = computed(() => props.groups.filter((g) => g.resolved > 0 && g.roi !== null));
const max = computed(() => Math.max(10, ...rows.value.map((g) => Math.abs(g.roi!))));
const label = (k: string) => props.labelOf?.(k) ?? k;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
</script>

<template>
  <figure class="card space-y-2 p-4">
    <figcaption class="flex items-baseline justify-between gap-2">
      <span class="text-sm font-bold">{{ title }}</span>
      <span class="text-[11px] text-ink/55">ROI teórico · acierto</span>
    </figcaption>
    <p v-if="!rows.length" class="text-xs text-ink/60">Sin recomendaciones resueltas todavía.</p>
    <ul v-else class="space-y-2">
      <li v-for="g in rows" :key="g.key" class="text-xs">
        <div class="flex items-baseline justify-between gap-2">
          <span class="min-w-0 truncate font-semibold">{{ label(g.key) }}</span>
          <span class="num shrink-0"><strong :class="g.roi! >= 0 ? 'text-value' : 'text-novalue'">{{ signed(g.roi!) }}</strong> <span class="text-ink/55">· {{ g.hitRate?.toFixed(0) }}% · {{ g.resolved }} res.</span></span>
        </div>
        <div class="relative mt-1 h-2.5 rounded-full bg-sunken" role="img" :aria-label="`${label(g.key)}: ROI ${signed(g.roi!)} con ${g.resolved} resueltas`">
          <span class="absolute inset-y-[-3px] left-1/2 w-px bg-ink/40" aria-hidden="true" />
          <span
            class="absolute inset-y-0 rounded-full"
            :class="g.roi! >= 0 ? 'bg-value' : 'bg-novalue'"
            :style="g.roi! >= 0 ? { left: '50%', width: `${(g.roi! / max) * 50}%` } : { right: '50%', width: `${(-g.roi! / max) * 50}%` }"
          />
        </div>
      </li>
    </ul>
  </figure>
</template>
