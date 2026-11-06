<script setup lang="ts">
import Betano from './Betano.vue';
import { computed, reactive, ref } from 'vue';
import { ChevronDownIcon } from '@heroicons/vue/24/outline';
import { signalFor, type Signal } from '../lib/value';
import ProbabilityMeter from './ProbabilityMeter.vue';
import VerdictChip from './VerdictChip.vue';
import { BAND_CLASS, BAND_LABEL } from '../lib/probability';
import { MARKET_LABEL } from '../lib/markets';
import { confidenceFor, listSelections, type CalibrationBucket, type Confidence, type Selection } from '../lib/opportunities';
import { useSaveOdds } from '../composables/usePicks';
import backtest from '../data/backtest.json';
import WhyModal from './WhyModal.vue';
import EvModal from './EvModal.vue';
import HighValueNotice from './HighValueNotice.vue';
import { InformationCircleIcon } from '@heroicons/vue/24/outline';
import { HIGH_EV } from '../lib/stake';
import type { Market, OddsRow, UpcomingMatch } from '../types/db';

const props = defineProps<{
  match: UpcomingMatch;
  market: Market;
  odds: OddsRow[];
  threshold: number; // umbral de valor
  minProbability: number; // solo se muestran selecciones con esta probabilidad o más (0 = todas)
}>();

const VISIBLE = 6;
const open = ref(false);
const showAll = ref(false);
const save = useSaveOdds();
const whyOpen = ref<Selection | null>(null); // selección cuyo análisis detallado está abierto (en una ventana)
const evOpen = ref<Selection | null>(null); // selección cuya explicación del valor esperado está abierta

const picks = computed(() => props.match.picks.filter((p) => p.market === props.market));
const projection = computed(() => picks.value[0]?.projection ?? null);
const kickoff = computed(() =>
  new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(props.match.kickoff_at),
  ),
);

// Cuotas que el usuario escribe a mano (confirmadas), por línea.
const inputs = reactive<Record<number, { over: number | null; under: number | null }>>({});
for (const p of picks.value) {
  const saved = props.odds.find((o) => o.origin === 'manual' && o.market === props.market && Number(o.line) === Number(p.line));
  inputs[p.line] = { over: saved?.over_odds ?? null, under: saved?.under_odds ?? null };
}

// Cuotas efectivas: las del proveedor más lo que el usuario tiene escrito en pantalla (que manda sobre ellas).
const rows = computed<OddsRow[]>(() => {
  const typed: OddsRow[] = Object.entries(inputs)
    .filter(([, v]) => (v.over && v.over > 1) || (v.under && v.under > 1))
    .map(([line, v]) => ({
      id: -Number(line), match_id: props.match.id, market: props.market, line: Number(line),
      over_odds: v.over && v.over > 1 ? v.over : null, under_odds: v.under && v.under > 1 ? v.under : null,
      origin: 'manual' as const, captured_at: '',
    }));
  return [...props.odds.filter((o) => o.origin === 'auto'), ...typed];
});

const all = computed(() => listSelections([{ ...props.match, picks: picks.value }], rows.value));
const eligible = computed(() => all.value.filter((s) => s.probability >= props.minProbability));

// Primero lo que tiene cuota de Betano, de mayor a menor valor; después lo demás, de más a menos probable.
const sorted = computed(() =>
  [...eligible.value].sort((a, b) => {
    if ((a.ev === null) !== (b.ev === null)) return a.ev === null ? 1 : -1;
    if (a.ev !== null && b.ev !== null) return b.ev - a.ev;
    return b.probability - a.probability;
  }),
);
const visible = computed(() => (showAll.value ? sorted.value : sorted.value.slice(0, VISIBLE)));
const best = computed(() => sorted.value.find((s) => s.ev !== null && signalFor(s.ev, props.threshold) === 'green') ?? null);
const hidden = computed(() => all.value.length - eligible.value.length);

const signalOf = (s: Selection): Signal | null => (s.ev === null ? null : signalFor(s.ev, props.threshold));
const needed = (s: Selection) => (1 + props.threshold) / s.probability;

