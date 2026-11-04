<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ChevronDownIcon } from '@heroicons/vue/24/outline';
import { MIN_ODDS_TARGET, edge, signalFor, type Signal } from '../lib/value';
import { MARKET_LABEL, selectionLabel } from '../lib/markets';
import { resolveOdds, type ResolvedOdds } from '../lib/opportunities';
import { useSaveOdds } from '../composables/usePicks';
import BetDialog from './BetDialog.vue';
import type { Market, OddsRow, UpcomingMatch } from '../types/db';

const props = defineProps<{ match: UpcomingMatch; market: Market; odds: OddsRow[]; threshold: number }>();

const VISIBLE = 6;
const open = ref(false);
const showAll = ref(false);
const save = useSaveOdds();
const betting = ref<Selection | null>(null);

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

interface Selection {
  key: string;
  pickId: number;
  line: number;
  side: 'over' | 'under';
  label: string;
  probability: number; // del modelo
  fairOdds: number; // 1 / probabilidad (no es una cuota de Betano)
  betano: ResolvedOdds | null;
  ev: number | null; // valor esperado con la cuota de Betano
  signal: Signal | null;
  needed: number; // cuota mínima que debería pagar Betano para alcanzar tu umbral de valor
}

function betanoFor(line: number, side: 'over' | 'under'): ResolvedOdds | null {
  const typed = inputs[line]?.[side];
  if (typed && typed > 1) return { odds: typed, origin: 'manual', capturedAt: '' };
  return resolveOdds(props.odds.filter((o) => o.origin === 'auto'), props.match.id, props.market, line, side);
}

const selections = computed<Selection[]>(() =>
  picks.value.flatMap((p) =>
    (['over', 'under'] as const).map((side) => {
      const probability = side === 'over' ? Number(p.probability) : 1 - Number(p.probability);
      const betano = betanoFor(Number(p.line), side);
      const ev = betano ? edge(probability, betano.odds) : null;
      return {
        key: `${p.line}-${side}`,
        pickId: p.id,
        line: Number(p.line),
        side,
        label: selectionLabel(props.market, side, Number(p.line)),
        probability,
        fairOdds: 1 / probability,
        betano,
        ev,
        signal: ev === null ? null : signalFor(ev, props.threshold),
        needed: (1 + props.threshold) / probability,
      };
    }),
  ),
);

// Primero lo que tiene cuota de Betano, de mayor a menor valor; después lo demás, de más a menos probable.
const sorted = computed(() =>
  [...selections.value].sort((a, b) => {
    if ((a.ev === null) !== (b.ev === null)) return a.ev === null ? 1 : -1;
    if (a.ev !== null && b.ev !== null) return b.ev - a.ev;
    return Math.abs(a.probability - 0.5) - Math.abs(b.probability - 0.5);
  }),
);
const visible = computed(() => (showAll.value ? sorted.value : sorted.value.slice(0, VISIBLE)));

const best = computed(() => sorted.value.find((s) => s.ev !== null && s.signal === 'green') ?? null);
const withOddsCount = computed(() => selections.value.filter((s) => s.betano).length);

const VERDICT: Record<Signal | 'none', { label: string; cls: string }> = {
  green: { label: 'Vale la pena', cls: 'bg-value/10 text-value' },
  yellow: { label: 'Marginal', cls: 'bg-marginal/10 text-marginal' },
  red: { label: 'No conviene', cls: 'bg-novalue/10 text-novalue' },
  none: { label: 'Sin cuota', cls: 'bg-line text-ink/70' },
};
const verdictOf = (s: Selection) => VERDICT[s.signal ?? 'none'];

const pct = (p: number) => `${(p * 100).toFixed(0)}%`;
const odds2 = (o: number) => o.toFixed(2);
const evText = (ev: number) => `${ev >= 0 ? '+' : '−'}${Math.abs(ev * 100).toFixed(1)}%`;
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

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
            Mejor: {{ best.label }} · {{ evText(best.ev!) }}
          </span>
          <span v-else-if="withOddsCount" class="text-ink/60">Sin selecciones con valor ahora</span>
          <span v-else class="text-ink/60">Sin cuotas de Betano</span>
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
              <p class="font-bold">{{ s.label }}</p>
              <p class="text-xs text-ink/70">
                El modelo da <strong>{{ pct(s.probability) }}</strong> de acertar · cuota justa <strong>{{ odds2(s.fairOdds) }}</strong>
              </p>
            </div>
            <span class="shrink-0 rounded px-2 py-0.5 text-[11px] font-bold" :class="verdictOf(s).cls">{{ verdictOf(s).label }}</span>
          </div>

          <p v-if="s.betano" class="text-xs">
            Betano paga <strong>{{ odds2(s.betano.odds) }}</strong>
            <template v-if="s.ev !== null"> · valor <strong :class="s.ev >= 0 ? 'text-value' : 'text-novalue'">{{ evText(s.ev) }}</strong></template>
            <template v-if="s.signal !== 'green'"> · para valer la pena debería pagar al menos <strong>{{ odds2(s.needed) }}</strong></template>
            <template v-if="s.betano.odds < MIN_ODDS_TARGET"> · bajo tu mínimo de {{ odds2(MIN_ODDS_TARGET) }}</template>
            <span class="block text-[11px] text-ink/50">
              {{ s.betano.origin === 'manual' ? 'Cuota escrita por ti (confirmada)' : `Betano vía proveedor · ${fmtTime(s.betano.capturedAt)} · sin verificar` }}
            </span>
          </p>
          <p v-else class="text-xs text-ink/50">No hay cuota de Betano para esta selección.</p>

          <div class="flex items-center gap-2">
            <input
              v-model.number="inputs[s.line]![s.side]"
              type="number"
              step="0.01"
              min="1.01"
              inputmode="decimal"
              placeholder="Tu cuota"
              class="field w-28"
              :aria-label="`Tu cuota de Betano para ${s.label}`"
              @change="persist(s.line)"
            />
            <button
              v-if="s.betano"
              type="button"
              class="btn"
              :class="s.signal === 'green' ? 'btn-primary' : ''"
              @click="betting = s"
            >
              Apostar
            </button>
          </div>
        </li>
      </ul>

      <button
        v-if="sorted.length > VISIBLE"
        class="btn w-full !rounded-none !border-x-0 !border-b-0"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Ver menos' : `Ver las ${sorted.length - VISIBLE} restantes` }}
      </button>

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
