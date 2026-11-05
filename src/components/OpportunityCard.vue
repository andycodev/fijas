<script setup lang="ts">
import { computed, ref } from 'vue';
import { BeakerIcon, ChartBarIcon, InformationCircleIcon, SparklesIcon } from '@heroicons/vue/24/outline';
import Betano from './Betano.vue';
import EvModal from './EvModal.vue';
import HighValueNotice from './HighValueNotice.vue';
import ProbabilityMeter from './ProbabilityMeter.vue';
import VerdictChip from './VerdictChip.vue';
import WhyPanel from './WhyPanel.vue';
import { MARKET_LABEL, selectionLabel } from '../lib/markets';
import { confidenceFor, type CalibrationBucket, type Confidence, type Selection } from '../lib/opportunities';
import { BAND_CLASS, BAND_LABEL } from '../lib/probability';
import { HIGH_EV } from '../lib/stake';
import { signalFor } from '../lib/value';
import backtest from '../data/backtest.json';
import { slipItemFromSelection, slipKey, useBetSlipStore } from '../stores/betslip';

// Una oportunidad = una selección con cuota de Betano. Se presenta en tres zonas con función distinta:
// ESTADÍSTICAS (los datos usados), PREDICCIÓN (lo que calcula el modelo) y RECOMENDACIÓN (si la cuota compensa).
const props = defineProps<{ selection: Selection; threshold: number; minProbability: number }>();

const s = computed(() => props.selection);
const odds = computed(() => s.value.betano!.odds);
const ev = computed(() => s.value.ev ?? 0);
const signal = computed(() => signalFor(ev.value, props.threshold));
const confidence = computed(() =>
  confidenceFor(s.value, (backtest.markets as Record<string, { buckets: CalibrationBucket[] }>)[s.value.market]?.buckets),
);

const whyOpen = ref(false);
const evOpen = ref(false);
const slip = useBetSlipStore();
const inSlip = computed(() => slip.has(slipKey(props.selection.matchId, props.selection.market, props.selection.line, props.selection.side)));