const buckets = computed(() => (backtest.markets as Record<string, { buckets: CalibrationBucket[] }>)[props.market]?.buckets);
const confidenceOf = (s: Selection) => confidenceFor(s, buckets.value);
const CONF_LABEL: Record<Confidence, string> = { high: 'Confianza alta', medium: 'Confianza media', low: 'Confianza baja' };
const CONF_DOT: Record<Confidence, string> = { high: 'bg-value', medium: 'bg-marginal', low: 'bg-novalue' };

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const odds2 = (o: number) => o.toFixed(2);
const evText = (ev: number) => `${ev >= 0 ? '+' : '−'}${Math.abs(ev * 100).toFixed(1)}%`;
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const daysAgo = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)) : null);

function persist(line: number) {
  const i = inputs[line]!;
  save.mutate({ match_id: props.match.id, market: props.market, line, over: i.over || null, under: i.under || null });
}
</script>

<template>
  <article class="card overflow-hidden" :class="{ 'col-span-full': open }">
    <button class="flex min-h-touch w-full items-center gap-3 px-3 py-2.5 text-left" :aria-expanded="open" @click="open = !open">
      <div class="min-w-0 flex-1">
        <p class="eyebrow">{{ match.league?.name }} · {{ kickoff }}</p>
        <p class="truncate text-base font-extrabold">{{ match.home?.name }} <span class="font-semibold text-ink/45">vs</span> {{ match.away?.name }}</p>
        <p class="mt-1.5 text-xs">
          <span v-if="best" class="inline-flex items-center rounded-full bg-value/15 px-2.5 py-1 font-bold text-value">
            Mejor: {{ best.side === 'over' ? 'Más de' : 'Menos de' }} {{ best.line }} · {{ evText(best.ev!) }}
          </span>
          <span v-else-if="eligible.some((s) => s.betano)" class="text-ink/60">Sin selecciones con valor ahora</span>
          <span v-else class="text-ink/60">Sin cuotas de <Betano /></span>
        </p>
      </div>
      <div class="text-right">
        <p class="text-[11px] text-ink/55">{{ MARKET_LABEL[market] }} esperados</p>
        <p class="num text-2xl font-extrabold leading-none text-brand">{{ projection?.toFixed(1) }}</p>
      </div>
      <ChevronDownIcon class="h-5 w-5 shrink-0 text-ink/50 transition-transform" :class="{ 'rotate-180': open }" />
    </button>

    <div v-if="open" class="border-t border-line">
      <ul class="grid divide-y divide-line lg:grid-cols-2 lg:gap-px lg:divide-y-0 lg:bg-line xl:grid-cols-3 [&>li:last-child:nth-child(odd)]:lg:col-span-2 xl:[&>li:last-child:nth-child(odd)]:col-span-1">
        <li v-for="s in visible" :key="s.key" class="space-y-2 bg-surface px-3 py-3">
          <!-- Selección + veredicto -->
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <button
                v-if="s.ev !== null"
                type="button"
                class="mb-1.5 inline-flex min-h-touch items-center gap-1.5 rounded-lg px-3 text-sm font-extrabold"
                :class="signalOf(s) === 'green' ? 'bg-value/15 text-value' : signalOf(s) === 'yellow' ? 'bg-marginal/15 text-marginal' : 'bg-novalue/15 text-novalue'"
                aria-haspopup="dialog"
                :aria-label="`Valor esperado ${evText(s.ev)}. Ver cómo se calcula`"
                @click="evOpen = s"
              >
                Valor esperado {{ evText(s.ev) }}
                <InformationCircleIcon class="h-5 w-5" aria-hidden="true" />
              </button>
              <p class="text-base font-extrabold">{{ s.side === 'over' ? 'Más de' : 'Menos de' }} {{ s.line }} {{ MARKET_LABEL[market].toLowerCase() }}</p>
            </div>
            <VerdictChip :signal="signalOf(s)" />
          </div>

          <!-- Predicción -->
          <div class="rounded-lg bg-tint/45 p-3">
            <div class="flex items-end justify-between gap-3">
              <div>
                <p class="eyebrow text-brand">Predicción</p>
                <p class="num text-3xl font-extrabold leading-none text-brand">{{ pct(s.probability) }}</p>
              </div>
              <div class="text-right text-xs">
                <p class="text-ink/60">Cuota justa</p>
                <p class="num text-lg font-extrabold">{{ odds2(s.fairOdds) }}</p>
              </div>
            </div>
            <div class="mt-2"><ProbabilityMeter :value="s.probability" :min="minProbability || null" /></div>
            <span class="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold" :class="BAND_CLASS[s.band]">{{ BAND_LABEL[s.band] }}</span>
          </div>

          <!-- Recomendación -->
          <div class="rounded-lg border border-line p-3 text-xs">
            <p class="eyebrow mb-1">Recomendación</p>
            <template v-if="s.betano">
              <p>
                <Betano /> paga <strong class="num text-base">{{ odds2(s.betano.odds) }}</strong>
                <span :class="s.betano.odds >= s.fairOdds ? 'text-value' : 'text-novalue'">
                  · {{ s.betano.odds >= s.fairOdds ? '+' : '−' }}{{ Math.abs(s.betano.odds - s.fairOdds).toFixed(2) }} frente a la justa
                </span>
              </p>
              <p v-if="signalOf(s) !== 'green'" class="mt-0.5 text-ink/70">
                Para valer la pena debería pagar al menos <strong class="num">{{ odds2(needed(s)) }}</strong>.
              </p>
              <p class="mt-0.5 text-[11px] text-ink/50">
                <template v-if="s.betano.origin === 'manual'">Cuota escrita por ti (confirmada)</template>
                <template v-else><Betano /> vía proveedor · {{ fmtTime(s.betano.capturedAt) }} · sin verificar</template>
              </p>
            </template>
            <p v-else class="text-ink/55">No hay cuota de <Betano /> para esta selección.</p>
          </div>

          <!-- Estadísticas -->
          <p class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-sunken px-3 py-2 text-[11px] text-ink/65">
            <span class="eyebrow !text-[10px]">Estadísticas</span>
            <span><strong class="num">{{ s.gamesHome ?? '?' }} + {{ s.gamesAway ?? '?' }}</strong> partidos</span>
            <span v-if="daysAgo(s.latestGameAt) !== null">· dato más antiguo de hace {{ daysAgo(s.latestGameAt) }} d</span>
            <span class="inline-flex items-center gap-1 font-bold">· <span class="h-2 w-2 rounded-full" :class="CONF_DOT[confidenceOf(s).level]" aria-hidden="true" />{{ CONF_LABEL[confidenceOf(s).level] }}</span>
          </p>

          <div class="flex flex-wrap items-center gap-2">
            <input
              v-model.number="inputs[s.line]![s.side]"
              type="number"
              step="0.01"
              min="1.01"
              inputmode="decimal"
              placeholder="Tu cuota"
              class="field w-28"
              :aria-label="`Tu cuota de Betano para ${s.side === 'over' ? 'más' : 'menos'} de ${s.line}`"
              @change="persist(s.line)"
            />
            <button type="button" class="btn" aria-haspopup="dialog" @click="whyOpen = s">
              ¿Por qué esta probabilidad?
            </button>
          </div>

          <HighValueNotice
            v-if="s.betano && s.ev !== null && s.ev > HIGH_EV"
            :ev="s.ev"
            :probability="s.probability"
            :odds="s.betano.odds"
            :origin="s.betano.origin"
            :captured-at="s.betano.capturedAt"
          />
        </li>
      </ul>

      <p v-if="!visible.length" class="px-4 py-3 text-xs text-ink/60">
        Ninguna selección de este mercado llega a la probabilidad mínima.
      </p>

      <button
        v-if="sorted.length > VISIBLE"
        class="btn w-full !rounded-none !border-x-0 !border-b-0"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Ver menos' : `Ver las ${sorted.length - VISIBLE} restantes` }}
      </button>
      <p v-if="hidden > 0" class="border-t border-line px-4 py-2 text-[11px] text-ink/50">
        {{ hidden }} selecciones con menos de {{ Math.round(minProbability * 100) }}% de probabilidad no se muestran.
      </p>

      <p v-if="save.isError.value" role="alert" class="px-4 pb-3 text-xs font-semibold text-novalue">
        No se pudo guardar la cuota.
      </p>
    </div>

    <EvModal v-if="evOpen" :selection="evOpen" @close="evOpen = null" />
    <WhyModal v-if="whyOpen" :selection="whyOpen" @close="whyOpen = null" />
  </article>
</template>
