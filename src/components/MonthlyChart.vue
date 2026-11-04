<script setup lang="ts">
import { computed } from 'vue';
import type { MonthSummary } from '../lib/finance';

const props = defineProps<{ months: MonthSummary[]; base: number }>();

const W = 320, H = 150, PAD_X = 12, PAD_TOP = 14, PAD_BOTTOM = 24;

const shown = computed(() => props.months.slice(-12));
const range = computed(() => {
  const values = [props.base, ...shown.value.map((m) => m.final)];
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15;
  return { min: min - pad, max: max + pad };
});

const y = (v: number) => PAD_TOP + ((range.value.max - v) / (range.value.max - range.value.min)) * (H - PAD_TOP - PAD_BOTTOM);
const slot = computed(() => (W - PAD_X * 2) / Math.max(shown.value.length, 1));
const baseY = computed(() => y(props.base));

const bars = computed(() =>
  shown.value.map((m, i) => {
    const top = y(m.final);
    const x = PAD_X + i * slot.value + slot.value * 0.2;
    return {
      key: m.key,
      x,
      width: slot.value * 0.6,
      y: Math.min(top, baseY.value),
      height: Math.max(Math.abs(top - baseY.value), 1.5),
      above: m.final >= props.base,
      label: new Intl.DateTimeFormat('es', { month: 'short' }).format(new Date(`${m.key}-15T12:00:00`)),
      value: m.final,
    };
  }),
);

const summary = computed(() =>
  `Saldo al cierre de cada mes frente a tu capital base de ${props.base}: ` +
  shown.value.map((m) => `${m.key} ${m.final.toFixed(2)}`).join(', '),
);
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" :aria-label="summary">
    <line :x1="PAD_X" :x2="W - PAD_X" :y1="baseY" :y2="baseY" stroke="currentColor" stroke-dasharray="4 3" class="text-ink/40" />
    <text :x="W - PAD_X" :y="baseY - 4" text-anchor="end" class="fill-ink/60" font-size="9">capital base {{ base }}</text>
    <g v-for="b in bars" :key="b.key">
      <rect :x="b.x" :y="b.y" :width="b.width" :height="b.height" rx="2" :class="b.above ? 'fill-value' : 'fill-novalue'" />
      <text :x="b.x + b.width / 2" :y="H - 8" text-anchor="middle" class="fill-ink/70" font-size="10">{{ b.label }}</text>
      <text :x="b.x + b.width / 2" :y="(b.above ? b.y : b.y + b.height) + (b.above ? -3 : 10)" text-anchor="middle" class="fill-ink" font-size="9" font-weight="700">
        {{ b.value.toFixed(0) }}
      </text>
    </g>
  </svg>
</template>
