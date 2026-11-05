<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { PlusIcon, TicketIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import Betano from './Betano.vue';
import { useCash } from '../composables/useCash';
import { modelProbabilityFor, usePlaceTicket, useSelectableMatches, useTickets } from '../composables/useTickets';
import { riskAlerts } from '../lib/finance';
import { toFinBet } from '../lib/finbet';
import { formatMoney } from '../lib/format';
import { MARKET_LABEL, selectionLabel } from '../lib/markets';
import { combinedOdds, slipIssues, ticketPlan } from '../lib/tickets';
import { slipKey, useBetSlipStore } from '../stores/betslip';
import type { Market } from '../types/db';

const slip = useBetSlipStore();
const cash = useCash();
const tickets = useTickets();
const place = usePlaceTicket();
const matchesQ = useSelectableMatches();

const profile = computed(() => cash.profile.data.value);
const available = computed(() => cash.balance.value ?? 0);
const minStake = computed(() => Number(profile.value?.min_stake ?? 10));
// La unidad es el monto fijo de tus ajustes; si usas porcentaje, el porcentaje del capital inicial (nunca menos que el mínimo).
const unit = computed(() => {
  const p = profile.value;
  if (!p) return minStake.value;
  const raw = p.stake_mode === 'fixed' ? Number(p.stake_value) : (Number(p.initial_bankroll) * Number(p.stake_value)) / 100;
  return Math.max(minStake.value, Math.round(raw * 100) / 100);
});

const stake = ref<number | null>(null);
watch(unit, (u) => { if (stake.value === null) stake.value = u; }, { immediate: true });

// Cuota total: por defecto, el producto de las cuotas; se puede escribir la cuota real que ofrece Betano.
const totalOverride = ref<number | null>(null);
const computedOdds = computed(() => combinedOdds(slip.items.map((i) => i.odds)));
const totalOdds = computed(() => (totalOverride.value && totalOverride.value > 1 ? totalOverride.value : computedOdds.value));
const plan = computed(() => (stake.value && slip.count ? ticketPlan(stake.value, totalOdds.value) : null));

const issues = computed(() =>
  slipIssues({
    legs: slip.items.map((i) => ({ matchId: i.matchId, market: i.market, line: i.line, side: i.side, odds: i.odds })),
    stake: stake.value,
    totalOdds: slip.count ? totalOdds.value : null,
    available: available.value,
    minStake: minStake.value,
  }),
);

// Límites de riesgo que tú definiste (exposición, pérdida mensual, tope diario, racha).
const alerts = computed(() =>
  profile.value
    ? riskAlerts({ settings: profile.value, balance: available.value, bets: (tickets.data.value ?? []).map(toFinBet), extraStake: stake.value ?? 0 })
    : [],
);
const stops = computed(() => alerts.value.filter((a) => a.level === 'stop'));
const hardBlock = computed(() => alerts.value.some((a) => a.id === 'count'));
const confirmed = ref(false);
const ALERT_CLASS = { info: 'text-ink/70', warn: 'text-marginal', stop: 'text-novalue' } as const;

const placedAt = ref('');
const clientKey = ref(crypto.randomUUID());
const lastPlaced = ref<number | null>(null);
const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

const canPlace = computed(
  () => slip.count > 0 && issues.value.ok && !hardBlock.value && (stops.value.length === 0 || confirmed.value) && !place.isPending.value,
);

async function submit() {
  if (!canPlace.value || stake.value === null) return;
  lastPlaced.value = null;
  const id = await place.mutateAsync({
    selections: slip.items.map((i) => ({
      match_id: i.matchId, pick_id: i.pickId, market: i.market, line: i.line, side: i.side, odds: i.odds, model_probability: i.modelProbability,
    })),
    stake: stake.value,
    totalOdds: totalOverride.value && totalOverride.value > 1 ? totalOverride.value : null,
    clientKey: clientKey.value,
    placedAt: placedAt.value ? new Date(placedAt.value).toISOString() : undefined,
  });
  lastPlaced.value = id;
  slip.clear();
  totalOverride.value = null;
  placedAt.value = '';
  confirmed.value = false;
  stake.value = unit.value;
  clientKey.value = crypto.randomUUID(); // el siguiente boleto es otro
}

// ───────── Añadir una selección a mano ─────────
const LINES: Record<Market, number[]> = {
  goals_total: [0.5, 1.5, 2.5, 3.5, 4.5],
  corners_total: [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5],
};
const manual = ref({ matchId: null as number | null, market: 'goals_total' as Market, side: 'over' as 'over' | 'under', line: 2.5, odds: null as number | null });
const manualError = ref<string | null>(null);
const setManualMarket = (m: Market) => {
  manual.value.market = m;
  if (!LINES[m].includes(manual.value.line)) manual.value.line = LINES[m][Math.floor(LINES[m].length / 2)]!;
};
async function addManual() {
  manualError.value = null;
  const m = manual.value;
  const match = matchesQ.data.value?.find((x) => x.id === m.matchId);
  if (!match || !m.odds || m.odds <= 1) { manualError.value = 'Elige un partido y escribe una cuota mayor que 1.'; return; }
  const key = slipKey(match.id, m.market, m.line, m.side);
  if (slip.has(key)) { manualError.value = 'Esa selección ya está en el boleto.'; return; }
  const { pickId, probability } = await modelProbabilityFor(match.id, m.market, m.line, m.side);
  slip.add({
    key, matchId: match.id, pickId, market: m.market, line: m.line, side: m.side, odds: m.odds, modelProbability: probability,
    home: match.home?.name ?? '?', away: match.away?.name ?? '?', league: match.league?.name ?? '', kickoff: match.kickoff_at, oddsOrigin: 'manual',
  });
  manual.value.odds = null;
}

const when = (iso: string) =>
  new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const matchLabel = (m: { home: { name: string } | null; away: { name: string } | null; kickoff_at: string }) =>
  `${m.home?.name} vs ${m.away?.name} · ${new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' }).format(new Date(m.kickoff_at))}`;

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') slip.open = false; };
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <!-- Botón flotante -->
  <button
    v-if="!slip.open && slip.count > 0"
    type="button"
    class="btn btn-primary fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-30 !rounded-full px-5 shadow-lg md:bottom-6 md:right-6"
    @click="slip.open = true"
  >
    <TicketIcon class="h-5 w-5" aria-hidden="true" />
    Boleto
    <span class="num rounded-full bg-white/25 px-2 text-xs">{{ slip.count }}</span>
  </button>

  <div v-if="slip.open" class="fixed inset-0 z-40 bg-ink/40" @click.self="slip.open = false">
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="slip-title"
      class="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-surface shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[28rem] md:rounded-none"
    >
      <header class="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
        <div>
          <h2 id="slip-title" class="text-lg font-extrabold">Boleto <span class="text-ink/50">({{ slip.count }})</span></h2>
          <p class="text-[11px] text-ink/60"><Betano /> · {{ slip.count > 1 ? 'combinada' : 'apuesta simple' }}</p>
        </div>
        <button type="button" class="btn !px-2" aria-label="Cerrar" @click="slip.open = false"><XMarkIcon class="h-5 w-5" /></button>
      </header>

      <div class="space-y-4 p-4">
        <!-- Registrado -->
        <div v-if="lastPlaced !== null" class="rounded-lg border border-value bg-value/10 p-3 text-xs" role="status">
          <p class="font-bold text-value">Boleto #{{ lastPlaced }} registrado.</p>
          <p class="text-ink/70">El importe se descontó una sola vez de tu saldo. <RouterLink :to="{ name: 'bets' }" class="font-semibold text-brand underline" @click="slip.open = false">Ver en Mis apuestas</RouterLink></p>
        </div>

        <p v-if="!slip.count" class="rounded-lg bg-sunken p-4 text-xs text-ink/65">
          El boleto está vacío. Añade recomendaciones desde Picks o Partidos, o una selección a mano abajo.
        </p>

        <!-- Selecciones -->
        <ul v-if="slip.count" class="space-y-2">
          <li v-for="(i, n) in slip.items" :key="i.key" class="rounded-lg border border-line p-3 text-xs">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="eyebrow">{{ n + 1 }} · {{ i.league }} · {{ when(i.kickoff) }}</p>
                <p class="truncate font-bold">{{ i.home }} vs {{ i.away }}</p>
                <p class="text-sm font-extrabold text-brand">{{ selectionLabel(i.market, i.side, i.line) }}</p>
                <p class="text-ink/60">
                  <template v-if="i.modelProbability">Modelo {{ (i.modelProbability * 100).toFixed(1) }}% · </template>
                  <template v-if="i.oddsOrigin === 'auto'">cuota vía proveedor, sin verificar</template>
                  <template v-else-if="i.oddsOrigin === 'manual'">cuota confirmada</template>
                </p>
              </div>
              <button type="button" class="btn !border-transparent !px-2" :aria-label="`Quitar ${selectionLabel(i.market, i.side, i.line)}`" @click="slip.remove(i.key)">
                <TrashIcon class="h-5 w-5" />
              </button>
            </div>
            <label class="mt-2 flex items-center gap-2">
              <span class="font-semibold">Cuota</span>
              <input
                :value="i.odds"
                type="number"
                step="0.01"
                min="1.01"
                inputmode="decimal"
                class="field !min-h-9 w-24 text-right font-bold"
                :aria-label="`Cuota de ${selectionLabel(i.market, i.side, i.line)}`"
                @input="slip.setOdds(i.key, Number(($event.target as HTMLInputElement).value))"
              />
            </label>
          </li>
        </ul>

        <!-- Añadir a mano -->
        <details class="rounded-lg border border-line p-3">
          <summary class="flex min-h-touch cursor-pointer items-center gap-2 text-sm font-bold"><PlusIcon class="h-5 w-5" />Añadir selección a mano</summary>
          <div class="mt-2 space-y-3">
            <select v-model.number="manual.matchId" class="field" aria-label="Partido">
              <option :value="null" disabled>Elige un partido</option>
              <option v-for="m in matchesQ.data.value ?? []" :key="m.id" :value="m.id">{{ matchLabel(m) }}</option>
            </select>
            <div class="grid grid-cols-2 gap-2" role="group" aria-label="Mercado">
              <button v-for="m in (['goals_total', 'corners_total'] as Market[])" :key="m" type="button" class="btn" :class="manual.market === m ? '!border-primary !text-brand' : ''" @click="setManualMarket(m)">{{ MARKET_LABEL[m] }}</button>
            </div>
            <div class="grid grid-cols-[1fr_1fr] gap-2">
              <div class="grid grid-cols-2 gap-2" role="group" aria-label="Selección">
                <button type="button" class="btn !px-2" :class="manual.side === 'over' ? '!border-primary !text-brand' : ''" @click="manual.side = 'over'">Más de</button>
                <button type="button" class="btn !px-2" :class="manual.side === 'under' ? '!border-primary !text-brand' : ''" @click="manual.side = 'under'">Menos de</button>
              </div>
              <select v-model.number="manual.line" class="field" aria-label="Línea"><option v-for="l in LINES[manual.market]" :key="l" :value="l">{{ l }}</option></select>
            </div>
            <label class="block space-y-1">
              <span class="text-xs font-semibold">Cuota de <Betano /></span>
              <input v-model.number="manual.odds" type="number" step="0.01" min="1.01" inputmode="decimal" class="field" />
            </label>
            <p v-if="manualError" role="alert" class="text-xs font-semibold text-novalue">{{ manualError }}</p>
            <button type="button" class="btn w-full" @click="addManual">Añadir al boleto</button>
          </div>
        </details>

        <!-- Resumen -->
        <section v-if="slip.count" class="space-y-3 rounded-lg bg-tint/45 p-3" aria-label="Resumen del boleto">
          <h3 class="eyebrow text-brand">Resumen</h3>
          <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt class="text-ink/65">Selecciones</dt><dd class="num text-right font-bold">{{ slip.count }}</dd>
            <dt class="text-ink/65">Partidos</dt><dd class="num text-right font-bold">{{ new Set(slip.items.map((i) => i.matchId)).size }}</dd>
            <dt class="text-ink/65">Cuota combinada (calculada)</dt><dd class="num text-right font-bold">{{ computedOdds.toFixed(2) }}</dd>
          </dl>

          <label class="block space-y-1">
            <span class="text-xs font-semibold">Cuota total real de <Betano /> (opcional)</span>
            <input v-model.number="totalOverride" type="number" step="0.01" min="1.01" inputmode="decimal" class="field" :placeholder="`Calculada: ${computedOdds.toFixed(2)}`" />
          </label>
          <label class="block space-y-1">
            <span class="text-xs font-semibold">Importe del boleto (mínimo {{ formatMoney(minStake) }})</span>
            <input v-model.number="stake" type="number" :min="minStake" step="0.5" inputmode="decimal" class="field text-lg font-extrabold" aria-label="Importe del boleto" />
          </label>

          <dl v-if="plan" class="grid grid-cols-3 gap-2 text-center text-xs">
            <div class="rounded-lg bg-surface p-2"><dt class="text-ink/60">Apuestas</dt><dd class="num font-extrabold">{{ formatMoney(stake ?? 0) }}</dd></div>
            <div class="rounded-lg bg-surface p-2"><dt class="text-ink/60">Retorno potencial</dt><dd class="num font-extrabold">{{ formatMoney(plan.potentialReturn) }}</dd></div>
            <div class="rounded-lg bg-surface p-2"><dt class="text-ink/60">Ganancia neta</dt><dd class="num font-extrabold text-value">{{ formatMoney(plan.potentialNet) }}</dd></div>
          </dl>
          <p class="text-[11px] text-ink/60">
            Se descuenta <strong>{{ formatMoney(stake ?? 0) }} una sola vez</strong> por el boleto completo, no por cada selección.
            Saldo disponible: <strong class="num">{{ formatMoney(available) }}</strong>.
          </p>

          <details class="text-xs"><summary class="min-h-touch cursor-pointer font-semibold">Registrar con otra fecha y hora</summary>
            <input v-model="placedAt" type="datetime-local" :max="nowLocal()" class="field mt-1" aria-label="Fecha y hora del boleto" />
          </details>
        </section>

        <!-- Avisos -->
        <ul v-if="slip.count && (issues.errors.length || issues.warnings.length || alerts.length)" class="space-y-1" role="alert">
          <li v-for="e in issues.errors" :key="e" class="text-xs font-semibold text-novalue">{{ e }}</li>
          <li v-for="w in issues.warnings" :key="w" class="text-xs font-semibold text-marginal">{{ w }}</li>
          <li v-for="a in alerts" :key="a.id" class="text-xs font-semibold" :class="ALERT_CLASS[a.level]">{{ a.message }}</li>
        </ul>
        <label v-if="slip.count && stops.length && !hardBlock" class="flex min-h-touch items-center gap-3 text-xs font-semibold">
          <input v-model="confirmed" type="checkbox" class="h-5 w-5 accent-primary" />
          Entiendo que supero un límite que yo mismo definí y quiero continuar.
        </label>
        <p v-if="hardBlock" class="text-xs font-semibold text-novalue">Alcanzaste tu tope de apuestas por día. Cámbialo en Ajustes si quieres seguir.</p>
        <p v-if="place.isError.value" role="alert" class="text-xs font-semibold text-novalue">{{ (place.error.value as Error).message }}</p>

        <div v-if="slip.count" class="grid grid-cols-[auto_1fr] gap-2">
          <button type="button" class="btn" @click="slip.clear()">Vaciar</button>
          <button type="button" class="btn btn-primary" :disabled="!canPlace" @click="submit">
            {{ place.isPending.value ? 'Registrando…' : slip.count > 1 ? 'Registrar combinada' : 'Registrar apuesta' }}
          </button>
        </div>
        <p class="text-[11px] text-ink/50">
          Esto solo registra el boleto en tu control. La apuesta real la haces tú en <Betano />.
        </p>
      </div>
    </section>
  </div>
</template>
