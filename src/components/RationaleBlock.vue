<script setup lang="ts">
import { computed } from 'vue';
import { phaseOf } from '../lib/evaluation';
import type { RecommendationRow } from '../types/db';

// Justificación congelada de una recomendación (lo que el modelo sabía y calculó al recomendar) y cómo se resolvió.
const props = defineProps<{ rec: RecommendationRow; now: number }>();
const phase = computed(() => phaseOf({ result: props.rec.result, kickoff_at: props.rec.kickoff_at ?? props.rec.match?.kickoff_at ?? null }, props.now));
const when = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
</script>

<template>
  <div class="space-y-1.5 rounded-ctl bg-sunken p-pad-sm text-xs">
    <p v-if="rec.result === 'void' && rec.resolution_note" class="text-ink/55">{{ rec.resolution_note }}</p>
    <p v-else-if="rec.result === 'pending' && phase === 'live'" class="text-ink/55">El resultado se registra solo cuando el partido termina; no hace falta que hagas nada.</p>
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
</template>
