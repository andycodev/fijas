<script setup lang="ts">
import FootballLoader from './FootballLoader.vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import CalibrationChart from './CalibrationChart.vue';
import CumulativeProfitChart from './CumulativeProfitChart.vue';
import RecommendationItem from './RecommendationItem.vue';
import RoiBars from './RoiBars.vue';
import StreakDots from './StreakDots.vue';
import { useProfile } from '../composables/useProfile';
import { useRecommendations } from '../composables/useAnalysis';
import { cumulativeSeries, evaluate, MIN_FOR_CONCLUSION, phaseOf, type EvalRow, type Group } from '../lib/evaluation';
import { formatMoney } from '../lib/format';
import type { RecommendationRow } from '../types/db';

// Rendimiento DEL MODELO: cada recomendación que generó «Analizar», congelada tal como se generó y evaluada contra el resultado real.
// Es un experimento teórico (una unidad fija por recomendación): no hay dinero real en juego.
const recs = useRecommendations();
const profile = useProfile();
const unit = computed(() => Number(profile.data.value?.unit_value ?? 10) || 10);

// La fase (pendiente / en curso) depende de la hora: se recalcula cada minuto sin recargar nada.
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { timer = setInterval(() => (now.value = Date.now()), 60_000); });
onBeforeUnmount(() => clearInterval(timer));

// Categoría: principales (valor ≥ umbral), de estudio (valor entre 0 y el umbral) o todas. Cada una se mide por separado.
const category = ref<'main' | 'low_value' | 'all'>('main');
const CATEGORIES = [{ v: 'main', l: 'Principales' }, { v: 'low_value', l: 'De estudio (valor 0–5%)' }, { v: 'all', l: 'Todas' }] as const;
const inCategory = (r: RecommendationRow) => category.value === 'all' || r.category === category.value;
const categoryCount = (v: (typeof CATEGORIES)[number]['v']) => (recs.data.value ?? []).filter((r) => v === 'all' || r.category === v).length;

const allRows = computed<(RecommendationRow & EvalRow)[]>(() =>
  (recs.data.value ?? []).map((r) => ({
    ...r,
    league: r.match?.league?.name ?? null,
    model_probability: Number(r.model_probability),
    odds: Number(r.odds),
    ev: Number(r.ev),
    kickoff_at: r.kickoff_at ?? r.match?.kickoff_at ?? null,
  })),
);
const rows = computed(() => allRows.value.filter(inCategory));
const ev = computed(() => evaluate(rows.value, unit.value));
const evByCategory = computed(() => evaluate(allRows.value, unit.value).byCategory);
const points = computed(() => cumulativeSeries(rows.value, unit.value));
// Tramos de probabilidad para el gráfico de calibración (previsto frente a real).
const calBuckets = computed(() => ev.value.byConfidence.map((g) => ({ label: g.key, from: 0, n: g.resolved, predicted: g.avgProbability, actual: g.hitRate })));
const lastResults = computed(() => points.value.map((p) => p.row.result as 'won' | 'lost'));

