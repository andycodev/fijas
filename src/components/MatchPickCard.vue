<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ChevronDownIcon } from '@heroicons/vue/24/outline';
import { edge, signalFor, type Signal } from '../lib/value';
import { useSaveOdds } from '../composables/usePicks';
import BetDialog from './BetDialog.vue';
import type { ManualOdds, UpcomingMatch } from '../types/db';

const props = defineProps<{ match: UpcomingMatch; odds: ManualOdds[]; threshold: number }>();

const open = ref(false);
const save = useSaveOdds();
const betting = ref<{ pickId: number; line: number; side: 'over' | 'under'; odds: number } | null>(null);

const projection = computed(() => props.match.picks[0]?.projection ?? null);
const kickoff = computed(() =>
  new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(props.match.kickoff_at),
  ),
);

// Cuotas escritas, por línea. Se inicializan con lo guardado.
const inputs = reactive<Record<number, { over: number | null; under: number | null }>>({});
for (const p of props.match.picks) {
  const saved = props.odds.find((o) => Number(o.line) === Number(p.line));
  inputs[p.line] = { over: saved?.over_odds ?? null, under: saved?.under_odds ?? null };
}

const SIGNAL_CLASS: Record<Signal, string> = {
  green: 'bg-value/10 text-value',
  yellow: 'bg-marginal/10 text-marginal',
  red: 'bg-novalue/10 text-novalue',
};
const SIGNAL_LABEL: Record<Signal, string> = { green: 'Valor', yellow: 'Marginal', red: 'Sin valor' };

function evaluate(probability: number, odds: number | null) {
  if (!odds || odds <= 1) return null;
  const value = edge(probability, odds);
  return { value, signal: signalFor(value, props.threshold) };
}

function persist(line: number) {
  const i = inputs[line]!;
  save.mutate({ match_id: props.match.id, line, over: i.over || null, under: i.under || null });
}

const fmtPct = (p: number) => `${(p * 100).toFixed(1)}%`;
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
        <p class="text-xs text-ink/60">Proyección</p>
        <p class="font-extrabold">{{ projection?.toFixed(1) }}</p>
      </div>
      <ChevronDownIcon class="h-5 w-5 shrink-0 transition-transform" :class="{ 'rotate-180': open }" />
    </button>

    <div v-if="open" class="border-t border-line">
      <div class="grid grid-cols-[3rem_1fr_1fr] gap-x-2 px-4 py-2 text-[11px] font-semibold text-ink/60">
        <span>Línea</span>
        <span>Más de · prob. / mín.</span>
        <span>Menos de · prob. / mín.</span>
      </div>

      <div v-for="p in match.picks" :key="p.line" class="border-t border-line px-4 py-2">
        <div class="grid grid-cols-[3rem_1fr_1fr] items-start gap-x-2">
          <span class="pt-3 font-bold">{{ p.line }}</span>

          <div class="space-y-1">
            <p class="text-xs">{{ fmtPct(p.probability) }} · {{ fmtOdds(p.min_odds) }}</p>
            <input
              v-model.number="inputs[p.line]!.over"
              type="number"
              step="0.01"
              min="1.01"
              inputmode="decimal"
              placeholder="Cuota"
              class="field"
              :aria-label="`Cuota más de ${p.line}`"
              @change="persist(p.line)"
            />
            <template v-for="ev in [evaluate(p.probability, inputs[p.line]!.over)]" :key="'o'">
              <span v-if="ev" class="inline-block rounded px-2 py-0.5 text-[11px] font-bold" :class="SIGNAL_CLASS[ev.signal]">
                {{ SIGNAL_LABEL[ev.signal] }} {{ (ev.value * 100).toFixed(1) }}%
              </span>
            </template>
            <button
              v-if="inputs[p.line]!.over && inputs[p.line]!.over! > 1"
              type="button"
              class="btn w-full !min-h-9 text-xs"
              @click="betting = { pickId: p.id, line: p.line, side: 'over', odds: inputs[p.line]!.over! }"
            >
              Apostar
            </button>
          </div>

          <div class="space-y-1">
            <p class="text-xs">{{ fmtPct(1 - p.probability) }} · {{ fmtOdds(1 / (1 - p.probability)) }}</p>
            <input
              v-model.number="inputs[p.line]!.under"
              type="number"
              step="0.01"
              min="1.01"
              inputmode="decimal"
              placeholder="Cuota"
              class="field"
              :aria-label="`Cuota menos de ${p.line}`"
              @change="persist(p.line)"
            />
            <template v-for="ev in [evaluate(1 - p.probability, inputs[p.line]!.under)]" :key="'u'">
              <span v-if="ev" class="inline-block rounded px-2 py-0.5 text-[11px] font-bold" :class="SIGNAL_CLASS[ev.signal]">
                {{ SIGNAL_LABEL[ev.signal] }} {{ (ev.value * 100).toFixed(1) }}%
              </span>
            </template>
            <button
              v-if="inputs[p.line]!.under && inputs[p.line]!.under! > 1"
              type="button"
              class="btn w-full !min-h-9 text-xs"
              @click="betting = { pickId: p.id, line: p.line, side: 'under', odds: inputs[p.line]!.under! }"
            >
              Apostar
            </button>
          </div>
        </div>
      </div>

      <p v-if="save.isError.value" role="alert" class="px-4 pb-3 text-xs font-semibold text-novalue">
        No se pudo guardar la cuota.
      </p>
    </div>
    <BetDialog
      v-if="betting"
      :match-id="match.id"
      :pick-id="betting.pickId"
      :match-label="`${match.home?.name} vs ${match.away?.name}`"
      :line="betting.line"
      :side="betting.side"
      :odds="betting.odds"
      @close="betting = null"
    />
  </article>
</template>
