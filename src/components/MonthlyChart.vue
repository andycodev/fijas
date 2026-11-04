<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney } from '../lib/format';
import type { MonthSummary } from '../lib/finance';

// Saldo al cierre de cada mes frente a tu capital base. Una barra por mes, fina y anclada a la línea base.
const props = defineProps<{ months: MonthSummary[]; base: number }>();

const W = 320, H = 150, PAD_X = 12, PAD_TOP = 18, PAD_BOTTOM = 24, MAX_BAR = 28;

const shown = computed(() => props.months.slice(-12));
const range = computed(() => {
  const values = [props.base, ...shown.value.map((m) => m.final)];
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.2;
  return { min: min - pad, max: max + pad };
});

const y = (v: number) => PAD_TOP + ((range.value.max - v) / (range.value.max - range.value.min)) * (H - PAD_TOP - PAD_BOTTOM);
const slot = computed(() => (W - PAD_X * 2) / Math.max(shown.value.length, 1));
const baseY = computed(() => y(props.base));

const bars = computed(() =>
  shown.value.map((m, i) => {
    const top = y(m.final);
    const width = Math.min(slot.value * 0.6, MAX_BAR);
    const cx = PAD_X + i * slot.value + slot.value / 2;
    return {
      key: m.key,
      x: cx - width / 2,
      cx,
      width,
      y: Math.min(top, baseY.value),
      height: Math.max(Math.abs(top - baseY.value), 1.5),
      above: m.final >= props.base,
      label: new Intl.DateTimeFormat('es', { month: 'short' }).format(new Date(`${m.key}-15T12:00:00`)),
      value: m.final,
    };
  }),
);

const summary = computed(
  () =>
    `Saldo al cierre de cada mes frente a tu capital base de ${props.base}: ` +
    shown.value.map((m) => `${m.key} ${m.final.toFixed(2)}`).join(', '),
);
</script>

<template>
  <figure class="space-y-2">
    <figcaption class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink/65">
      <span class="inline-flex items-center gap-1.5">
        <svg width="18" height="8" aria-hidden="true"><line x1="0" y1="4" x2="18" y2="4" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3" /></svg>
        Capital base {{ formatMoney(base) }}
      </span>
      <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-value" aria-hidden="true" />Por encima</span>
      <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-novalue" aria-hidden="true" />Por debajo</span>
    </figcaption>

    <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" :aria-label="summary">
      <line :x1="PAD_X" :x2="W - PAD_X" :y1="baseY" :y2="baseY" stroke="currentColor" stroke-dasharray="4 3" class="text-ink/45" />
      <g v-for="b in bars" :key="b.key">
        <rect :x="b.x" :y="b.y" :width="b.width" :height="b.height" rx="4" :class="b.above ? 'fill-value' : 'fill-novalue'" />
        <text :x="b.cx" :y="H - 8" text-anchor="middle" class="fill-ink/70" font-size="10">{{ b.label }}</text>
        <text :x="b.cx" :y="(b.above ? b.y : b.y + b.height) + (b.above ? -4 : 11)" text-anchor="middle" class="num fill-ink" font-size="10" font-weight="700">
          {{ b.value.toFixed(0) }}
        </text>
      </g>
    </svg>
  </figure>
</template>
