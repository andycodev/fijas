<script setup lang="ts">
import Betano from './Betano.vue';
import { computed, reactive, ref } from 'vue';
import { ChevronDownIcon } from '@heroicons/vue/24/outline';
import { signalFor, type Signal } from '../lib/value';
import { BAND_CLASS, BAND_LABEL } from '../lib/probability';
import { MARKET_LABEL } from '../lib/markets';
import { confidenceFor, listSelections, type CalibrationBucket, type Confidence, type Selection } from '../lib/opportunities';
import { useSaveOdds } from '../composables/usePicks';
import backtest from '../data/backtest.json';
import BetDialog from './BetDialog.vue';
import WhyPanel from './WhyPanel.vue';
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
const betting = ref<Selection | null>(null);
const whyOpen = ref<Record<string, boolean>>({});

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

const VERDICT: Record<Signal | 'none', { label: string; cls: string }> = {
  green: { label: 'Vale la pena', cls: 'bg-value/10 text-value' },
  yellow: { label: 'Marginal', cls: 'bg-marginal/10 text-marginal' },
  red: { label: 'No conviene', cls: 'bg-novalue/10 text-novalue' },
  none: { label: 'Sin cuota', cls: 'bg-line text-ink/70' },
};
const signalOf = (s: Selection): Signal | null => (s.ev === null ? null : signalFor(s.ev, props.threshold));
const verdictOf = (s: Selection) => VERDICT[signalOf(s) ?? 'none'];
const needed = (s: Selection) => (1 + props.threshold) / s.probability;

const buckets = computed(() => (backtest.markets as Record<string, { buckets: CalibrationBucket[] }>)[props.market]?.buckets);
const confidenceOf = (s: Selection) => confidenceFor(s, buckets.value);
const CONF_LABEL: Record<Confidence, string> = { high: 'Confianza alta', medium: 'Confianza media', low: 'Confianza baja' };
const CONF_CLASS: Record<Confidence, string> = { high: 'text-value', medium: 'text-marginal', low: 'text-novalue' };

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
  <article class="card">
    <button class="flex min-h-touch w-full items-center gap-3 p-4 text-left" :aria-expanded="open" @click="open = !open">
      <div class="min-w-0 flex-1">
        <p class="text-xs text-ink/60">{{ match.league?.name }} · {{ kickoff }}</p>
        <p class="truncate font-bold">{{ match.home?.name }} vs {{ match.away?.name }}</p>
        <p class="mt-1 text-xs">
          <span v-if="best" class="rounded bg-value/10 px-2 py-0.5 font-bold text-value">
            Mejor: {{ best.side === 'over' ? 'Más de' : 'Menos de' }} {{ best.line }} · {{ evText(best.ev!) }}
          </span>
          <span v-else-if="eligible.some((s) => s.betano)" class="text-ink/60">Sin selecciones con valor ahora</span>
          <span v-else class="text-ink/60">Sin cuotas de <Betano /></span>
        </p>
      </div>
      <div class="text-right">
        <p class="text-xs text-ink/60">{{ MARKET_LABEL[market] }} esperados</p>
        <p class="font-extrabold">{{ projection?.toFixed(1) }}</p>
      </div>
      <ChevronDownIcon class="h-5 w-5 shrink-0 transition-transform" :class="{ 'rotate-180': open }" />
    </button>

    <div v-if="open" class="border-t border-line">
      <ul>
        <li v-for="s in visible" :key="s.key" class="space-y-2 border-b border-line px-4 py-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-bold">{{ s.side === 'over' ? 'Más de' : 'Menos de' }} {{ s.line }} {{ MARKET_LABEL[market].toLowerCase() }}</p>
              <p class="text-xs text-ink/70">
                Modelo <strong>{{ pct(s.probability) }}</strong> · cuota justa <strong>{{ odds2(s.fairOdds) }}</strong>
              </p>
              <span class="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold" :class="BAND_CLASS[s.band]">{{ BAND_LABEL[s.band] }}</span>
            </div>
            <span class="shrink-0 rounded px-2 py-0.5 text-[11px] font-bold" :class="verdictOf(s).cls">{{ verdictOf(s).label }}</span>
          </div>

          <p v-if="s.betano" class="text-xs">
            <Betano /> paga <strong>{{ odds2(s.betano.odds) }}</strong>
            <template v-if="s.ev !== null"> · valor <strong :class="s.ev >= 0 ? 'text-value' : 'text-novalue'">{{ evText(s.ev) }}</strong></template>
            · {{ s.betano.odds >= s.fairOdds ? '+' : '−' }}{{ Math.abs(s.betano.odds - s.fairOdds).toFixed(2) }} frente a la justa
            <template v-if="signalOf(s) !== 'green'"> · para valer la pena debería pagar al menos <strong>{{ odds2(needed(s)) }}</strong></template>
            <span class="block text-[11px] text-ink/50">
              <template v-if="s.betano.origin === 'manual'">Cuota escrita por ti (confirmada)</template>
              <template v-else><Betano /> vía proveedor · {{ fmtTime(s.betano.capturedAt) }} · sin verificar</template>
            </span>
          </p>
          <p v-else class="text-xs text-ink/50">No hay cuota de <Betano /> para esta selección.</p>

          <p class="text-[11px] text-ink/60">
            Datos: {{ s.gamesHome ?? '?' }} y {{ s.gamesAway ?? '?' }} partidos<template v-if="daysAgo(s.latestGameAt) !== null">, el más antiguo de hace {{ daysAgo(s.latestGameAt) }} días</template>
            · <span class="font-bold" :class="CONF_CLASS[confidenceOf(s).level]">{{ CONF_LABEL[confidenceOf(s).level] }}</span>
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
            <button v-if="s.betano" type="button" class="btn" :class="signalOf(s) === 'green' ? 'btn-primary' : ''" @click="betting = s">
              Apostar
            </button>
            <button type="button" class="btn" :aria-expanded="!!whyOpen[s.key]" @click="whyOpen[s.key] = !whyOpen[s.key]">
              ¿Por qué esta probabilidad?
            </button>
          </div>

          <WhyPanel v-if="whyOpen[s.key]" :selection="s" />
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

    <BetDialog
      v-if="betting && betting.betano"
      :match-id="match.id"
      :pick-id="betting.pickId"
      :market="market"
      :match-label="`${match.home?.name} vs ${match.away?.name}`"
      :line="betting.line"
      :side="betting.side"
      :odds="betting.betano.odds"
      :model-probability="betting.probability"
      @close="betting = null"
    />
  </article>
</template>