const signed = (n: number, d = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
const pct = (n: number | null, d = 1) => (n === null ? '—' : `${n.toFixed(d)}%`);
const signedMoney = (n: number) => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n))}`;
const tone = (n: number | null) => (n === null ? '' : n > 0 ? 'text-value' : n < 0 ? 'text-novalue' : '');

const MARKET_NAME = { goals_total: 'Goles', corners_total: 'Córners' } as const;

// Fases: lo que aún no empieza, lo que espera resultado y lo ya evaluado van separados.
const koOf = (r: RecommendationRow) => Date.parse(r.kickoff_at ?? r.match?.kickoff_at ?? '');
const withPhase = computed(() => (recs.data.value ?? []).filter(inCategory).map((r) => ({ r, phase: phaseOf({ result: r.result, kickoff_at: r.kickoff_at ?? r.match?.kickoff_at ?? null }, now.value) })));
const upcoming = computed(() => withPhase.value.filter((x) => x.phase === 'upcoming').map((x) => x.r).sort((a, b) => koOf(a) - koOf(b))); // la que juega antes, primero
const live = computed(() => withPhase.value.filter((x) => x.phase === 'live').map((x) => x.r).sort((a, b) => koOf(a) - koOf(b)));
const done = computed(() => withPhase.value.filter((x) => x.phase === 'done').map((x) => x.r).sort((a, b) => koOf(b) - koOf(a))); // la más reciente, primero

const filter = ref<'all' | 'won' | 'lost' | 'void'>('all');
const limit = ref(12);
const FILTERS = [{ v: 'all', l: 'Todas' }, { v: 'won', l: 'Ganadas' }, { v: 'lost', l: 'Perdidas' }, { v: 'void', l: 'Canceladas' }] as const;
const doneShown = computed(() => done.value.filter((r) => filter.value === 'all' || r.result === filter.value));
const doneVisible = computed(() => doneShown.value.slice(0, limit.value));
const countOf = (v: (typeof FILTERS)[number]['v']) => done.value.filter((r) => v === 'all' || r.result === v).length;

const verdictText = computed(() => {
  const e = ev.value.evidence;
  switch (e.verdict) {
    case 'none': return 'Aún no hay recomendaciones resueltas. Se guardan al pulsar Analizar y se resuelven solas cuando termina cada partido.';
    case 'insufficient': return `Muestra insuficiente: ${e.resolved} de ${MIN_FOR_CONCLUSION} recomendaciones resueltas. Con tan pocas, el azar domina el acierto y el ROI; no saques conclusiones todavía.`;
    case 'edge': return `Con ${e.resolved} recomendaciones, el modelo acierta más de lo que corresponde por azar a esas cuotas y el ROI teórico es positivo.`;
    case 'no_edge': return `Con ${e.resolved} recomendaciones, el ROI teórico es negativo: por ahora el modelo no muestra ventaja frente a las cuotas.`;
    default: return `Con ${e.resolved} recomendaciones el ROI es positivo, pero no se distingue claramente de la suerte. Hace falta más muestra.`;
  }
});
const verdictClass = computed(() => ({ edge: 'border-value', no_edge: 'border-novalue', inconclusive: 'border-marginal', insufficient: 'border-marginal', none: 'border-line' })[ev.value.evidence.verdict]);

const TABLES = computed<{ title: string; rows: Group[]; label: (k: string) => string }[]>(() => [
  { title: 'Por mercado', rows: ev.value.byMarket, label: (k) => MARKET_NAME[k as keyof typeof MARKET_NAME] ?? k },
  { title: 'Por probabilidad del modelo', rows: ev.value.byConfidence.filter((g) => g.total), label: (k) => k },
  { title: 'Por liga', rows: ev.value.byLeague, label: (k) => k },
]);
</script>

<template>
  <section aria-labelledby="perf-title" class="space-y-6">
    <div>
      <h2 id="perf-title" class="text-lg font-extrabold">Resumen y evidencia</h2>
      <p class="text-xs text-ink/65">
        Experimento controlado: cada recomendación se guarda <strong>tal como la generó el modelo</strong> y se resuelve sola contra el resultado real, sin volver
        a calcular nada. Es un laboratorio: el ROI y el EV son teóricos y suponen {{ formatMoney(unit) }} (tu unidad teórica, configurable en Ajustes) por recomendación.
      </p>
      <details class="mt-2 rounded-lg border border-line bg-surface p-3 text-xs">
        <summary class="min-h-touch cursor-pointer font-bold">¿Cómo cambia el estado de una recomendación?</summary>
        <ol class="mt-1 list-decimal space-y-1 pl-5 text-ink/75">
          <li><strong>Pendiente:</strong> se guarda al pulsar Analizar y su partido todavía no empieza.</li>
          <li><strong>En curso:</strong> el partido ya empezó y aún no hay resultado definitivo (en juego, esperando que se registre, o aplazado). Se determina por la hora del partido.</li>
          <li><strong>Ganada / Perdida:</strong> cuando el partido termina y el resultado queda registrado, el sistema compara la selección original (más o menos de la línea) con el total real de los 90 minutos. Es automático: el servidor lo revisa cada 20 minutos y no gasta API si no hace falta.</li>
          <li><strong>Cancelada:</strong> partido cancelado, sin resultado definitivo 7 días después, o córners de un partido con tiempo extra. No cuenta como acierto ni fallo.</li>
        </ol>
        <p class="mt-1 text-ink/60">Una vez resuelta, el estado no se puede cambiar ni se recalcula el modelo.</p>
      </details>
    </div>

    <p v-if="recs.isError.value" role="alert" class="text-xs font-semibold text-novalue">No se pudieron cargar las recomendaciones. Si acabas de actualizar la app, ejecuta la migración pendiente en Supabase.</p>
    <FootballLoader v-else-if="recs.isLoading.value" size="sm" label="Cargando recomendaciones…" />

    <template v-else>
      <!-- CATEGORÍA: principales y de estudio se miden por separado -->
      <div class="space-y-1.5">
        <div class="inline-flex flex-wrap rounded-lg border border-line bg-sunken p-0.5" role="group" aria-label="Categoría de recomendaciones">
          <button
            v-for="c in CATEGORIES"
            :key="c.v"
            type="button"
            class="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors"
            :class="category === c.v ? 'bg-surface text-brand shadow-sm' : 'text-ink/60 hover:text-ink'"
            :aria-pressed="category === c.v"
            @click="category = c.v; limit = 12"
          >
            {{ c.l }} <span class="num text-[10px] text-ink/50">{{ categoryCount(c.v) }}</span>
          </button>
        </div>
        <p class="text-xs text-ink/60">
          <template v-if="category === 'main'">Las recomendaciones que cumplen todos tus filtros, incluido el valor esperado mínimo.</template>
          <template v-else-if="category === 'low_value'">Selecciones con probabilidad y cuota válidas pero con valor entre 0 y tu umbral. No se muestran como recomendaciones: se registran para comprobar si el modelo también acierta con poco margen.</template>
          <template v-else>Principales y de estudio juntas. Para juzgar al modelo conviene mirarlas por separado.</template>
        </p>
      </div>

      <!-- RESUMEN -->
      <div class="space-y-4">
      <dl class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div class="card p-3"><dt class="text-[11px] text-ink/60">Evaluadas</dt><dd class="num text-2xl font-extrabold">{{ ev.all.resolved }}</dd><dd class="text-[11px] text-ink/55">de {{ ev.all.total }} registradas<template v-if="ev.all.void"> · {{ ev.all.void }} canceladas</template></dd></div>
        <div class="card p-3"><dt class="text-[11px] text-ink/60">Ganadas</dt><dd class="num text-2xl font-extrabold text-value">{{ ev.all.won }}</dd></div>
        <div class="card p-3"><dt class="text-[11px] text-ink/60">Perdidas</dt><dd class="num text-2xl font-extrabold text-novalue">{{ ev.all.lost }}</dd></div>
        <div class="card p-3"><dt class="text-[11px] text-ink/60">Acierto</dt><dd class="num text-2xl font-extrabold">{{ pct(ev.all.hitRate, 0) }}</dd><dd class="text-[11px] text-ink/55">Previsto {{ pct(ev.all.avgProbability, 0) }} · cuota media {{ ev.all.avgOdds?.toFixed(2) ?? '—' }}</dd></div>
        <div class="card p-3"><dt class="text-[11px] text-ink/60">ROI teórico</dt><dd class="num text-2xl font-extrabold" :class="tone(ev.all.roi)">{{ ev.all.roi === null ? '—' : `${signed(ev.all.roi)}%` }}</dd><dd class="text-[11px] text-ink/55">Ganancia teórica {{ signedMoney(ev.profit) }}</dd></div>
        <div class="card p-3"><dt class="text-[11px] text-ink/60">EV acumulado</dt><dd class="num text-2xl font-extrabold" :class="tone(ev.expectedProfit)">{{ signedMoney(ev.expectedProfit) }}</dd><dd class="text-[11px] text-ink/55">Lo que el modelo esperaba ganar con lo resuelto</dd></div>
      </dl>

      <!-- ¿Hay ventaja o es azar? -->
      <div class="card space-y-2 border-l-4 p-4 text-xs" :class="verdictClass">
        <p class="font-bold">¿El modelo tiene ventaja o es suerte?</p>
        <p class="text-ink/75">{{ verdictText }}</p>
        <div class="h-2 w-full overflow-hidden rounded-full bg-tint" role="progressbar" :aria-valuenow="Math.min(ev.evidence.resolved, MIN_FOR_CONCLUSION)" aria-valuemin="0" :aria-valuemax="MIN_FOR_CONCLUSION" aria-label="Recomendaciones resueltas hacia la muestra mínima">
          <div class="h-full rounded-full bg-primary" :style="{ width: `${Math.min(100, (ev.evidence.resolved / MIN_FOR_CONCLUSION) * 100)}%` }" />
        </div>
        <ul v-if="ev.evidence.resolved" class="grid gap-x-6 gap-y-1 text-ink/70 sm:grid-cols-2">
          <li>Aciertos: <strong class="num">{{ ev.evidence.hits }}</strong> de {{ ev.evidence.resolved }}</li>
          <li>Esperados solo por azar a esas cuotas: <strong class="num">{{ ev.evidence.expectedHitsBreakEven }}</strong> ({{ pct(ev.evidence.breakEvenRate, 0) }})</li>
          <li>Esperados según el modelo: <strong class="num">{{ ev.evidence.expectedHitsModel }}</strong> (si coincide con los reales, está bien calibrado)</li>
          <li v-if="ev.evidence.pValue !== null">Probabilidad de acertar tanto o más por pura suerte: <strong class="num">{{ (ev.evidence.pValue * 100).toFixed(1) }}%</strong></li>
          <li>
            Racha actual:
            <strong class="num" :class="ev.streaks.current > 0 ? 'text-value' : ev.streaks.current < 0 ? 'text-novalue' : ''">{{ ev.streaks.current > 0 ? `${ev.streaks.current} aciertos` : ev.streaks.current < 0 ? `${-ev.streaks.current} fallos` : '—' }}</strong>
            · mejor {{ ev.streaks.bestWon }} aciertos · peor {{ ev.streaks.bestLost }} fallos
          </li>
        </ul>
      </div>

      </div>

      <!-- GRÁFICOS -->
      <div class="space-y-4">
        <div class="card p-4"><CumulativeProfitChart :points="points" /></div>
        <div class="grid gap-4 lg:grid-cols-2">
          <div class="card p-4">
            <CalibrationChart title="¿Lo que el modelo prevé es lo que ocurre?" :buckets="calBuckets" />
            <p v-if="!ev.all.resolved" class="mt-2 text-xs text-ink/60">Se dibuja con las primeras recomendaciones resueltas.</p>
          </div>
          <div class="space-y-4">
            <StreakDots :results="lastResults" />
            <RoiBars title="Por mercado" :groups="ev.byMarket" :label-of="(k) => MARKET_NAME[k as keyof typeof MARKET_NAME] ?? k" />
          </div>
        </div>
        <RoiBars title="Por liga" :groups="ev.byLeague" />
        <RoiBars v-if="category === 'all' || evByCategory[1]!.total" title="Principales frente a estudio (todas las categorías)" :groups="evByCategory" :label-of="(k) => (k === 'main' ? 'Principales' : 'De estudio (valor 0–5%)')" />
      </div>

      <details v-if="ev.all.resolved" class="card p-4">
        <summary class="min-h-touch cursor-pointer text-sm font-bold">Ver las cifras detalladas (tablas)</summary>
        <div class="mt-3 grid gap-4 lg:grid-cols-2">
          <div v-for="(t, i) in TABLES" :key="t.title" class="card" :class="i === 2 ? 'lg:col-span-2' : ''">
            <table class="w-full table-auto text-left text-xs">
              <caption class="px-4 pt-3 text-left text-sm font-bold">{{ t.title }}</caption>
              <thead class="text-ink/60">
                <tr>
                  <th scope="col" class="px-4 py-2"><span class="sr-only">Grupo</span></th>
                  <th scope="col" class="px-2 py-2 text-right font-semibold">Resueltas</th>
                  <th scope="col" class="px-2 py-2 text-right font-semibold">Acierto</th>
                  <th scope="col" class="hidden px-2 py-2 text-right font-semibold sm:table-cell">Previsto</th>
                  <th scope="col" class="hidden px-2 py-2 text-right font-semibold sm:table-cell">Cuota</th>
                  <th scope="col" class="px-4 py-2 text-right font-semibold">ROI</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-line">
                <tr v-for="g in t.rows" :key="g.key">
                  <th scope="row" class="px-4 py-2 font-semibold">{{ t.label(g.key) }}</th>
                  <td class="num px-2 py-2 text-right">{{ g.resolved }}<span class="text-ink/45">/{{ g.total }}</span></td>
                  <td class="num px-2 py-2 text-right">{{ pct(g.hitRate, 0) }}</td>
                  <td class="num hidden px-2 py-2 text-right text-ink/65 sm:table-cell">{{ pct(g.avgProbability, 0) }}</td>
                  <td class="num hidden px-2 py-2 text-right text-ink/65 sm:table-cell">{{ g.avgOdds?.toFixed(2) ?? '—' }}</td>
                  <td class="num px-4 py-2 text-right font-bold" :class="tone(g.roi)">{{ g.roi === null ? '—' : `${signed(g.roi)}%` }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <!-- ACTIVAS: lo que todavía no está evaluado -->
      <div class="space-y-4">
        <div class="space-y-2">
          <h3 class="flex flex-wrap items-center gap-2 text-sm font-bold">
            Pendientes <span class="num rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-brand">{{ upcoming.length }}</span>
            <span class="text-xs font-normal text-ink/55">· el partido aún no empieza</span>
          </h3>
          <p v-if="!upcoming.length" class="rounded-lg bg-sunken p-3 text-xs text-ink/65">No hay recomendaciones pendientes. Pulsa Analizar en Picks para generar nuevas.</p>
          <div v-else class="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            <RecommendationItem v-for="r in upcoming" :key="r.id" :rec="r" :now="now" />
          </div>
        </div>

        <div v-if="live.length" class="space-y-2">
          <h3 class="flex flex-wrap items-center gap-2 text-sm font-bold">
            En curso <span class="num rounded-full bg-marginal/15 px-2 py-0.5 text-[11px] text-marginal">{{ live.length }}</span>
            <span class="text-xs font-normal text-ink/55">· ya empezaron; esperando el resultado</span>
          </h3>
          <div class="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            <RecommendationItem v-for="r in live" :key="r.id" :rec="r" :now="now" />
          </div>
        </div>
      </div>

      <!-- FINALIZADAS: ya evaluadas -->
      <div class="space-y-3 border-t border-line pt-5">
        <h3 class="flex flex-wrap items-center gap-2 text-sm font-bold">
          Finalizadas <span class="num rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-brand">{{ done.length }}</span>
          <span class="text-xs font-normal text-ink/55">· ya evaluadas contra el resultado real</span>
        </h3>
        <!-- Lista de finalizadas -->
        <div class="space-y-2">
          <div class="inline-flex flex-wrap rounded-lg border border-line bg-sunken p-0.5" role="group" aria-label="Filtrar finalizadas">
            <button
              v-for="f in FILTERS"
              :key="f.v"
              type="button"
              class="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors"
              :class="filter === f.v ? 'bg-surface text-brand shadow-sm' : 'text-ink/60 hover:text-ink'"
              :aria-pressed="filter === f.v"
              @click="filter = f.v; limit = 12"
            >
              {{ f.l }} <span class="num text-[10px] text-ink/50">{{ countOf(f.v) }}</span>
            </button>
          </div>
          <p v-if="!doneShown.length" class="rounded-lg bg-sunken p-3 text-xs text-ink/65">
            {{ done.length ? 'No hay recomendaciones con ese estado.' : 'Todavía no hay recomendaciones finalizadas. Aparecerán aquí solas cuando terminen sus partidos.' }}
          </p>
          <div v-else class="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            <RecommendationItem v-for="r in doneVisible" :key="r.id" :rec="r" :now="now" />
          </div>
          <button v-if="doneShown.length > doneVisible.length" type="button" class="btn !min-h-9 text-xs" @click="limit += 12">Ver más ({{ doneShown.length - doneVisible.length }})</button>
        </div>
      </div>
    </template>
  </section>
</template>
