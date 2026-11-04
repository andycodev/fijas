<script setup lang="ts">
import { MARKET_LABEL } from '../lib/markets';
import backtest from '../data/backtest.json';
import type { Market } from '../types/db';

interface Bucket { label: string; n: number; predicted: number | null; actual: number | null }
interface MarketReport { period: string; evaluatedMatches: number; buckets: Bucket[] }

const reports = backtest.markets as Record<string, MarketReport>;
const order: Market[] = ['goals_total', 'corners_total'];

const generated = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(backtest.generatedAt));
const gap = (b: Bucket) => (b.predicted !== null && b.actual !== null ? b.actual - b.predicted : null);
</script>

<template>
  <details class="card p-4">
    <summary class="min-h-touch cursor-pointer font-bold">Precisión histórica del modelo</summary>
    <p class="mb-3 text-xs text-ink/70">
      Se recalculó cada partido usando solo lo que se sabía antes de jugarse. Cuando el modelo dijo «75–79%», ¿ocurrió realmente
      alrededor del 77% de las veces? Generado el {{ generated }}.
    </p>

    <div v-for="m in order" :key="m" class="mb-4 last:mb-0">
      <h3 class="mb-1 text-sm font-bold">{{ MARKET_LABEL[m] }} · {{ reports[m]?.evaluatedMatches }} partidos desde {{ reports[m]?.period }}</h3>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[22rem] text-left text-xs">
          <caption class="sr-only">Calibración del modelo de {{ MARKET_LABEL[m] }}</caption>
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
            <tr v-for="b in reports[m]?.buckets ?? []" :key="b.label">
              <th scope="row" class="py-1.5 pr-2 font-semibold">{{ b.label }}</th>
              <td class="py-1.5 pr-2 text-right">{{ b.n }}</td>
              <td class="py-1.5 pr-2 text-right">{{ b.predicted ?? '—' }}%</td>
              <td class="py-1.5 pr-2 text-right font-bold">{{ b.actual ?? '—' }}%</td>
              <td class="py-1.5 text-right" :class="gap(b) !== null && Math.abs(gap(b)!) > 3 ? 'text-marginal' : 'text-ink/70'">
                {{ gap(b) === null ? '—' : `${gap(b)! >= 0 ? '+' : ''}${gap(b)!.toFixed(1)} pts` }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p class="text-xs text-ink/60">
      Cada caso es una línea de un partido (varias líneas del mismo partido están relacionadas, no son independientes). Esto
      mide si las probabilidades son creíbles; <strong>no mide si las cuotas de Betano pagan lo suficiente</strong>: eso se
      comprueba con tus apuestas registradas.
    </p>
  </details>
</template>