const CONF: Record<Confidence, { label: string; dot: string }> = {
  high: { label: 'Confianza alta', dot: 'bg-value' },
  medium: { label: 'Confianza media', dot: 'bg-marginal' },
  low: { label: 'Confianza baja', dot: 'bg-novalue' },
};

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const evText = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)}%`;
const when = (iso: string) =>
  new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const daysAgo = computed(() =>
  s.value.latestGameAt ? Math.max(0, Math.floor((Date.now() - Date.parse(s.value.latestGameAt)) / 86_400_000)) : null,
);
const unit = computed(() => MARKET_LABEL[s.value.market].toLowerCase());
</script>

<template>
  <article class="card overflow-hidden">
    <!-- Cabecera -->
    <header class="pitch space-y-1.5 bg-gradient-to-br from-tint/70 to-transparent px-4 pb-3 pt-3">
      <button
        type="button"
        class="inline-flex min-h-touch items-center gap-1.5 rounded-lg px-3 text-sm font-extrabold"
        :class="signal === 'green' ? 'bg-value/15 text-value' : signal === 'yellow' ? 'bg-marginal/15 text-marginal' : 'bg-novalue/15 text-novalue'"
        aria-haspopup="dialog"
        :aria-label="`Valor esperado ${evText(ev)}. Ver cómo se calcula`"
        @click="evOpen = true"
      >
        Valor esperado {{ evText(ev) }}
        <InformationCircleIcon class="h-5 w-5" aria-hidden="true" />
      </button>

      <p class="eyebrow">{{ s.match.league?.name }} · {{ when(s.match.kickoff_at) }}</p>
      <h3 class="text-lg font-extrabold leading-tight">{{ s.match.home?.name }} <span class="font-semibold text-ink/45">vs</span> {{ s.match.away?.name }}</h3>
      <p class="flex flex-wrap items-center gap-2">
        <span class="text-base font-bold text-brand">{{ selectionLabel(s.market, s.side, s.line) }}</span>
        <span class="rounded-full bg-sunken px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink/60">{{ MARKET_LABEL[s.market] }} · partido completo</span>
      </p>
    </header>

    <div class="space-y-px bg-line">
      <!-- ESTADÍSTICAS: los datos con los que se calculó -->
      <section class="bg-sunken px-4 py-3" aria-label="Estadísticas">
        <p class="eyebrow mb-2 flex items-center gap-1.5"><ChartBarIcon class="h-4 w-4" aria-hidden="true" />Estadísticas</p>
        <dl class="grid grid-cols-3 gap-3 text-xs">
          <div>
            <dt class="text-ink/55">Partidos usados</dt>
            <dd class="num text-sm font-bold">{{ s.gamesHome ?? '?' }} + {{ s.gamesAway ?? '?' }}</dd>
          </div>
          <div>
            <dt class="text-ink/55">Dato más antiguo</dt>
            <dd class="text-sm font-bold">{{ daysAgo === null ? '—' : `hace ${daysAgo} d` }}</dd>
          </div>
          <div>
            <dt class="text-ink/55">Evidencia</dt>
            <dd class="flex items-center gap-1.5 text-sm font-bold">
              <span class="h-2 w-2 rounded-full" :class="CONF[confidence.level].dot" aria-hidden="true" />{{ CONF[confidence.level].label.replace('Confianza ', '') }}
            </dd>
          </div>
        </dl>
      </section>

      <!-- PREDICCIÓN: lo que calcula el modelo -->
      <section class="bg-tint/45 px-4 py-3" aria-label="Predicción">
        <p class="eyebrow mb-2 flex items-center gap-1.5 text-brand"><SparklesIcon class="h-4 w-4" aria-hidden="true" />Predicción del modelo</p>
        <div class="flex items-end justify-between gap-3">
          <div>
            <p class="num text-4xl font-extrabold leading-none tracking-tight text-brand">{{ pct(s.probability) }}</p>
            <p class="mt-1 text-[11px] text-ink/60">probabilidad de acertar</p>
          </div>
          <div class="text-right text-xs">
            <p class="text-ink/60">Cuota justa</p>
            <p class="num text-lg font-extrabold">{{ s.fairOdds.toFixed(2) }}</p>
          </div>
        </div>
        <div class="mt-3"><ProbabilityMeter :value="s.probability" :min="minProbability" /></div>
        <p class="flex flex-wrap items-center gap-2 text-xs text-ink/70">
          <span class="rounded-full px-2 py-0.5 text-[10px] font-bold" :class="BAND_CLASS[s.band]">{{ BAND_LABEL[s.band] }}</span>
          Proyección: <strong class="num">{{ s.projection.toFixed(1) }}</strong> {{ unit }} en el partido
        </p>
      </section>

      <!-- RECOMENDACIÓN: ¿la cuota compensa? -->
      <section class="bg-surface px-4 py-3" aria-label="Recomendación">
        <p class="eyebrow mb-2 flex items-center gap-1.5"><BeakerIcon class="h-4 w-4" aria-hidden="true" />Recomendación</p>
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs text-ink/60">Cuota de <Betano /></p>
            <p class="num text-3xl font-extrabold leading-none tracking-tight">{{ odds.toFixed(2) }}</p>
            <p class="mt-1 text-[11px]" :class="odds >= s.fairOdds ? 'text-value' : 'text-novalue'">
              {{ odds >= s.fairOdds ? '+' : '−' }}{{ Math.abs(odds - s.fairOdds).toFixed(2) }} frente a la cuota justa
            </p>
          </div>
          <VerdictChip :signal="signal" />
        </div>
        <p class="mt-2 text-[11px] text-ink/55">
          <template v-if="s.betano!.origin === 'manual'">Cuota escrita por ti (confirmada)</template>
          <template v-else><Betano /> vía proveedor · {{ when(s.betano!.capturedAt) }} · <strong>sin verificar</strong></template>
        </p>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button class="btn" :aria-expanded="whyOpen" @click="whyOpen = !whyOpen">¿Por qué esta probabilidad?</button>
          <button class="btn" :class="inSlip ? '!border-primary !text-brand' : 'btn-primary'" :aria-pressed="inSlip" @click="slip.toggle(slipItemFromSelection(s))">
            {{ inSlip ? 'En el boleto ✓' : 'Añadir al boleto' }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="ev > HIGH_EV" class="p-3">
      <HighValueNotice :ev="ev" :probability="s.probability" :odds="odds" :origin="s.betano!.origin" :captured-at="s.betano!.capturedAt" />
    </div>
    <div v-if="whyOpen" class="p-3"><WhyPanel :selection="s" /></div>

    <EvModal v-if="evOpen" :selection="s" @close="evOpen = false" />
  </article>
</template>
