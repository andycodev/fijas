<script setup lang="ts">
import Betano from './Betano.vue';
import { computed, ref } from 'vue';
import { analyze, confidenceFor, type CalibrationBucket, type Confidence, type Selection } from '../lib/opportunities';
import { BAND_CLASS, BAND_LABEL } from '../lib/probability';
import { MARKET_LABEL, selectionLabel } from '../lib/markets';
import backtest from '../data/backtest.json';
import BetDialog from './BetDialog.vue';
import WhyPanel from './WhyPanel.vue';
import type { OddsRow, UpcomingMatch } from '../types/db';

const props = defineProps<{
  matches: UpcomingMatch[];
  odds: OddsRow[];
  minProbability: number; // 0.75 = 75 %
  valueThreshold: number;
}>();
const emit = defineEmits<{ 'update:minProbability': [value: number] }>();

const analysis = computed(() =>
  analyze(props.matches, props.odds, { minProbability: props.minProbability, valueThreshold: props.valueThreshold }),
);
const minPct = computed({
  get: () => Math.round(props.minProbability * 100),
  set: (v: number) => {
    if (Number.isFinite(v) && v >= 50 && v <= 99) emit('update:minProbability', v / 100);
  },
});

const betting = ref<Selection | null>(null);
const whyOpen = ref<Record<string, boolean>>({});

const buckets = (market: string) =>
  (backtest.markets as Record<string, { buckets: CalibrationBucket[] }>)[market]?.buckets;
const confidenceOf = (s: Selection) => confidenceFor(s, buckets(s.market));

const CONF_LABEL: Record<Confidence, string> = { high: 'Confianza alta', medium: 'Confianza media', low: 'Confianza baja' };
const CONF_CLASS: Record<Confidence, string> = { high: 'text-value', medium: 'text-marginal', low: 'text-novalue' };

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const evText = (ev: number) => `${ev >= 0 ? '+' : '−'}${Math.abs(ev * 100).toFixed(1)}%`;
const when = (iso: string) =>
  new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const days = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)) : null);
const needed = (s: Selection) => (1 + props.valueThreshold) / s.probability;
const label = (s: Selection) => selectionLabel(s.market, s.side, s.line);
const game = (s: Selection) => `${s.match.home?.name} vs ${s.match.away?.name}`;
</script>

