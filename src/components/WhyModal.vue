<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import WhyPanel from './WhyPanel.vue';
import { MARKET_LABEL, selectionLabel } from '../lib/markets';
import { confidenceFor, type CalibrationBucket, type Confidence, type Selection } from '../lib/opportunities';
import backtest from '../data/backtest.json';

// «¿Por qué esta probabilidad?» en una ventana: el detalle del análisis bajo demanda, sin alargar la tarjeta.
const props = defineProps<{ selection: Selection }>();
const emit = defineEmits<{ close: [] }>();

const s = computed(() => props.selection);
const confidence = computed(() =>
  confidenceFor(s.value, (backtest.markets as Record<string, { buckets: CalibrationBucket[] }>)[s.value.market]?.buckets),
);
const CONF: Record<Confidence, { label: string; dot: string }> = {
  high: { label: 'alta', dot: 'bg-value' },
  medium: { label: 'media', dot: 'bg-marginal' },
  low: { label: 'baja', dot: 'bg-novalue' },
};
const daysAgo = computed(() => (s.value.latestGameAt ? Math.max(0, Math.floor((Date.now() - Date.parse(s.value.latestGameAt)) / 86_400_000)) : null));
const when = (iso: string) =>
  new Intl.DateTimeFormat('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

// Accesibilidad: el foco entra al botón de cerrar y Escape cierra la ventana.
const closeButton = ref<HTMLButtonElement | null>(null);
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close'); };
onMounted(() => {
  closeButton.value?.focus();
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 md:items-center md:p-6" @click.self="emit('close')">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="why-title"
        class="card flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none md:max-h-[85vh] md:rounded-b-lg"
      >
        <header class="flex items-start justify-between gap-3 border-b border-line p-4">
          <div class="min-w-0">
            <p class="eyebrow">{{ s.match.league?.name }} · {{ when(s.match.kickoff_at) }}</p>
            <h2 id="why-title" class="text-base font-extrabold leading-tight">
              {{ s.match.home?.name }} <span class="font-semibold text-ink/45">vs</span> {{ s.match.away?.name }}
            </h2>
            <p class="text-sm font-bold text-brand">{{ selectionLabel(s.market, s.side, s.line) }} <span class="text-xs font-semibold text-ink/55">· {{ MARKET_LABEL[s.market] }}, partido completo</span></p>
          </div>
          <button ref="closeButton" type="button" class="btn !px-2" aria-label="Cerrar" @click="emit('close')"><XMarkIcon class="h-5 w-5" /></button>
        </header>

        <div class="space-y-3 overflow-y-auto p-4">
          <!-- Datos usados -->
          <dl class="grid grid-cols-3 gap-2 rounded-lg bg-sunken p-3 text-xs">
            <div><dt class="text-ink/55">Partidos usados</dt><dd class="num text-sm font-bold">{{ s.gamesHome ?? '?' }} + {{ s.gamesAway ?? '?' }}</dd></div>
            <div><dt class="text-ink/55">Dato más antiguo</dt><dd class="text-sm font-bold">{{ daysAgo === null ? '—' : `hace ${daysAgo} d` }}</dd></div>
            <div>
              <dt class="text-ink/55">Evidencia</dt>
              <dd class="flex items-center gap-1.5 text-sm font-bold"><span class="h-2 w-2 rounded-full" :class="CONF[confidence.level].dot" aria-hidden="true" />{{ CONF[confidence.level].label }}</dd>
            </div>
          </dl>

          <WhyPanel :selection="s" />
        </div>

        <footer class="border-t border-line p-3"><button type="button" class="btn btn-primary w-full" @click="emit('close')">Cerrar</button></footer>
      </section>
    </div>
  </Teleport>
</template>
