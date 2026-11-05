import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { DayFilter } from '../lib/dayFilter';

const KEY = 'fijas-day-filter';

// El filtro de fecha se comparte entre Picks y Partidos y se recuerda durante la sesión.
export const useFiltersStore = defineStore('filters', () => {
  const stored = (() => {
    try { const v = sessionStorage.getItem(KEY); return v === 'today' || v === 'tomorrow' || v === 'all' ? v : 'all'; } catch { return 'all'; }
  })();
  const day = ref<DayFilter>(stored);
  watch(day, (v) => { try { sessionStorage.setItem(KEY, v); } catch { /* sin almacenamiento */ } });
  return { day };
});
