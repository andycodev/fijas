<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDownIcon } from '@heroicons/vue/24/solid';
import RationaleBlock from './RationaleBlock.vue';
import StatusBadge from './StatusBadge.vue';
import { selectionLabel } from '../lib/markets';
import type { RecommendationRow } from '../types/db';

// Una recomendación registrada: qué se recomendó, a qué cuota, y en qué estado está. Se despliega para ver la justificación congelada.
const props = defineProps<{ rec: RecommendationRow; now: number }>();
const open = ref(false);

const odds = computed(() => Number(props.rec.odds));
const prob = computed(() => Number(props.rec.model_probability));
const ev = computed(() => Number(props.rec.ev));
const unit = computed(() => (props.rec.market === 'goals_total' ? 'goles' : 'córners'));

const when = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
const evText = computed(() => `${ev.value >= 0 ? '+' : '−'}${Math.abs(ev.value * 100).toFixed(1)}%`);
</script>

<template>
  <article class="card p-pad-sm text-xs">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="text-sm font-bold">{{ rec.match?.home?.name }} vs {{ rec.match?.away?.name }}</p>
        <p class="text-ink/60">{{ rec.match?.league?.name ?? 'Sin liga' }} · {{ when(rec.kickoff_at ?? rec.match?.kickoff_at) }}</p>
      </div>
      <StatusBadge :rec="rec" :now="now" />
    </div>

    <p class="mt-stack-sm flex flex-wrap items-center gap-2 text-sm font-extrabold text-brand">
      {{ selectionLabel(rec.market, rec.side, Number(rec.line)) }}
      <span v-if="rec.category === 'low_value'" class="rounded-full bg-sunken px-2 py-0.5 text-cap font-bold text-ink/65" title="Valor entre 0 y el umbral: se registra para estudiarla, no es una recomendación principal">Estudio</span>
    </p>

    <dl class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-ink/70">
      <div><dt class="inline">Prob. </dt><dd class="num inline font-bold text-ink">{{ (prob * 100).toFixed(0) }}%</dd></div>
      <div><dt class="inline">Cuota </dt><dd class="num inline font-bold text-ink">{{ odds.toFixed(2) }}</dd></div>
      <div><dt class="inline">EV </dt><dd class="num inline font-bold" :class="ev >= 0 ? 'text-value' : 'text-novalue'">{{ evText }}</dd></div>
      <div v-if="rec.actual_value !== null"><dt class="inline">Resultado real </dt><dd class="num inline font-bold text-ink">{{ rec.actual_value }} {{ unit }}</dd></div>
    </dl>

    <p v-if="rec.result === 'void' && rec.resolution_note" class="mt-1 text-ink/55">{{ rec.resolution_note }}</p>

    <button type="button" class="mt-1 inline-flex min-h-touch items-center gap-1 font-semibold text-brand" :aria-expanded="open" @click="open = !open">
      Justificación <ChevronDownIcon class="h-4 w-4 transition-transform" :class="{ 'rotate-180': open }" aria-hidden="true" />
    </button>
    <RationaleBlock v-if="open" :rec="rec" :now="now" />
  </article>
</template>
