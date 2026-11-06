<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { CheckCircleIcon, MinusCircleIcon, XCircleIcon } from '@heroicons/vue/24/solid';
import Betano from '../components/Betano.vue';
import CalibrationChart from '../components/CalibrationChart.vue';
import PageHeader from '../components/PageHeader.vue';
import { useMinProbability } from '../composables/useMinProbability';
import { useProfile } from '../composables/useProfile';
import backtest from '../data/backtest.json';

interface Bucket { label: string; from: number; n: number; predicted: number | null; actual: number | null }
interface Versus { model: { logloss: number; mae: number }; base: { logloss: number; mae: number } }
interface MarketReport { evaluatedMatches: number; period: string; buckets: Bucket[]; versus: Versus }
const reports = backtest.markets as unknown as Record<string, MarketReport>;

const profile = useProfile();
const { minProbability } = useMinProbability();
const threshold = computed(() => Number(profile.data.value?.value_threshold ?? 0.05));

const generated = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(backtest.generatedAt));
const improvement = (v: Versus) => ((v.base.logloss - v.model.logloss) / v.base.logloss) * 100;

const steps = [
  {
    title: 'Datos',
    body: 'Toma los últimos 10 partidos terminados de cada equipo (mínimo 8) con sus goles o córners a favor y en contra. Los resultados vienen de Football-Data.co.uk; el calendario y las cuotas, de API-Football.',
  },
  {
    title: 'Fuerza de cada equipo',
    body: 'Promedia lo que cada equipo hace y concede. Con solo 10 partidos hay mucho ruido, así que mezcla ese promedio con la media de la liga: el equipo aporta un tercio y la media de la liga, dos tercios.',
  },
  {
    title: 'Proyección del partido',
    body: 'Cruza el ataque de cada equipo con la defensa del rival, sobre las medias de local y visitante de la liga. La suma es lo que espera del partido completo.',
  },
  {
    title: 'Probabilidad por línea',
    body: 'Convierte esa proyección en la probabilidad de superar cada línea (más de 2.5, más de 9.5…). Goles usa una distribución de Poisson; córners, una binomial negativa ajustada a la dispersión real. «Menos de» es el complemento.',
  },
  {
    title: 'Valor',
    body: 'La cuota justa es 1 ÷ probabilidad. Si la cuota de Betano paga más que la justa hay valor: valor esperado = probabilidad × cuota − 1.',
  },
];

type Use = 'yes' | 'context' | 'no';
const variables: { name: string; where: string; use: Use; note: string }[] = [
  { name: 'Goles o córners a favor y en contra, últimos 10 partidos', where: 'Goles y córners', use: 'yes', note: 'Es la base del cálculo.' },
  { name: 'Media de la liga de local y de visitante', where: 'Goles y córners', use: 'yes', note: 'Es la referencia; incluye la ventaja de jugar en casa.' },
  { name: 'Peso de la muestra', where: 'Goles y córners', use: 'yes', note: 'Con 10 partidos pesa el 33%; el resto es la media de la liga.' },
  { name: 'Frecuencia de superar la línea', where: 'Goles y córners', use: 'context', note: 'Se muestra para contrastar, no cambia el porcentaje.' },
  { name: 'Rendimiento como local o visitante del propio equipo', where: 'Goles y córners', use: 'context', note: 'Se muestra para contrastar, no cambia el porcentaje.' },
  { name: 'Historial de enfrentamientos directos', where: 'Goles y córners', use: 'context', note: 'Muestra pequeña: solo informativo.' },
  { name: 'Remates, remates a puerta y efectividad', where: 'Goles', use: 'context', note: 'Se muestran como contexto, no entran al cálculo.' },
  { name: 'Goles esperados (xG)', where: 'Goles', use: 'context', note: 'La fuente solo lo publica en la temporada actual.' },
  { name: 'Bajas y ausencias', where: 'Goles y córners', use: 'no', note: 'No hay fuente gratuita conectada: revísalas tú.' },
  { name: 'Centros, remates bloqueados y ataques por bandas', where: 'Córners', use: 'no', note: 'No están en nuestras fuentes.' },
];
const USE: Record<Use, { label: string; cls: string; icon: typeof CheckCircleIcon }> = {
  yes: { label: 'Entra en el cálculo', cls: 'text-brand', icon: CheckCircleIcon },
  context: { label: 'Solo contexto', cls: 'text-ink/60', icon: MinusCircleIcon },
  no: { label: 'No disponible', cls: 'text-novalue', icon: XCircleIcon },
};
</script>