<template>
  <section class="mb-4 space-y-3" aria-labelledby="analysis-title">
    <div class="card space-y-3 p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 id="analysis-title" class="font-bold">Resumen del análisis</h2>
          <p class="text-xs text-ink/60">Cada paso descarta lo que no cumple. Solo se recomienda lo que pasa todos.</p>
        </div>
        <label class="block shrink-0 space-y-1 text-right">
          <span class="text-[11px] font-semibold text-ink/60">Probabilidad mínima</span>
          <span class="flex items-center justify-end gap-1">
            <input
              v-model.number="minPct"
              type="number"
              min="50"
              max="99"
              step="1"
              inputmode="numeric"
              class="field !w-16 text-right"
              aria-label="Probabilidad mínima en porcentaje"
            />
            <span class="font-bold">%</span>
          </span>
        </label>
      </div>

      <ol class="grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
        <li class="rounded-md border border-line p-2">
          <p class="text-ink/60">Partidos analizados</p>
          <p class="text-lg font-extrabold">{{ analysis.matchesAnalyzed }}</p>
        </li>
        <li class="rounded-md border border-line p-2">
          <p class="text-ink/60">Mercados evaluados</p>
          <p class="text-lg font-extrabold">{{ analysis.marketsEvaluated }}</p>
          <p class="text-[11px] text-ink/50">{{ analysis.selectionsEvaluated }} selecciones</p>
        </li>
        <li class="rounded-md border border-line p-2">
          <p class="text-ink/60">Cumplen {{ minPct }}% o más</p>
          <p class="text-lg font-extrabold">{{ analysis.meetMinimum.length }}</p>
          <p class="text-[11px] text-ink/50">{{ analysis.highProbabilityNoOdds.length }} sin cuota de <Betano /></p>
        </li>
        <li class="rounded-md border border-line p-2">
          <p class="text-ink/60">Con valor esperado positivo</p>
          <p class="text-lg font-extrabold">{{ analysis.recommended.length }}</p>
          <p class="text-[11px] text-ink/50">{{ analysis.highProbabilityNoValue.length }} sin valor</p>
        </li>
        <li class="col-span-2 rounded-md border-2 border-value p-2 md:col-span-1">
          <p class="text-ink/60">Recomendadas</p>
          <p class="text-lg font-extrabold text-value">{{ analysis.recommended.length }}</p>
        </li>
      </ol>
    </div>

    <div v-if="!analysis.recommended.length" class="card p-4 text-ink/80">
      <p class="font-semibold">No se encontraron oportunidades que cumplan los criterios.</p>
      <p class="mt-1 text-xs text-ink/70">
        Criterios: probabilidad de {{ minPct }}% o más, cuota de <Betano /> disponible y valor esperado de
        {{ (valueThreshold * 100).toFixed(1) }}% o más.
        <template v-if="analysis.highProbabilityNoValue.length">
          Hay {{ analysis.highProbabilityNoValue.length }} selecciones probables, pero <Betano /> las paga por debajo de su cuota justa.
        </template>
        No se fuerzan recomendaciones.
      </p>
    </div>

    <ul v-else class="space-y-3">
      <li v-for="s in analysis.recommended" :key="s.key" class="card space-y-3 p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs text-ink/60">{{ s.match.league?.name }} · {{ when(s.match.kickoff_at) }}</p>
            <p class="truncate font-bold">{{ game(s) }}</p>
            <p class="font-semibold">{{ label(s) }}</p>
            <p class="text-[11px] text-ink/50">{{ MARKET_LABEL[s.market] }} · partido completo</p>
          </div>
          <div class="text-right">
            <p class="text-[11px] font-semibold text-ink/60">Valor esperado</p>
            <p class="text-xl font-extrabold text-value">{{ evText(s.ev!) }}</p>
          </div>
        </div>

        <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs md:grid-cols-4">
          <div>
            <dt class="text-ink/60">Probabilidad estimada</dt>
            <dd class="font-bold">{{ pct(s.probability) }}</dd>
            <dd><span class="rounded px-1.5 py-0.5 text-[10px] font-bold" :class="BAND_CLASS[s.band]">{{ BAND_LABEL[s.band] }}</span></dd>
          </div>
          <div>
            <dt class="text-ink/60">Cuota justa (modelo)</dt>
            <dd class="font-bold">{{ s.fairOdds.toFixed(2) }}</dd>
          </div>
          <div>
            <dt class="text-ink/60">Cuota de <Betano /></dt>
            <dd class="font-bold">{{ s.betano!.odds.toFixed(2) }}</dd>
            <dd class="text-[11px] text-ink/50">
              {{ s.betano!.origin === 'manual' ? 'escrita por ti (confirmada)' : `vía proveedor, ${when(s.betano!.capturedAt)}, sin verificar` }}
            </dd>
          </div>
          <div>
            <dt class="text-ink/60">Diferencia con la justa</dt>
            <dd class="font-bold text-value">+{{ (s.betano!.odds - s.fairOdds).toFixed(2) }}</dd>
            <dd class="text-[11px] text-ink/50"><Betano /> paga más de lo justo</dd>
          </div>
        </dl>

        <p class="text-[11px] text-ink/60">
          Datos: {{ s.gamesHome ?? '?' }} y {{ s.gamesAway ?? '?' }} partidos
          <template v-if="days(s.latestGameAt) !== null"> · el más antiguo de los dos equipos fue hace {{ days(s.latestGameAt) }} días</template>
        </p>

        <p v-if="s.ev! > 0.15" class="text-[11px] font-semibold text-marginal">
          Un valor tan alto suele indicar una cuota mal leída o desfasada: compárala con tu <Betano /> antes de apostar.
        </p>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-bold" :class="CONF_CLASS[confidenceOf(s).level]">{{ CONF_LABEL[confidenceOf(s).level] }}</span>
          <div class="flex gap-2">
            <button class="btn !min-h-9 !px-3 text-xs" :aria-expanded="!!whyOpen[s.key]" @click="whyOpen[s.key] = !whyOpen[s.key]">
              ¿Por qué esta probabilidad?
            </button>
            <button class="btn btn-primary !min-h-9 !px-3 text-xs" @click="betting = s">Apostar</button>
          </div>
        </div>

        <WhyPanel v-if="whyOpen[s.key]" :selection="s" />
      </li>
    </ul>

    <details v-if="analysis.highProbabilityNoValue.length" class="card p-4">
      <summary class="min-h-touch cursor-pointer font-bold">
        Probables pero sin valor ({{ analysis.highProbabilityNoValue.length }})
      </summary>
      <p class="mb-2 text-xs text-ink/60">
        Cumplen {{ minPct }}% o más, pero <Betano /> paga menos de lo que necesitarían. Acertar a menudo no basta si la cuota no compensa.
      </p>
      <ul class="space-y-2 text-xs">
        <li v-for="s in analysis.highProbabilityNoValue" :key="s.key">
          <strong>{{ label(s) }}</strong> · {{ game(s) }}<br />
          Modelo {{ pct(s.probability) }} · <Betano /> paga {{ s.betano!.odds.toFixed(2) }}, necesitaría
          {{ needed(s).toFixed(2) }} · valor <span class="font-bold text-novalue">{{ evText(s.ev!) }}</span>
        </li>
      </ul>
    </details>

    <details v-if="analysis.highProbabilityNoOdds.length" class="card p-4">
      <summary class="min-h-touch cursor-pointer font-bold">
        Probables sin cuota de <Betano /> ({{ analysis.highProbabilityNoOdds.length }})
      </summary>
      <p class="mb-2 text-xs text-ink/60">No se puede calcular su valor. Si ves la cuota en tu <Betano />, escríbela en la tarjeta del partido.</p>
      <ul class="space-y-1 text-xs">
        <li v-for="s in analysis.highProbabilityNoOdds" :key="s.key">
          <strong>{{ label(s) }}</strong> · {{ game(s) }} · modelo {{ pct(s.probability) }} (cuota justa {{ s.fairOdds.toFixed(2) }})
        </li>
      </ul>
    </details>

    <BetDialog
      v-if="betting && betting.betano"
      :match-id="betting.matchId"
      :pick-id="betting.pickId"
      :market="betting.market"
      :match-label="game(betting)"
      :line="betting.line"
      :side="betting.side"
      :odds="betting.betano.odds"
      :model-probability="betting.probability"
      @close="betting = null"
    />
  </section>
</template>
