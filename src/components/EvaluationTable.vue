<script setup lang="ts">
import { ref } from 'vue';
import { ChevronDownIcon } from '@heroicons/vue/24/solid';
import RationaleBlock from './RationaleBlock.vue';
import StatusBadge from './StatusBadge.vue';
import { selectionLabel } from '../lib/markets';
import type { RecommendationRow } from '../types/db';

// Tabla compacta de recomendaciones registradas (pendientes, en curso o finalizadas): una fila por recomendación y su
// justificación congelada desplegable. En pantallas pequeñas, ModelPerformance usa tarjetas apiladas con los mismos datos.
defineProps<{ rows: RecommendationRow[]; now: number }>();
const open = ref<number | null>(null);

const when = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
const evNum = (r: RecommendationRow) => Number(r.ev);
const evText = (r: RecommendationRow) => `${evNum(r) >= 0 ? '+' : '−'}${Math.abs(evNum(r) * 100).toFixed(1)}%`;
const unitOf = (r: RecommendationRow) => (r.market === 'goals_total' ? 'goles' : 'córners');
</script>

<template>
  <div class="card overflow-x-auto">
    <table class="w-full min-w-[44rem] text-left text-xs">
      <caption class="sr-only">Recomendaciones registradas del modelo y su resultado</caption>
      <thead class="bg-sunken text-ink/60">
        <tr>
          <th scope="col" class="px-pad-sm py-stack-sm font-semibold">Partido</th>
          <th scope="col" class="px-pad-sm py-stack-sm font-semibold">Estado</th>
          <th scope="col" class="px-pad-sm py-stack-sm font-semibold">Selección</th>
          <th scope="col" class="px-pad-sm py-stack-sm text-right font-semibold">Prob.</th>
          <th scope="col" class="px-pad-sm py-stack-sm text-right font-semibold">Cuota</th>
          <th scope="col" class="px-pad-sm py-stack-sm text-right font-semibold">EV</th>
          <th scope="col" class="px-pad-sm py-stack-sm text-right font-semibold">Resultado real</th>
          <th scope="col" class="px-pad-sm py-stack-sm"><span class="sr-only">Justificación</span></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-line">
        <template v-for="r in rows" :key="r.id">
          <tr class="align-top">
            <td class="px-pad-sm py-stack-sm">
              <p class="font-bold">{{ r.match?.home?.name }} <span class="font-semibold text-ink/45">vs</span> {{ r.match?.away?.name }}</p>
              <p class="text-ink/60">{{ r.match?.league?.name ?? 'Sin liga' }} · {{ when(r.kickoff_at ?? r.match?.kickoff_at) }}</p>
            </td>
            <td class="px-pad-sm py-stack-sm">
              <StatusBadge :rec="r" :now="now" />
              <p v-if="r.result === 'void' && r.resolution_note" class="mt-0.5 text-ink/55">{{ r.resolution_note }}</p>
            </td>
            <td class="px-pad-sm py-stack-sm">
              <p class="font-bold text-brand">{{ selectionLabel(r.market, r.side, Number(r.line)) }}</p>
              <span v-if="r.category === 'low_value'" class="rounded-full bg-sunken px-2 py-0.5 text-cap font-bold text-ink/65" title="Valor entre 0 y el umbral: se registra para estudiarla, no es una recomendación principal">Estudio</span>
            </td>
            <td class="num px-pad-sm py-stack-sm text-right font-semibold">{{ (Number(r.model_probability) * 100).toFixed(0) }}%</td>
            <td class="num px-pad-sm py-stack-sm text-right font-semibold">{{ Number(r.odds).toFixed(2) }}</td>
            <td class="num px-pad-sm py-stack-sm text-right font-bold" :class="evNum(r) >= 0 ? 'text-value' : 'text-novalue'">{{ evText(r) }}</td>
            <td class="num px-pad-sm py-stack-sm text-right font-semibold">{{ r.actual_value !== null ? `${r.actual_value} ${unitOf(r)}` : '—' }}</td>
            <td class="px-pad-sm py-stack-sm text-right">
              <button type="button" class="inline-flex min-h-touch items-center gap-1 font-semibold text-brand" :aria-expanded="open === r.id" @click="open = open === r.id ? null : r.id">
                Justificación <ChevronDownIcon class="h-4 w-4 transition-transform" :class="{ 'rotate-180': open === r.id }" aria-hidden="true" />
              </button>
            </td>
          </tr>
          <tr v-if="open === r.id">
            <td colspan="8" class="px-pad-sm pb-stack-sm"><RationaleBlock :rec="r" :now="now" /></td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
