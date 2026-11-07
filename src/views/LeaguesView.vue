<script setup lang="ts">
import FootballLoader from '../components/FootballLoader.vue';
import { computed, ref } from 'vue';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { StarIcon } from '@heroicons/vue/24/outline';
import { StarIcon as StarSolid } from '@heroicons/vue/24/solid';
import { useLeagues, useProfile, useUpdateProfile } from '../composables/useProfile';
import { callAction } from '../composables/useServerAction';
import { matchesQuery, searchCatalog, sortLeagues, toggleIds, type CatalogItem } from '../lib/leagues';

const qc = useQueryClient();
const leagues = useLeagues();
const profile = useProfile();
const update = useUpdateProfile();

// ───────── Mis ligas ─────────
const all = computed(() => leagues.data.value ?? []);
const favorites = computed(() => new Set((profile.data.value?.favorite_league_ids ?? []).map(Number)));
// Mientras el perfil no tenga ligas elegidas se consideran todas activas (así se comporta Picks).
const activeSet = computed(() => {
  const ids = (profile.data.value?.active_league_ids ?? []).map(Number);
  return new Set(ids.length ? ids : all.value.map((l) => l.id));
});

const search = ref('');
const selected = ref<number[]>([]);
const visible = computed(() =>
  sortLeagues(all.value.filter((l) => matchesQuery(l, search.value)), favorites.value, activeSet.value),
);

const lastActive = computed(() => activeSet.value.size <= 1);

function setActive(ids: number[], on: boolean) {
  const next = toggleIds([...activeSet.value], ids, on);
  if (!next.length) return; // siempre queda al menos una liga activa
  update.mutate({ active_league_ids: next });
}
function setFavorite(ids: number[], on: boolean) {
  update.mutate({ favorite_league_ids: toggleIds([...favorites.value], ids, on) });
}
function applyToSelected(fn: (ids: number[]) => void) {
  fn(selected.value);
  selected.value = [];
}

// ───────── Catálogo de la API ─────────
const catalog = useMutation({
  mutationFn: async () => (await callAction<{ leagues: CatalogItem[]; fromCache: boolean }>('leagues-catalog')).summary,
  onSuccess: () => qc.invalidateQueries({ queryKey: ['api-usage'] }),
});
const catalogSearch = ref('');
const picked = ref<number[]>([]);
const results = computed(() =>
  catalog.data.value
    ? searchCatalog(catalog.data.value.leagues, catalogSearch.value, new Set(all.value.map((l) => l.api_football_id).filter((x): x is number => x !== null)))
    : [],
);

const adding = ref(false);
const addMessage = ref<string | null>(null);
const addError = ref<string | null>(null);
async function addLeagues(ids: number[]) {
  adding.value = true;
  addError.value = null;
  addMessage.value = null;
  const done: string[] = [];
  try {
    for (const apiId of ids) {
      const { summary } = await callAction<{ name: string; historyLoaded: boolean }>('leagues-add', { apiId });
      done.push(`${summary.name}${summary.historyLoaded ? ' (con histórico)' : ' (sin histórico gratuito)'}`);
    }
  } catch (e) {
    addError.value = (e as Error).message;
  } finally {
    adding.value = false;
    picked.value = [];
    if (done.length) addMessage.value = `Agregadas: ${done.join(', ')}.`;
    await Promise.all([qc.invalidateQueries({ queryKey: ['leagues'] }), qc.invalidateQueries({ queryKey: ['profile'] })]);
  }
}
</script>

