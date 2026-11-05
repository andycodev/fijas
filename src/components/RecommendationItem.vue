<script setup lang="ts">
import { computed, ref } from 'vue';
import { CheckCircleIcon, ChevronDownIcon, ClockIcon, MinusCircleIcon, PlayCircleIcon, XCircleIcon } from '@heroicons/vue/24/solid';
import { liveLabel, phaseOf } from '../lib/evaluation';
import { selectionLabel } from '../lib/markets';
import type { RecommendationRow } from '../types/db';

// Una recomendación registrada: qué se recomendó, a qué cuota, y en qué estado está. Se despliega para ver la justificación congelada.
const props = defineProps<{ rec: RecommendationRow; now: number }>();
const open = ref(false);

const phase = computed(() => phaseOf({ result: props.rec.result, kickoff_at: props.rec.kickoff_at ?? props.rec.match?.kickoff_at ?? null }, props.now));
const odds = computed(() => Number(props.rec.odds));
const prob = computed(() => Number(props.rec.model_probability));
const ev = computed(() => Number(props.rec.ev));
const unit = computed(() => (props.rec.market === 'goals_total' ? 'goles' : 'córners'));

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

const when = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
const evText = computed(() => `${ev.value >= 0 ? '+' : '−'}${Math.abs(ev.value * 100).toFixed(1)}%`);
</script>

<template>
  <article class="card p-3 text-xs">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="truncate text-sm font-bold">{{ rec.match?.home?.name }} vs {{ rec.match?.away?.name }}</p>
        <p class="truncate text-ink/60">{{ rec.match?.league?.name ?? 'Sin liga' }} · {{ when(rec.kickoff_at ?? rec.match?.kickoff_at) }}</p>
      </div>
      <span class="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" :class="badge.cls">
        <component :is="badge.icon" class="h-3.5 w-3.5" aria-hidden="true" />{{ badge.label }}
      </span>
    </div>

    <p class="mt-2 flex flex-wrap items-center gap-2 text-sm font-extrabold text-brand">
      {{ selectionLabel(rec.market, rec.side, Number(rec.line)) }}
      <span v-if="rec.category === 'low_value'" class="rounded-full bg-sunken px-2 py-0.5 text-[10px] font-bold text-ink/65" title="Valor entre 0 y el umbral: se registra para estudiarla, no es una recomendación principal">Estudio</span>
    </p>

    <dl class="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-ink/70">
      <div><dt class="inline">Prob. </dt><dd class="num inline font-bold text-ink">{{ (prob * 100).toFixed(0) }}%</dd></div>
      <div><dt class="inline">Cuota </dt><dd class="num inline font-bold text-ink">{{ odds.toFixed(2) }}</dd></div>
      <div><dt class="inline">EV </dt><dd class="num inline font-bold" :class="ev >= 0 ? 'text-value' : 'text-novalue'">{{ evText }}</dd></div>
      <div v-if="rec.actual_value !== null"><dt class="inline">Resultado real </dt><dd class="num inline font-bold text-ink">{{ rec.actual_value }} {{ unit }}</dd></div>
    </dl>
    <p v-if="rec.result === 'void' && rec.resolution_note" class="mt-1 text-ink/55">{{ rec.resolution_note }}</p>
    <p v-else-if="rec.result === 'pending' && phase === 'live'" class="mt-1 text-ink/55">El resultado se registra solo cuando el partido termina; no hace falta que hagas nada.</p>

    <button type="button" class="mt-2 inline-flex min-h-touch items-center gap-1 font-semibold text-brand" :aria-expanded="open" @click="open = !open">
      Justificación <ChevronDownIcon class="h-4 w-4 transition-transform" :class="{ 'rotate-180': open }" aria-hidden="true" />
    </button>
    <div v-if="open" class="space-y-1.5 rounded-lg bg-sunken p-3">
      <template v-if="rec.rationale">
        <p class="text-ink/80">{{ rec.rationale.summary }}</p>
        <p class="text-ink/60">
          Modelo {{ rec.rationale.model_version ?? '—' }} · proyección {{ rec.rationale.projection }} · cuota justa {{ rec.rationale.fair_odds }} ·
          {{ rec.rationale.games_home ?? '?' }} + {{ rec.rationale.games_away ?? '?' }} partidos usados · filtros de entonces: {{ Math.round(rec.rationale.min_probability * 100) }}% y valor ≥ {{ (rec.rationale.value_threshold * 100).toFixed(1) }}%
        </p>
        <ul v-if="rec.rationale.factors.length" class="list-disc space-y-0.5 pl-5 text-ink/70">
          <li v-for="(f, i) in rec.rationale.factors" :key="i"><strong>{{ f.title }}.</strong> {{ f.detail }}</li>
        </ul>
      </template>
      <p v-else class="text-ink/60">Sin justificación guardada.</p>
      <p v-if="rec.settled_at" class="text-ink/55">Resuelta el {{ when(rec.settled_at) }}<template v-if="rec.resolution_note"> · {{ rec.resolution_note }}</template>.</p>
    </div>
  </article>
</template>
