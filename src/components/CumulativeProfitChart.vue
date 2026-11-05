<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EvalRow } from '../lib/evaluation';
import { formatMoney } from '../lib/format';
import { selectionLabel } from '../lib/markets';
import type { Market } from '../types/db';

// Ganancia teórica acumulada: lo que realmente ocurrió (línea sólida) frente a lo que el modelo esperaba (línea punteada, contexto).
// Una sola unidad (soles), un solo eje. Se lee de izquierda a derecha, recomendación tras recomendación.
interface Point {
  n: number;
  real: number;
  expected: number;
  row: EvalRow & { match?: { home?: { name: string } | null; away?: { name: string } | null } | null; side: 'over' | 'under'; line: number; market: Market };
}
const props = defineProps<{ points: Point[] }>();

const W = 640, H = 250, L = 52, R = 78, T = 14, B = 46;
const xs = computed(() => {
  const n = props.points.length;
  return (i: number) => L + (n <= 1 ? 0.5 : i / (n - 1)) * (W - L - R);
});
const bounds = computed(() => {
  const all = props.points.flatMap((p) => [p.real, p.expected]).concat(0);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 10) { hi += 5; lo -= 5; }
  const pad = (hi - lo) * 0.08;
  return { lo: lo - pad, hi: hi + pad };
});
const y = (v: number) => T + (1 - (v - bounds.value.lo) / (bounds.value.hi - bounds.value.lo)) * (H - T - B);

