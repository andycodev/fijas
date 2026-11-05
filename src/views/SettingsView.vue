<script setup lang="ts">
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

// El umbral se muestra en % y se guarda como fracción (5 % = 0.05).
const form = reactive({
  initial_bankroll: 0,
  stake_mode: 'percent' as 'percent' | 'fixed',
  stake_value: 2,
  min_stake: 10,
  currency: 'PEN',
  threshold_pct: 5,
  daily_bet_limit: 3,
  min_probability_pct: 75,
  daily_exposure_pct: 10,
  monthly_loss_limit_pct: 20,
  losing_streak_alert: 3,
  active_league_ids: [] as number[],
  active_markets: [] as Market[],
});

watch(
  () => profile.data.value,
  (p) => {
    if (!p) return;
    form.initial_bankroll = Number(p.initial_bankroll);
    form.stake_mode = p.stake_mode;
    form.stake_value = Number(p.stake_value);
    form.min_stake = Number(p.min_stake ?? 10);
    form.currency = p.currency ?? 'PEN';
    form.threshold_pct = Math.round(Number(p.value_threshold) * 10000) / 100;
    form.daily_bet_limit = p.daily_bet_limit;
    form.min_probability_pct = Math.round(Number(p.min_probability ?? 0.75) * 100);
    form.daily_exposure_pct = Number(p.daily_exposure_pct);
    form.monthly_loss_limit_pct = Number(p.monthly_loss_limit_pct);
    form.losing_streak_alert = p.losing_streak_alert;
    form.active_league_ids = [...p.active_league_ids];
    form.active_markets = [...p.active_markets];
  },
  { immediate: true },
);

const saved = ref(false);

async function save() {
  saved.value = false;
  await update.mutateAsync({
    initial_bankroll: form.initial_bankroll,
    stake_mode: form.stake_mode,
    stake_value: form.stake_value,
    min_stake: form.min_stake,
    currency: form.currency.trim().toUpperCase() || 'PEN',
    value_threshold: form.threshold_pct / 100,
    daily_bet_limit: form.daily_bet_limit,
    min_probability: form.min_probability_pct / 100,
    daily_exposure_pct: form.daily_exposure_pct,
    monthly_loss_limit_pct: form.monthly_loss_limit_pct,
    losing_streak_alert: form.losing_streak_alert,
    active_league_ids: form.active_league_ids,
    active_markets: form.active_markets,
  });
  saved.value = true;
}
</script>

<template>

  <p v-if="profile.isLoading.value" class="text-ink/60">Cargando…</p>
  <p v-else-if="profile.isError.value" role="alert" class="text-novalue">
    No se pudo cargar tu perfil.
  </p>

  <form v-else class="space-y-4" @submit.prevent="save">
    <section class="card space-y-3 p-4">
      <h2 class="font-bold">Capital y montos</h2>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Capital inicial (capital protegido)</span>
        <input v-model.number="form.initial_bankroll" type="number" min="0" step="0.01" required class="field" />
      </label>

      <fieldset class="space-y-1">
        <legend class="text-xs font-semibold">Modo de monto</legend>
        <div class="grid grid-cols-2 gap-2">
          <label class="btn cursor-pointer has-[:checked]:border-primary has-[:checked]:text-brand">
            <input v-model="form.stake_mode" type="radio" value="percent" class="sr-only" />
            Porcentaje
          </label>
          <label class="btn cursor-pointer has-[:checked]:border-primary has-[:checked]:text-brand">
            <input v-model="form.stake_mode" type="radio" value="fixed" class="sr-only" />
            Fijo
          </label>
        </div>
      </fieldset>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">
          {{ form.stake_mode === 'percent' ? 'Porcentaje del capital inicial por boleto (%)' : 'Unidad fija por boleto' }}
        </span>
        <input v-model.number="form.stake_value" type="number" min="0.01" step="0.01" required class="field" />
      </label>

      <div class="grid grid-cols-2 gap-2">
        <label class="block space-y-1">
          <span class="text-xs font-semibold">Apuesta mínima por boleto</span>
          <input v-model.number="form.min_stake" type="number" min="0.01" step="0.01" required class="field" />
        </label>
        <label class="block space-y-1">
          <span class="text-xs font-semibold">Moneda (código)</span>
          <input v-model="form.currency" type="text" maxlength="3" required class="field uppercase" />
        </label>
      </div>
      <p class="text-xs text-ink/60">
        Cada boleto usa una unidad, tenga una o varias selecciones; el importe se descuenta una sola vez. No se puede registrar un boleto por debajo
        de la apuesta mínima ni por encima de tu saldo disponible.
      </p>
    </section>

    <section class="card space-y-3 p-4">
      <h2 class="font-bold">Control de riesgo</h2>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Umbral de valor (%)</span>
        <input v-model.number="form.threshold_pct" type="number" step="0.1" required class="field" />
      </label>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Tope diario de apuestas</span>
        <input v-model.number="form.daily_bet_limit" type="number" min="0" step="1" required class="field" />
      </label>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Probabilidad mínima para recomendar (%)</span>
        <input v-model.number="form.min_probability_pct" type="number" min="50" max="99" step="1" required class="field" />
      </label>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Exposición máxima por día (% del capital inicial)</span>
        <input v-model.number="form.daily_exposure_pct" type="number" min="0.1" step="0.1" required class="field" />
      </label>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Límite de pérdida mensual (% del capital inicial)</span>
        <input v-model.number="form.monthly_loss_limit_pct" type="number" min="0.1" step="0.1" required class="field" />
      </label>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Avisar tras esta cantidad de apuestas perdidas seguidas</span>
        <input v-model.number="form.losing_streak_alert" type="number" min="1" step="1" required class="field" />
      </label>

      <p class="text-xs text-ink/60">
        Los límites se calculan sobre tu capital inicial, no sobre el saldo, para que no crezcan al ganar. Estos valores son
        puntos de partida: ajústalos a lo que estés dispuesto a perder.
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
