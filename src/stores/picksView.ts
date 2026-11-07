import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type PicksViewMode = 'cards' | 'table';

const KEY = 'fijas-picks-view';

// Cómo se muestran las recomendaciones en Picks: tarjetas o tabla densa (mismos datos). Se recuerda en el navegador.
export const usePicksViewStore = defineStore('picksView', () => {
  const stored = (() => {
    try { return localStorage.getItem(KEY) === 'table' ? 'table' : 'cards'; } catch { return 'cards'; }
  })();
  const mode = ref<PicksViewMode>(stored);
  watch(mode, (v) => { try { localStorage.setItem(KEY, v); } catch { /* sin almacenamiento */ } });
  return { mode };
});