const path = (key: 'real' | 'expected') => props.points.map((p, i) => `${i ? 'L' : 'M'}${xs.value(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
const yTicks = computed(() => {
  const { lo, hi } = bounds.value;
  const step = [5, 10, 20, 25, 50, 100, 200, 500].find((s) => (hi - lo) / s <= 5) ?? 1000;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
});
const xTicks = computed(() => {
  const n = props.points.length;
  const step = Math.max(1, Math.ceil(n / 6));
  return props.points.map((p, i) => ({ i, n: p.n })).filter((t) => t.i % step === 0 || t.i === n - 1);
});

const last = computed(() => props.points[props.points.length - 1]);
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n))}`;

const hover = ref<number | null>(null);
const svg = ref<SVGSVGElement | null>(null);
function onMove(e: PointerEvent) {
  const r = svg.value?.getBoundingClientRect();
  if (!r || props.points.length === 0) return;
  const px = ((e.clientX - r.left) / r.width) * W;
  const n = props.points.length;
  const frac = (px - L) / (W - L - R);
  hover.value = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
}
const hp = computed(() => (hover.value === null ? null : props.points[hover.value]!));
const showTable = ref(false);
const tipLeft = computed(() => (hover.value === null ? 0 : (xs.value(hover.value) / W) * 100));
</script>

<template>
  <figure class="space-y-2">
    <figcaption class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm font-bold">Ganancia teórica acumulada</span>
      <span class="flex items-center gap-4 text-[11px] text-ink/65">
        <span class="inline-flex items-center gap-1.5"><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--chart-real)" stroke-width="2.5" stroke-linecap="round" /></svg>Real</span>
        <span class="inline-flex items-center gap-1.5"><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--chart-context)" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round" /></svg>Esperada por el modelo</span>
      </span>
    </figcaption>

    <p v-if="points.length < 2" class="rounded-lg bg-sunken p-3 text-xs text-ink/65">
      Se dibuja cuando haya al menos 2 recomendaciones resueltas. Hoy hay {{ points.length }}.
    </p>

    <div v-else-if="!showTable" class="relative">
      <svg ref="svg" :viewBox="`0 0 ${W} ${H}`" class="w-full touch-pan-y" role="img"
        :aria-label="`Ganancia teórica acumulada tras ${points.length} recomendaciones: real ${signed(last!.real)}, esperada ${signed(last!.expected)}`"
        @pointermove="onMove" @pointerleave="hover = null">
        <!-- Cuadrícula -->
        <g v-for="v in yTicks" :key="v">
          <line :x1="L" :x2="W - R" :y1="y(v)" :y2="y(v)" :stroke="v === 0 ? 'rgb(var(--c-ink) / 0.45)' : 'rgb(var(--c-line))'" :stroke-width="v === 0 ? 1.5 : 1" />
          <text :x="L - 6" :y="y(v) + 3" text-anchor="end" font-size="10" class="num fill-ink/55">{{ v }}</text>
        </g>
        <text :x="L - 6" :y="T - 3" text-anchor="end" font-size="9" class="fill-ink/55">S/</text>
        <g v-for="t in xTicks" :key="t.i">
          <text :x="xs(t.i)" :y="H - B + 16" text-anchor="middle" font-size="10" class="num fill-ink/55">{{ t.n }}</text>
        </g>
        <text :x="(L + W - R) / 2" :y="H - 6" text-anchor="middle" font-size="10" class="fill-ink/50">Recomendación resuelta nº</text>

        <!-- Series -->
        <path :d="path('expected')" fill="none" stroke="var(--chart-context)" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round" />
        <path :d="path('real')" fill="none" stroke="var(--chart-real)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Etiquetas directas al final -->
        <circle :cx="xs(points.length - 1)" :cy="y(last!.real)" r="4" fill="var(--chart-real)" stroke="rgb(var(--c-surface))" stroke-width="2" />
        <text :x="xs(points.length - 1) + 8" :y="y(last!.real) + (last!.real >= last!.expected ? -2 : 11)" font-size="11" font-weight="800" class="num fill-ink">{{ signed(last!.real) }}</text>
        <text :x="xs(points.length - 1) + 8" :y="y(last!.expected) + (last!.real >= last!.expected ? 11 : -2)" font-size="10" class="num fill-ink/60">{{ signed(last!.expected) }}</text>

        <!-- Cursor -->
        <g v-if="hp && hover !== null">
          <line :x1="xs(hover)" :x2="xs(hover)" :y1="T" :y2="H - B" stroke="rgb(var(--c-ink) / 0.3)" stroke-width="1" />
          <circle :cx="xs(hover)" :cy="y(hp.expected)" r="3.5" fill="var(--chart-context)" stroke="rgb(var(--c-surface))" stroke-width="1.5" />
          <circle :cx="xs(hover)" :cy="y(hp.real)" r="4.5" fill="var(--chart-real)" stroke="rgb(var(--c-surface))" stroke-width="2" />
        </g>
      </svg>

      <div v-if="hp" class="pointer-events-none absolute top-1 z-10 w-52 rounded-lg border border-line bg-surface p-2 text-[11px] shadow-card"
        :style="{ left: `${Math.min(Math.max(tipLeft, 18), 72)}%`, transform: 'translateX(-50%)' }" role="status">
        <p class="truncate font-bold">#{{ hp.n }} · {{ hp.row.match?.home?.name }} vs {{ hp.row.match?.away?.name }}</p>
        <p class="text-ink/65">{{ selectionLabel(hp.row.market, hp.row.side, Number(hp.row.line)) }} · cuota {{ Number(hp.row.odds).toFixed(2) }} ·
          <span :class="hp.row.result === 'won' ? 'font-bold text-value' : 'font-bold text-novalue'">{{ hp.row.result === 'won' ? 'Ganada' : 'Perdida' }}</span></p>
        <p>Real <strong class="num">{{ signed(hp.real) }}</strong> · esperada <strong class="num">{{ signed(hp.expected) }}</strong></p>
      </div>
    </div>

    <!-- Vista de tabla (alternativa accesible al gráfico) -->
    <div v-else class="max-h-72 overflow-y-auto rounded-lg border border-line">
      <table class="w-full text-left text-xs">
        <caption class="sr-only">Ganancia teórica acumulada por recomendación</caption>
        <thead class="sticky top-0 bg-sunken text-ink/60"><tr><th class="px-3 py-1.5">Nº</th><th class="px-3 py-1.5">Partido</th><th class="px-3 py-1.5 text-right">Real</th><th class="px-3 py-1.5 text-right">Esperada</th></tr></thead>
        <tbody class="divide-y divide-line">
          <tr v-for="p in points" :key="p.n"><td class="num px-3 py-1.5">{{ p.n }}</td><td class="px-3 py-1.5">{{ p.row.match?.home?.name }} vs {{ p.row.match?.away?.name }}</td><td class="num px-3 py-1.5 text-right">{{ signed(p.real) }}</td><td class="num px-3 py-1.5 text-right">{{ signed(p.expected) }}</td></tr>
        </tbody>
      </table>
    </div>

    <button v-if="points.length >= 2" type="button" class="text-xs font-semibold text-brand underline" @click="showTable = !showTable">{{ showTable ? 'Ver gráfico' : 'Ver como tabla' }}</button>
    <p class="text-[11px] text-ink/55">Cada recomendación cuenta una unidad fija (la de tu perfil). No hay dinero real en juego.</p>
  </figure>
</template>
