<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ChevronDownIcon } from '@heroicons/vue/24/outline';
import {
  MIN_ODDS_TARGET, edge, impliedProbability, riskFor, signalFor, type Risk, type Signal,
} from '../lib/value';
import { MARKET_LABEL } from '../lib/markets';
import { useSaveOdds } from '../composables/usePicks';
import BetDialog from './BetDialog.vue';
import { resolveOdds, type ResolvedOdds } from '../lib/opportunities';
import type { Market, OddsRow, PickLine, UpcomingMatch } from '../types/db';

const props = defineProps<{ match: UpcomingMatch; market: Market; odds: OddsRow[]; threshold: number }>();

const open = ref(false);
const showAll = ref(false);
const save = useSaveOdds();
const betting = ref<{ pickId: number; line: number; side: 'over' | 'under'; odds: number } | null>(null);

const picks = computed<PickLine[]>(() => props.match.picks.filter((p) => p.market === props.market));
const projection = computed(() => picks.value[0]?.projection ?? null);
const kickoff = computed(() =>
  new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(props.match.kickoff_at),
  ),
);

// Cuotas de Betano escritas por el usuario, por línea.
const inputs = reactive<Record<number, { over: number | null; under: number | null }>>({});
for (const p of picks.value) {
  const saved = props.odds.find((o) => o.origin === 'manual' && o.market === props.market && Number(o.line) === Number(p.line));
  inputs[p.line] = { over: saved?.over_odds ?? null, under: saved?.under_odds ?? null };
}

// Por defecto: las 4 líneas más parejas para el modelo y las que ya tienen cuota escrita.
const visible = computed(() => {
  if (showAll.value) return picks.value;
  const closest = [...picks.value].sort((a, b) => Math.abs(a.probability - 0.5) - Math.abs(b.probability - 0.5)).slice(0, 4);
  const keep = new Set(closest.map((p) => p.line));
  for (const p of picks.value) if (inputs[p.line]?.over || inputs[p.line]?.under) keep.add(p.line);
  return picks.value.filter((p) => keep.has(p.line));
});

const SIGNAL_CLASS: Record<Signal, string> = {
  green: 'bg-value/10 text-value',
  yellow: 'bg-marginal/10 text-marginal',
  red: 'bg-novalue/10 text-novalue',
};
const SIGNAL_LABEL: Record<Signal, string> = { green: 'Valor', yellow: 'Marginal', red: 'Sin valor' };
const RISK_LABEL: Record<Risk, string> = { low: 'Riesgo bajo', medium: 'Riesgo medio', high: 'Riesgo alto' };

interface SideView {
  side: 'over' | 'under';
  label: string;
  probability: number; // del modelo
  fairOdds: number; // 1 / probabilidad del modelo (NO es una cuota de Betano)
  betano: ResolvedOdds | null; // cuota de Betano: la que escribió el usuario o, si no hay, la del proveedor
}

function betanoFor(line: number, side: 'over' | 'under'): ResolvedOdds | null {
  const typed = inputs[line]?.[side];
  if (typed && typed > 1) return { odds: typed, origin: 'manual', capturedAt: '' };
  return resolveOdds(props.odds.filter((o) => o.origin === 'auto'), props.match.id, props.market, line, side);
}

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function sides(p: PickLine): SideView[] {
  return [
    { side: 'over', label: `Más de ${p.line}`, probability: p.probability, fairOdds: p.min_odds, betano: betanoFor(p.line, 'over') },
    { side: 'under', label: `Menos de ${p.line}`, probability: 1 - p.probability, fairOdds: 1 / (1 - p.probability), betano: betanoFor(p.line, 'under') },
  ];
}

function evaluate(s: SideView) {
  if (!s.betano) return null;
  const value = edge(s.probability, s.betano.odds);
  return { value, signal: signalFor(value, props.threshold) };
}

function persist(line: number) {
  const i = inputs[line]!;
  save.mutate({ match_id: props.match.id, market: props.market, line, over: i.over || null, under: i.under || null });
}

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const fmtOdds = (o: number) => o.toFixed(2);
</script>