<template>
  <div class="space-y-stack">
    <section class="card space-y-stack-sm p-pad" aria-labelledby="mine-title">
      <div>
        <h2 id="mine-title" class="font-bold">Mis ligas y competiciones</h2>
        <p class="text-xs text-ink/60">
          El sistema analiza solo las <strong>activas</strong> ({{ activeSet.size }} de {{ all.length }}). Desactivar una liga no borra sus datos ni tus apuestas.
        </p>
      </div>

      <input v-model="search" type="search" placeholder="Buscar por nombre o país" class="field" aria-label="Buscar en mis ligas" />

      <div v-if="selected.length" class="flex flex-wrap items-center gap-2 rounded-md bg-canvas p-2 text-xs" role="group" aria-label="Acciones sobre las seleccionadas">
        <span class="font-bold">{{ selected.length }} seleccionadas</span>
        <button class="btn !min-h-touch !px-3 text-xs" @click="applyToSelected((ids) => setActive(ids, true))">Activar</button>
        <button class="btn !min-h-touch !px-3 text-xs" @click="applyToSelected((ids) => setActive(ids, false))">Desactivar</button>
        <button class="btn !min-h-touch !px-3 text-xs" @click="applyToSelected((ids) => setFavorite(ids, true))">Favoritas</button>
        <button class="btn !min-h-touch !px-3 text-xs" @click="selected = []">Limpiar</button>
      </div>

      <FootballLoader v-if="leagues.isLoading.value" size="sm" label="Cargando ligas…" />
      <ul v-else class="grid lg:grid-cols-2 lg:gap-x-6 [&>li]:border-b [&>li]:border-line">
        <li v-for="l in visible" :key="l.id" class="flex items-center gap-3 py-stack-sm">
          <input v-model="selected" type="checkbox" :value="l.id" class="h-5 w-5 shrink-0 accent-primary" :aria-label="`Seleccionar ${l.name}`" />
          <div class="min-w-0 flex-1">
            <p class="font-semibold">{{ l.name }}</p>
            <p class="text-xs text-ink/60">
              {{ l.country }} · {{ l.kind === 'cup' ? 'Copa' : 'Liga' }} ·
              <span :class="l.football_data_code ? 'text-value' : 'text-marginal'">
                {{ l.football_data_code ? 'con histórico para picks' : 'sin histórico gratuito: sin picks' }}
              </span>
            </p>
          </div>
          <button
            class="btn !border-transparent !px-2"
            :aria-pressed="favorites.has(l.id)"
            :aria-label="favorites.has(l.id) ? `Quitar ${l.name} de favoritas` : `Marcar ${l.name} como favorita`"
            @click="setFavorite([l.id], !favorites.has(l.id))"
          >
            <StarSolid v-if="favorites.has(l.id)" class="h-5 w-5 text-marginal" />
            <StarIcon v-else class="h-5 w-5" />
          </button>
          <button
            role="switch"
            :aria-checked="activeSet.has(l.id)"
            class="btn !px-3 text-xs"
            :class="activeSet.has(l.id) ? '!border-primary !text-brand' : 'text-ink/60'"
            :disabled="activeSet.has(l.id) && lastActive"
            :title="activeSet.has(l.id) && lastActive ? 'Deja al menos una liga activa' : ''"
            @click="setActive([l.id], !activeSet.has(l.id))"
          >
            {{ activeSet.has(l.id) ? 'Activa' : 'Inactiva' }}
          </button>
        </li>
        <li v-if="!visible.length" class="py-3 text-xs text-ink/60">Ninguna de tus ligas coincide con la búsqueda.</li>
      </ul>
      <p v-if="update.isError.value" role="alert" class="text-xs font-semibold text-novalue">No se pudo guardar el cambio.</p>
    </section>

    <section class="card space-y-stack-sm p-pad" aria-labelledby="catalog-title">
      <div>
        <h2 id="catalog-title" class="font-bold">Agregar desde la API</h2>
        <p class="text-xs text-ink/60">
          Muestra las competiciones con temporada en curso de API-Football. Cargar el catálogo cuesta 1 solicitud y se guarda en caché una semana.
          Las que tienen histórico gratuito (Football-Data) pueden generar picks; el resto solo muestra partidos y cuotas.
        </p>
      </div>

      <button v-if="!catalog.data.value" class="btn w-full" :disabled="catalog.isPending.value" @click="catalog.mutate()">
        {{ catalog.isPending.value ? 'Cargando catálogo…' : 'Cargar catálogo de la API' }}
      </button>
      <p v-if="catalog.isError.value" role="alert" class="text-xs font-semibold text-novalue">{{ (catalog.error.value as Error).message }}</p>

      <template v-if="catalog.data.value">
        <p class="text-xs text-ink/60">
          {{ catalog.data.value.leagues.length }} competiciones disponibles
          <template v-if="catalog.data.value.fromCache">(desde la caché: no gastó solicitudes)</template>.
        </p>
        <input v-model="catalogSearch" type="search" placeholder="Buscar por nombre o país (p. ej. Perú, Eredivisie)" class="field" aria-label="Buscar en el catálogo" />

        <div v-if="picked.length" class="flex items-center gap-2 rounded-md bg-canvas p-2 text-xs">
          <span class="font-bold">{{ picked.length }} seleccionadas</span>
          <button class="btn btn-primary !min-h-touch !px-3 text-xs" :disabled="adding" @click="addLeagues(picked)">
            {{ adding ? 'Agregando…' : 'Agregar seleccionadas' }}
          </button>
        </div>

        <ul class="grid lg:grid-cols-2 lg:gap-x-6 [&>li]:border-b [&>li]:border-line">
          <li v-for="c in results" :key="c.id" class="flex items-center gap-3 py-2">
            <input v-model="picked" type="checkbox" :value="c.id" class="h-5 w-5 shrink-0 accent-primary" :aria-label="`Elegir ${c.name}`" />
            <div class="min-w-0 flex-1">
              <p class="font-semibold">{{ c.name }}</p>
              <p class="text-xs text-ink/60">
                {{ c.country }} · {{ c.type === 'Cup' ? 'Copa' : 'Liga' }} ·
                <span :class="c.hasHistory ? 'text-value' : 'text-marginal'">{{ c.hasHistory ? 'con histórico para picks' : 'sin histórico gratuito' }}</span>
              </p>
            </div>
            <button class="btn !px-3 text-xs" :disabled="adding" @click="addLeagues([c.id])">Agregar</button>
          </li>
          <li v-if="!results.length" class="py-3 text-xs text-ink/60">No hay resultados (o ya las tienes agregadas).</li>
        </ul>
        <p class="text-cap text-ink/50">Se muestran hasta 40 resultados; afina la búsqueda para ver otras.</p>
      </template>

      <p v-if="adding" class="text-xs text-ink/70">Agregando… cargar el histórico de una liga puede tardar unos segundos.</p>
      <p v-if="addError" role="alert" class="text-xs font-semibold text-novalue">{{ addError }}</p>
      <p v-if="addMessage" class="text-xs font-semibold text-value">{{ addMessage }}</p>
    </section>
  </div>
</template>
