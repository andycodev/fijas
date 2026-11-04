<script setup lang="ts">
import { computed, ref } from 'vue';
import { MIN_ODDS_TARGET, impliedProbability } from '../lib/value';
import { MARKET_LABEL, selectionLabel } from '../lib/markets';
import { findOpportunities, type Confidence, type Opportunity } from '../lib/opportunities';
import type { OddsRow, UpcomingMatch } from '../types/db';
import BetDialog from './BetDialog.vue';

const props = defineProps<{ matches: UpcomingMatch[]; odds: OddsRow[]; threshold: number }>();

const opportunities = computed(() => findOpportunities(props.matches, props.odds, props.threshold));
const betting = ref<Opportunity | null>(null);

const CONF_LABEL: Record<Confidence, string> = { high: 'Confianza alta', medium: 'Confianza media', low: 'Confianza baja' };
const CONF_HELP: Record<Confidence, string> = {
  high: 'Probabilidad entre 30% y 70%: la zona donde el modelo está mejor calibrado.',
  medium: 'Probabilidad entre 15% y 30% o entre 70% y 85%: hay menos casos históricos.',
  low: 'Probabilidad en una cola (menos de 15% o más de 85%): los supuestos del modelo pesan más.',
};

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const time = (iso: string) =>
  new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
</script>

<template>
  <section class="mb-4" aria-labelledby="opps-title">
    <h2 id="opps-title" class="mb-2 font-bold">Oportunidades con valor ({{ opportunities.length }})</h2>

    <div v-if="!opportunities.length" class="card p-4 text-ink/70">
      Con las cuotas de Betano disponibles no hay selecciones con valor esperado igual o mayor a tu umbral
      ({{ (threshold * 100).toFixed(1) }}%). No se fuerzan recomendaciones.
    </div>

    <ul v-else class="space-y-3">
      <li v-for="o in opportunities" :key="`${o.matchId}-${o.market}-${o.line}-${o.side}`" class="card space-y-2 p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs text-ink/60">{{ o.match.league?.name }} · {{ time(o.match.kickoff_at) }}</p>
            <p class="truncate font-bold">{{ o.match.home?.name }} vs {{ o.match.away?.name }}</p>
            <p class="font-semibold">{{ selectionLabel(o.market, o.side, o.line) }}</p>
            <p class="text-[11px] text-ink/50">{{ MARKET_LABEL[o.market] }} · partido completo</p>
          </div>
          <div class="text-right">
            <p class="text-[11px] font-semibold text-ink/60">Valor esperado</p>
            <p class="text-xl font-extrabold text-value">+{{ (o.ev * 100).toFixed(1) }}%</p>
          </div>
        </div>

        <dl class="grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt class="text-ink/60">Cuota Betano</dt>
            <dd class="font-bold">{{ o.odds.toFixed(2) }}</dd>
          </div>
          <div>
            <dt class="text-ink/60">Modelo</dt>
            <dd class="font-bold">{{ pct(o.probability) }}</dd>
          </div>
          <div>
            <dt class="text-ink/60">Cuota justa</dt>
            <dd class="font-bold">{{ o.fairOdds.toFixed(2) }}</dd>
          </div>
        </dl>

        <p class="text-[11px] text-ink/60">
          Implícita de la cuota {{ pct(impliedProbability(o.odds)) }} ·
          <template v-if="o.origin === 'manual'">cuota escrita por ti (confirmada)</template>
          <template v-else>Betano vía proveedor, actualizada {{ time(o.capturedAt) }}, <strong>sin verificar</strong></template>
          <template v-if="o.odds < MIN_ODDS_TARGET"> · bajo el mínimo {{ MIN_ODDS_TARGET.toFixed(2) }}</template>
        </p>

        <p v-if="o.ev > 0.15" class="text-[11px] font-semibold text-marginal">
          Un valor tan alto suele indicar una cuota mal leída o desfasada: compruébala en Betano antes de apostar.
        </p>

        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-semibold text-ink/70" :title="CONF_HELP[o.confidence]">{{ CONF_LABEL[o.confidence] }}</span>
          <button class="btn !min-h-9 !px-3 text-xs" @click="betting = o">Apostar</button>
        </div>
      </li>
    </ul>

    <BetDialog
      v-if="betting"
      :match-id="betting.matchId"
      :pick-id="betting.pickId"
      :market="betting.market"
      :match-label="`${betting.match.home?.name} vs ${betting.match.away?.name}`"
      :line="betting.line"
      :side="betting.side"
      :odds="betting.odds"
      :model-probability="betting.probability"
      @close="betting = null"
    />
  </section>
</template>
