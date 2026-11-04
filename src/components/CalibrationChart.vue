<script setup lang="ts">
import { computed, ref } from 'vue';

// Gráfico de mancuernas: por cada tramo de probabilidad, lo que el modelo PREVIÓ (círculo hueco, de contexto)
// frente a lo que REALMENTE ocurrió (círculo lleno). Cuanto más corto el segmento, mejor calibrado el modelo.
interface Bucket { label: string; from: number; n: number; predicted: number | null; actual: number | null }
const props = defineProps<{ title: string; buckets: Bucket[]; minProbability?: number }>();

const rows = computed(() => props.buckets.filter((b) => b.n > 0 && b.predicted !== null && b.actual !== null));

const W = 360, LEFT = 86, RIGHT = 60, TOP = 22, ROW = 36, AXIS = 28;
const X0 = LEFT, X1 = W - RIGHT; // eje de 50 % a 100 %
const x = (v: number) => X0 + ((v - 50) / 50) * (X1 - X0);
const H = computed(() => TOP + rows.value.length * ROW + AXIS);
const ticks = [50, 60, 70, 80, 90, 100];
const minX = computed(() => (props.minProbability ? x(props.minProbability * 100) : null));

const hover = ref<number | null>(null);
const showTable = ref(false);
const fmt = (n: number) => n.toLocaleString('es');
const gap = (b: Bucket) => (b.actual! - b.predicted!);
</script>

<template>
  <figure class="space-y-2">
    <figcaption class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm font-bold">{{ title }}</span>
      <span class="flex items-center gap-3 text-[11px] text-ink/65">
        <span class="inline-flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="rgb(var(--c-surface))" stroke="var(--chart-context)" stroke-width="2" /></svg>Previsto (anillo)
        </span>
        <span class="inline-flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="var(--chart-real)" /></svg>Real (punto)
        </span>
      </span>
    </figcaption>

    <div v-if="!showTable" class="relative">
      <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" :aria-label="`${title}: previsto contra real por tramo de probabilidad`">
        <!-- Cuadrícula tenue -->
        <g v-for="t in ticks" :key="t">
          <line :x1="x(t)" :x2="x(t)" :y1="TOP - 6" :y2="H - AXIS + 4" stroke="rgb(var(--c-line))" stroke-width="1" />
          <text :x="x(t)" :y="H - 8" text-anchor="middle" font-size="9" class="fill-ink/55">{{ t }}%</text>
        </g>

        <!-- Tu probabilidad mínima -->
        <g v-if="minX !== null">
          <line :x1="minX" :x2="minX" :y1="TOP - 8" :y2="H - AXIS + 4" stroke="rgb(var(--c-accent))" stroke-width="1.5" stroke-dasharray="3 3" />
          <text :x="minX" :y="10" text-anchor="middle" font-size="9" font-weight="700" class="fill-brand">tu mínimo</text>
        </g>

        <text :x="W - 4" y="10" text-anchor="end" font-size="9" font-weight="700" class="fill-ink/55">Real</text>

        <g
          v-for="(b, i) in rows"
          :key="b.label"
          :transform="`translate(0 ${TOP + i * ROW})`"
          tabindex="0"
          role="img"
          :aria-label="`Tramo ${b.label}: previsto ${b.predicted}%, real ${b.actual}%, ${b.n} casos`"
          @mouseenter="hover = i"
          @mouseleave="hover = null"
          @focus="hover = i"
          @blur="hover = null"
        >
          <!-- Zona de contacto amplia (mayor que las marcas) -->
          <rect x="0" y="0" :width="W" :height="ROW" fill="transparent" />
          <text x="0" :y="ROW / 2 + 4" font-size="11" font-weight="600" class="fill-ink">{{ b.label }}</text>
          <!-- Segmento entre lo previsto y lo real -->
          <line :x1="x(b.predicted!)" :x2="x(b.actual!)" :y1="ROW / 2" :y2="ROW / 2" stroke="var(--chart-context)" stroke-width="2" stroke-linecap="round" opacity="0.7" />
          <!-- Previsto: círculo hueco -->
          <circle :cx="x(b.predicted!)" :cy="ROW / 2" r="7" fill="rgb(var(--c-surface))" stroke="var(--chart-context)" stroke-width="2" />
          <!-- Real: círculo lleno con anillo de la superficie -->
          <circle :cx="x(b.actual!)" :cy="ROW / 2" r="4.5" fill="var(--chart-real)" stroke="rgb(var(--c-surface))" stroke-width="1.5" />
          <text :x="W - 4" :y="ROW / 2 + 4" text-anchor="end" font-size="11" font-weight="800" class="num fill-ink">{{ b.actual }}%</text>
          <rect v-if="hover === i" x="0" y="1" :width="W" :height="ROW - 2" fill="rgb(var(--c-primary))" opacity="0.06" rx="6" />
        </g>
      </svg>

      <!-- Lectura al pasar el cursor o enfocar -->
      <div
        v-if="hover !== null && rows[hover]"
        class="pointer-events-none absolute right-0 top-0 z-10 w-52 rounded-lg border border-line bg-surface p-2.5 text-xs shadow-lg"
        role="status"
      >
        <p class="num text-sm font-extrabold">Real {{ rows[hover]!.actual }}%</p>
        <p class="text-ink/65">Tramo {{ rows[hover]!.label }} · el modelo previó {{ rows[hover]!.predicted }}%</p>
        <p class="text-ink/65">Diferencia {{ gap(rows[hover]!) >= 0 ? '+' : '' }}{{ gap(rows[hover]!).toFixed(1) }} puntos · {{ fmt(rows[hover]!.n) }} casos</p>
      </div>
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full min-w-[20rem] text-left text-xs">
        <caption class="sr-only">{{ title }}</caption>
        <thead class="text-ink/60">
          <tr>
            <th scope="col" class="py-1 pr-2 font-semibold">Tramo</th>
            <th scope="col" class="py-1 pr-2 text-right font-semibold">Casos</th>
            <th scope="col" class="py-1 pr-2 text-right font-semibold">Previsto</th>
            <th scope="col" class="py-1 pr-2 text-right font-semibold">Real</th>
            <th scope="col" class="py-1 text-right font-semibold">Diferencia</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <tr v-for="b in rows" :key="b.label">
            <th scope="row" class="py-1.5 pr-2 font-semibold">{{ b.label }}</th>
            <td class="num py-1.5 pr-2 text-right">{{ fmt(b.n) }}</td>
            <td class="num py-1.5 pr-2 text-right">{{ b.predicted }}%</td>
            <td class="num py-1.5 pr-2 text-right font-bold">{{ b.actual }}%</td>
            <td class="num py-1.5 text-right" :class="Math.abs(gap(b)) > 3 ? 'text-marginal' : 'text-ink/70'">{{ gap(b) >= 0 ? '+' : '' }}{{ gap(b).toFixed(1) }} pts</td>
          </tr>
        </tbody>
      </table>
    </div>

    <button type="button" class="text-xs font-semibold text-brand underline" @click="showTable = !showTable">
      {{ showTable ? 'Ver gráfico' : 'Ver como tabla' }}
    </button>
  </figure>
</template>
