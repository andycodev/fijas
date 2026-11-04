<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { ArrowPathIcon } from '@heroicons/vue/24/outline';
import { useApiUsage } from '../composables/useApiUsage';
import { useProfile, useUpdateProfile } from '../composables/useProfile';
import { LEVEL_MESSAGE, nextResetEstimate, serviceState, usageLevel, usagePercent, type UsageLevel } from '../lib/apiUsage';

const { snapshot, isLoading, check } = useApiUsage();
const profile = useProfile();
const update = useUpdateProfile();

const limit = computed(() => snapshot.value?.daily_limit ?? null);
const used = computed(() => snapshot.value?.requests_used ?? null);
const remaining = computed(() => snapshot.value?.remaining ?? (limit.value !== null && used.value !== null ? limit.value - used.value : null));
const pct = computed(() => (limit.value && used.value !== null ? usagePercent(used.value, limit.value) : 0));
const level = computed<UsageLevel>(() => (limit.value && used.value !== null ? usageLevel(used.value, limit.value) : 'ok'));
const service = computed(() => serviceState(snapshot.value?.last_status ?? null));
const staleDay = computed(() => !!snapshot.value && snapshot.value.day !== new Date().toISOString().slice(0, 10));

const BAR_CLASS: Record<UsageLevel, string> = { ok: 'bg-primary', watch: 'bg-marginal', high: 'bg-marginal', critical: 'bg-novalue', exhausted: 'bg-novalue' };

// Preferencias de consumo (se guardan en el perfil)
const form = reactive({ cap: 90, interval: 60, resetHour: 0 });
watch(
  () => profile.data.value,
  (p) => {
    if (!p) return;
    form.cap = p.api_daily_cap;
    form.interval = p.refresh_interval_minutes;
    form.resetHour = p.api_reset_hour_utc;
  },
  { immediate: true },
);
const saved = computed(() => update.isSuccess.value && !update.isPending.value);
const save = () =>
  update.mutate({ api_daily_cap: form.cap, refresh_interval_minutes: form.interval, api_reset_hour_utc: form.resetHour });

const fmt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : '—';
const nextReset = computed(() => nextResetEstimate(new Date(), form.resetHour));
const localHour = computed(() =>
  new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(Date.UTC(2026, 0, 1, form.resetHour, 0))),
);
</script>