<template>
  <article class="card">
    <button class="flex min-h-touch w-full items-center gap-3 p-4 text-left" :aria-expanded="open" @click="open = !open">
      <div class="min-w-0 flex-1">
        <p class="text-xs text-ink/60">{{ match.league?.name }} · {{ kickoff }}</p>
        <p class="truncate font-bold">{{ match.home?.name }} vs {{ match.away?.name }}</p>
      </div>
      <div class="text-right">
        <p class="text-xs text-ink/60">{{ MARKET_LABEL[market] }} esperados</p>
        <p class="font-extrabold">{{ projection?.toFixed(1) }}</p>
      </div>
      <ChevronDownIcon class="h-5 w-5 shrink-0 transition-transform" :class="{ 'rotate-180': open }" />
    </button>

    <div v-if="open" class="border-t border-line">
      <div v-for="p in visible" :key="p.line" class="space-y-3 border-b border-line px-4 py-3 last:border-b-0">
        <p class="text-xs font-semibold uppercase tracking-wide text-ink/50">Línea {{ p.line }}</p>

        <div v-for="s in sides(p)" :key="s.side" class="grid grid-cols-[1fr_6.5rem] items-start gap-3">
          <div class="min-w-0 space-y-0.5">
            <p class="font-bold">{{ s.label }}</p>
            <p class="text-xs text-ink/70">
              Modelo <strong>{{ pct(s.probability) }}</strong> · Cuota justa <strong>{{ fmtOdds(s.fairOdds) }}</strong>
            </p>
            <p class="text-[11px] text-ink/50">{{ RISK_LABEL[riskFor(s.probability)] }}</p>

            <template v-if="s.betano">
              <p class="text-xs text-ink/70">
                Betano <strong>{{ fmtOdds(s.betano.odds) }}</strong> · implícita {{ pct(impliedProbability(s.betano.odds)) }}
                <span v-if="s.betano.odds < MIN_ODDS_TARGET" class="text-ink/50">· bajo el mínimo {{ fmtOdds(MIN_ODDS_TARGET) }}</span>
              </p>
              <p class="text-[11px] text-ink/50">
                {{ s.betano.origin === 'manual' ? 'Escrita por ti (confirmada)' : `Betano vía proveedor · ${fmtTime(s.betano.capturedAt)} · sin verificar` }}
              </p>
              <div class="flex items-center gap-2 pt-1">
                <template v-for="ev in [evaluate(s)]" :key="s.side">
                  <span v-if="ev" class="rounded px-2 py-0.5 text-[11px] font-bold" :class="SIGNAL_CLASS[ev.signal]">
                    {{ SIGNAL_LABEL[ev.signal] }} {{ ev.value >= 0 ? '+' : '' }}{{ (ev.value * 100).toFixed(1) }}%
                  </span>
                </template>
                <button
                  type="button"
                  class="btn !min-h-9 !px-3 text-xs"
                  @click="betting = { pickId: p.id, line: p.line, side: s.side, odds: s.betano.odds }"
                >
                  Apostar
                </button>
              </div>
            </template>
            <p v-else class="text-xs text-ink/50">Sin cuota de Betano</p>
          </div>

          <input
            v-model.number="inputs[p.line]![s.side]"
            type="number"
            step="0.01"
            min="1.01"
            inputmode="decimal"
            placeholder="Tu cuota"
            class="field text-right"
            :aria-label="`Cuota de Betano para ${s.label}`"
            @change="persist(p.line)"
          />
        </div>
      </div>

      <button
        v-if="picks.length > visible.length || showAll"
        class="btn w-full !rounded-none !border-x-0 !border-b-0"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Ver solo las líneas más parejas' : 'Ver todas las líneas' }}
      </button>

      <p v-if="save.isError.value" role="alert" class="px-4 pb-3 text-xs font-semibold text-novalue">
        No se pudo guardar la cuota.
      </p>
    </div>

    <BetDialog
      v-if="betting"
      :match-id="match.id"
      :pick-id="betting.pickId"
      :market="market"
      :match-label="`${match.home?.name} vs ${match.away?.name}`"
      :line="betting.line"
      :side="betting.side"
      :odds="betting.odds"
      @close="betting = null"
    />
  </article>
</template>
