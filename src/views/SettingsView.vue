<script setup lang="ts">
import FootballLoader from '../components/FootballLoader.vue';
import { reactive, ref, watch } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useLeagues, useProfile, useUpdateProfile } from '../composables/useProfile';
import type { Market } from '../types/db';

const auth = useAuthStore();
const profile = useProfile();
const leagues = useLeagues();
const update = useUpdateProfile();

const MARKETS: { value: Market; label: string }[] = [
  { value: 'corners_total', label: 'Córners totales' },
  { value: 'goals_total', label: 'Goles totales' },
];

// El umbral y la probabilidad mínima se muestran en % y se guardan como fracción (5 % = 0.05).
const form = reactive({
  threshold_pct: 5,
  min_probability_pct: 75,
  unit_value: 10,
  currency: 'PEN',
  active_league_ids: [] as number[],
  active_markets: [] as Market[],
});
// La unidad teórica llega con la última migración; mientras no exista, no se envía.
const hasUnit = ref(false);

watch(
  () => profile.data.value,
  (p) => {
    if (!p) return;
    form.threshold_pct = Math.round(Number(p.value_threshold) * 10000) / 100;
    form.min_probability_pct = Math.round(Number(p.min_probability ?? 0.75) * 100);
    hasUnit.value = p.unit_value !== undefined && p.unit_value !== null;
    form.unit_value = Number(p.unit_value ?? 10);
    form.currency = p.currency ?? 'PEN';
    form.active_league_ids = [...p.active_league_ids];
    form.active_markets = [...p.active_markets];
  },
  { immediate: true },
);

const saved = ref(false);

async function save() {
  saved.value = false;
  await update.mutateAsync({
    value_threshold: form.threshold_pct / 100,
    min_probability: form.min_probability_pct / 100,
    ...(hasUnit.value ? { unit_value: form.unit_value } : {}),
    currency: form.currency.trim().toUpperCase() || 'PEN',
    active_league_ids: form.active_league_ids,
    active_markets: form.active_markets,
  });
  saved.value = true;
}
</script>

<template>
  <FootballLoader v-if="profile.isLoading.value" size="sm" label="Cargando ajustes…" />
  <p v-else-if="profile.isError.value" role="alert" class="text-novalue">
    No se pudo cargar tu perfil.
  </p>

  <form v-else class="space-y-4" @submit.prevent="save">
    <section class="card space-y-3 p-4">
      <h2 class="font-bold">Criterios de recomendación</h2>
      <p class="text-xs text-ink/60">
        Definen qué selecciones registra el modelo como recomendaciones. Cambiarlos no altera lo ya registrado: cada recomendación conserva los
        criterios con los que se generó.
      </p>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Probabilidad mínima del modelo (%)</span>
        <input v-model.number="form.min_probability_pct" type="number" min="50" max="99" step="1" required class="field" />
      </label>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Valor esperado mínimo para ser recomendación principal (%)</span>
        <input v-model.number="form.threshold_pct" type="number" step="0.1" required class="field" />
        <span class="block text-[11px] text-ink/55">Entre 0% y este valor se registran como «de estudio», aparte de las principales.</span>
      </label>
    </section>

    <section class="card space-y-3 p-4">
      <h2 class="font-bold">Unidad teórica</h2>
      <p class="text-xs text-ink/60">
        La app no maneja tu dinero ni registra apuestas: tú apuestas directamente en Betano. Para medir el modelo se supone una unidad fija por
        recomendación y con ella se calculan el ROI y el valor esperado acumulado en dinero. Es solo una escala de medida.
      </p>
      <div class="grid grid-cols-2 gap-2">
        <label class="block space-y-1">
          <span class="text-xs font-semibold">Unidad por recomendación</span>
          <input v-model.number="form.unit_value" type="number" min="0.01" step="0.01" required class="field" :disabled="!hasUnit" />
        </label>
        <label class="block space-y-1">
          <span class="text-xs font-semibold">Moneda (código)</span>
          <input v-model="form.currency" type="text" maxlength="3" required class="field uppercase" />
        </label>
      </div>
      <p v-if="!hasUnit" class="text-[11px] text-marginal">
        La unidad se podrá cambiar cuando se aplique la última migración de la base de datos; mientras tanto se usa 10.
      </p>
    </section>

    <section class="card space-y-3 p-4">
      <h2 class="font-bold">Ligas y mercados activos</h2>

      <fieldset class="space-y-1">
        <legend class="text-xs font-semibold">Ligas</legend>
        <label
          v-for="l in leagues.data.value ?? []"
          :key="l.id"
          class="flex min-h-touch items-center gap-3"
        >
          <input v-model="form.active_league_ids" type="checkbox" :value="l.id" class="h-5 w-5 accent-primary" />
          {{ l.name }}
        </label>
      </fieldset>

      <fieldset class="space-y-1">
        <legend class="text-xs font-semibold">Mercados</legend>
        <label v-for="m in MARKETS" :key="m.value" class="flex min-h-touch items-center gap-3">
          <input v-model="form.active_markets" type="checkbox" :value="m.value" class="h-5 w-5 accent-primary" />
          {{ m.label }}
        </label>
      </fieldset>
    </section>

    <p v-if="update.isError.value" role="alert" class="text-xs font-semibold text-novalue">
      No se pudo guardar. Inténtalo de nuevo.
    </p>
    <p v-if="saved && !update.isPending.value" class="text-xs font-semibold text-value">Cambios guardados.</p>

    <button type="submit" class="btn btn-primary w-full" :disabled="update.isPending.value">
      {{ update.isPending.value ? 'Guardando…' : 'Guardar cambios' }}
    </button>
  </form>

  <div class="card mt-4 flex items-center justify-between gap-3 p-4 md:hidden">
    <span class="truncate text-xs text-ink/60">{{ auth.user?.email }}</span>
    <button class="btn" @click="auth.signOut()">Cerrar sesión</button>
  </div>
</template>