<template>
  <p v-if="isLoading" class="text-ink/60">Cargando…</p>

  <div v-else class="space-y-4">
    <!-- Proveedor y consumo real -->
    <section class="card space-y-3 p-4" aria-labelledby="usage-title">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 id="usage-title" class="font-bold">Consumo de API</h2>
          <p class="text-xs text-ink/60">
            Proveedor: <strong>API-Football (API-Sports)</strong>
            <template v-if="snapshot?.plan_name"> · plan {{ snapshot.plan_name }}</template>
            <template v-if="snapshot?.plan_end"> · suscripción hasta {{ fmt(snapshot.plan_end) }}</template>
          </p>
        </div>
        <button class="btn shrink-0" :disabled="check.isPending.value" @click="check.mutate()">
          <ArrowPathIcon class="h-5 w-5" :class="{ 'animate-spin': check.isPending.value }" />
          Verificar
        </button>
      </div>

      <p v-if="check.isError.value" role="alert" class="text-xs font-semibold text-novalue">
        {{ (check.error.value as Error).message }}
      </p>
      <p v-if="!snapshot" class="text-xs text-marginal">
        Todavía no hay una lectura del proveedor. Pulsa Verificar (no gasta solicitudes) o actualiza desde Picks.
      </p>

      <template v-else>
        <dl class="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <div class="rounded-md border border-line p-2"><dt class="text-ink/60">Límite diario</dt><dd class="text-lg font-extrabold">{{ limit ?? '—' }}</dd></div>
          <div class="rounded-md border border-line p-2"><dt class="text-ink/60">Utilizadas</dt><dd class="text-lg font-extrabold">{{ used ?? '—' }}</dd></div>
          <div class="rounded-md border border-line p-2"><dt class="text-ink/60">Restantes</dt><dd class="text-lg font-extrabold">{{ remaining ?? '—' }}</dd></div>
          <div class="rounded-md border border-line p-2"><dt class="text-ink/60">Consumo</dt><dd class="text-lg font-extrabold">{{ pct }}%</dd></div>
        </dl>

        <div>
          <div class="h-3 w-full overflow-hidden rounded-full bg-line" role="progressbar" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100" aria-label="Consumo de solicitudes de hoy">
            <div class="h-full rounded-full transition-all" :class="BAR_CLASS[level]" :style="{ width: `${pct}%` }" />
          </div>
          <div class="mt-1 flex justify-between text-[11px] text-ink/50"><span>70%</span><span>85%</span><span>95%</span></div>
        </div>

        <p v-if="LEVEL_MESSAGE[level]" role="alert" class="text-xs font-semibold" :class="level === 'watch' || level === 'high' ? 'text-marginal' : 'text-novalue'">
          {{ LEVEL_MESSAGE[level] }}
        </p>
        <p v-if="staleDay" class="text-xs text-marginal">
          La última lectura es del {{ snapshot.day }}. El contador pudo haberse reiniciado desde entonces: pulsa Verificar para ver el valor actual.
        </p>

        <dl class="grid gap-2 text-xs md:grid-cols-2">
          <div><dt class="text-ink/60">Última consulta</dt><dd class="font-bold">{{ fmt(snapshot.last_request_at) }}</dd></div>
          <div>
            <dt class="text-ink/60">Estado del servicio</dt>
            <dd class="font-bold" :class="service.ok ? 'text-value' : 'text-novalue'">{{ service.label }}</dd>
          </div>
        </dl>
      </template>
    </section>

    <!-- Renovación -->
    <section class="card space-y-2 p-4" aria-labelledby="renewal-title">
      <h2 id="renewal-title" class="font-bold">Renovación del límite</h2>
      <ul class="list-disc space-y-1 pl-4 text-xs text-ink/80">
        <li><strong>Período:</strong> el proveedor informa el límite como <em>diario</em> (campo limit_day = {{ limit ?? 100 }}).</li>
        <li><strong>Hora de reinicio:</strong> la API <strong>no la informa</strong>. Lo que ves abajo es una <strong>estimación configurada por ti</strong>, no un dato del proveedor.</li>
        <li><strong>Acumulación:</strong> el proveedor no informa si las solicitudes no usadas se acumulan; no lo doy por hecho.</li>
        <li>
          <strong>Último reinicio observado:</strong>
          <template v-if="snapshot?.reset_observed_at">{{ fmt(snapshot.reset_observed_at) }} (detectado al ver que las restantes volvían a subir)</template>
          <template v-else>aún no se ha detectado ninguno.</template>
        </li>
        <li><strong>Cuando se agotan:</strong> el proveedor rechaza las consultas hasta el reinicio; esta app detiene las consultas automáticas al llegar a tu tope y lo avisa. Los datos ya guardados siguen disponibles.</li>
      </ul>
      <p class="text-xs">
        Próximo reinicio <strong>estimado</strong>: {{ fmt(nextReset.toISOString()) }} (hora local).
      </p>
    </section>

    <!-- Configuración -->
    <form class="card space-y-3 p-4" @submit.prevent="save">
      <h2 class="font-bold">Optimización y configuración</h2>

      <label class="block space-y-1">
        <span class="text-xs font-semibold">Tope propio de solicitudes por día (dejas un margen bajo el límite)</span>
        <input v-model.number="form.cap" type="number" min="10" max="100" step="1" required class="field" />
      </label>
      <label class="block space-y-1">
        <span class="text-xs font-semibold">Frecuencia mínima entre actualizaciones (minutos)</span>
        <input v-model.number="form.interval" type="number" min="5" max="1440" step="5" required class="field" />
      </label>
      <label class="block space-y-1">
        <span class="text-xs font-semibold">Hora estimada del reinicio (UTC) · equivale a las {{ localHour }} de tu hora local</span>
        <input v-model.number="form.resetHour" type="number" min="0" max="23" step="1" required class="field" />
      </label>

      <ul class="list-disc space-y-1 pl-4 text-xs text-ink/70">
        <li>Las respuestas se guardan en caché: una consulta repetida no gasta solicitudes.</li>
        <li>Solo se consultan las ligas activas, empezando por los partidos más cercanos.</li>
        <li>Una actualización no se repite antes de la frecuencia mínima, salvo que la fuerces.</li>
        <li>Consultar el estado de la cuenta no gasta solicitudes.</li>
      </ul>

      <p v-if="update.isError.value" role="alert" class="text-xs font-semibold text-novalue">No se pudo guardar.</p>
      <p v-if="saved" class="text-xs font-semibold text-value">Cambios guardados.</p>
      <button type="submit" class="btn btn-primary w-full" :disabled="update.isPending.value">Guardar</button>
    </form>
  </div>
</template>