<template>
  <PageHeader title="Modelo" eyebrow="Referencia">
    <template #subtitle>Cómo analiza los partidos, qué variables usa y cuánto se puede confiar en sus porcentajes.</template>
  </PageHeader>

  <div class="space-y-8">
    <!-- 1. Cómo analiza -->
    <section aria-labelledby="how-title" class="space-y-3">
      <h2 id="how-title" class="text-lg font-extrabold">Cómo analiza un partido</h2>
      <ol class="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
        <li v-for="(st, i) in steps" :key="st.title" class="card space-y-2 p-4" :class="i < 3 ? 'lg:col-span-2' : 'lg:col-span-3'">
          <span class="num inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-white">{{ i + 1 }}</span>
          <h3 class="font-extrabold">{{ st.title }}</h3>
          <p class="text-xs leading-relaxed text-ink/70">{{ st.body }}</p>
        </li>
      </ol>
    </section>

    <!-- 2. Variables -->
    <section aria-labelledby="vars-title" class="space-y-3">
      <div>
        <h2 id="vars-title" class="text-lg font-extrabold">Qué variables considera</h2>
        <p class="text-xs text-ink/65">
          Importante: el porcentaje sale <strong>solo</strong> de los goles o córners a favor y en contra. El resto de datos se muestra en
          «¿Por qué esta probabilidad?» para que puedas contrastar la estimación, pero no la modifica.
        </p>
      </div>
      <ul class="space-y-2 md:hidden">
        <li v-for="v in variables" :key="v.name" class="card space-y-1.5 p-3 text-xs">
          <p class="font-bold">{{ v.name }}</p>
          <p class="inline-flex items-center gap-1.5 font-bold" :class="USE[v.use].cls">
            <component :is="USE[v.use].icon" class="h-4 w-4" aria-hidden="true" />{{ USE[v.use].label }}
            <span class="font-normal text-ink/55">· {{ v.where }}</span>
          </p>
          <p class="text-ink/70">{{ v.note }}</p>
        </li>
      </ul>
      <div class="card hidden overflow-x-auto md:block">
        <table class="w-full min-w-[34rem] text-left text-xs">
          <caption class="sr-only">Variables del modelo y si entran en el cálculo</caption>
          <thead class="bg-sunken text-ink/60">
            <tr>
              <th scope="col" class="px-4 py-2 font-semibold">Variable</th>
              <th scope="col" class="px-4 py-2 font-semibold">Mercado</th>
              <th scope="col" class="px-4 py-2 font-semibold">¿Entra en el porcentaje?</th>
              <th scope="col" class="px-4 py-2 font-semibold">Nota</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="v in variables" :key="v.name">
              <th scope="row" class="px-4 py-2.5 font-semibold">{{ v.name }}</th>
              <td class="px-4 py-2.5 text-ink/70">{{ v.where }}</td>
              <td class="px-4 py-2.5">
                <span class="inline-flex items-center gap-1.5 font-bold" :class="USE[v.use].cls">
                  <component :is="USE[v.use].icon" class="h-4 w-4" aria-hidden="true" />{{ USE[v.use].label }}
                </span>
              </td>
              <td class="px-4 py-2.5 text-ink/70">{{ v.note }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 3. Cómo decide si hay valor -->
    <section aria-labelledby="value-title" class="space-y-3">
      <h2 id="value-title" class="text-lg font-extrabold">Cómo decide si un pick tiene valor</h2>
      <div class="grid gap-3 lg:grid-cols-3">
        <div class="card space-y-2 p-4">
          <p class="eyebrow text-brand">Filtro 1 · Probabilidad</p>
          <p class="num text-3xl font-extrabold text-brand">{{ Math.round(minProbability * 100) }}%</p>
          <p class="text-xs text-ink/70">Solo se consideran selecciones con esta probabilidad o más. Lo cambias en Picks. Por debajo de 60% se descarta; de 70 a 74% queda en observación.</p>
        </div>
        <div class="card space-y-2 p-4">
          <p class="eyebrow text-brand">Filtro 2 · Cuota real</p>
          <p class="text-3xl font-extrabold"><Betano /></p>
          <p class="text-xs text-ink/70">Sin cuota de <Betano /> no se puede calcular el valor. La cuota del proveedor se marca «sin verificar»; la que escribes tú queda confirmada.</p>
        </div>
        <div class="card space-y-2 p-4">
          <p class="eyebrow text-brand">Filtro 3 · Valor esperado</p>
          <p class="num text-3xl font-extrabold text-brand">≥ {{ (threshold * 100).toFixed(1) }}%</p>
          <p class="text-xs text-ink/70">
            Valor esperado = probabilidad × cuota − 1. Verde si llega a tu umbral, ámbar si es positivo pero menor, rojo si es negativo.
            Por encima de +15% la app pide verificar la cuota.
          </p>
        </div>
      </div>
      <p class="rounded-lg bg-tint/45 p-3 text-xs text-ink/80">
        <strong>Ejemplo:</strong> el modelo da 65% y <Betano /> paga 1.70. Cuota justa: 1 ÷ 0.65 = 1.54. Valor esperado: 0.65 × 1.70 − 1 = <strong>+10.5%</strong>.
        Con una cuota de 1.40 sería 0.65 × 1.40 − 1 = −9%: aunque acierte seguido, a la larga pierdes.
      </p>
    </section>

    <!-- 4. Rendimiento de las recomendaciones: tiene su propia sección -->
    <RouterLink :to="{ name: 'performance' }" class="card flex items-center justify-between gap-3 p-4 transition-colors hover:border-accent">
      <span>
        <span class="block text-sm font-extrabold">Rendimiento del modelo</span>
        <span class="block text-xs text-ink/65">Qué recomendó, qué ganó y qué perdió, con gráficos. Ahora tiene su propia sección.</span>
      </span>
      <span class="text-xs font-semibold text-brand">Ver rendimiento →</span>
    </RouterLink>

    <!-- 5. Precisión histórica -->
    <section aria-labelledby="acc-title" class="space-y-3">
      <div>
        <h2 id="acc-title" class="text-lg font-extrabold">Precisión histórica</h2>
        <p class="text-xs text-ink/65">
          Cada partido se predijo usando solo lo que se sabía antes de jugarse. Si el modelo dice «75–79%», ¿ocurrió realmente cerca del
          77%? Cuanto más cerca estén el círculo hueco (previsto) y el lleno (real), mejor calibrado. Generado el {{ generated }}.
        </p>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div v-for="(label, key) in { goals_total: 'Goles', corners_total: 'Córners' }" :key="key" class="card space-y-3 p-4">
          <CalibrationChart
            :title="`${label} · ${reports[key]!.evaluatedMatches.toLocaleString('es')} partidos desde ${reports[key]!.period}`"
            :buckets="reports[key]!.buckets"
            :min-probability="minProbability"
          />
          <p class="rounded-lg bg-sunken p-3 text-xs text-ink/75">
            <strong>Frente a «predecir siempre la media de la liga»:</strong> error {{ reports[key]!.versus.model.logloss.toFixed(4) }} contra
            {{ reports[key]!.versus.base.logloss.toFixed(4) }} (menor es mejor), una mejora de
            <strong class="num">{{ improvement(reports[key]!.versus).toFixed(1) }}%</strong>. Es una ventaja pequeña.
          </p>
        </div>
      </div>

      <div class="card space-y-1 p-4 text-xs text-ink/75">
        <p class="font-bold text-ink">Cómo leerla, con honestidad</p>
        <ul class="list-disc space-y-1 pl-4">
          <li>Mide si las <strong>probabilidades son creíbles</strong>. No mide si las cuotas de <Betano /> pagan lo suficiente: eso se comprueba con las recomendaciones registradas, en Rendimiento.</li>
          <li>Cada caso es una línea de un partido; varias líneas del mismo partido están relacionadas, así que no son independientes.</li>
          <li>El modelo no conoce bajas, rotaciones ni lesiones. En partidos europeos usa datos de la liga nacional de cada equipo.</li>
          <li>Cómo le va al modelo con sus recomendaciones reales, acumuladas partido a partido, está en <RouterLink :to="{ name: 'performance' }" class="font-semibold text-brand underline">Rendimiento</RouterLink>.</li>
        </ul>
      </div>
    </section>
  </div>
</template>
