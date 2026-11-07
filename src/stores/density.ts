import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type Density = 'compact' | 'comfortable';

const STORAGE_KEY = 'fijas-density';

// Densidad de la interfaz: «compacto» (por defecto) o «cómodo». Solo cambia espaciados, alturas y tamaños de letra
// (variables CSS de src/style.css); nunca la información. Se recuerda en el navegador.
export const useDensityStore = defineStore('density', () => {
  const stored = (() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'comfortable' ? 'comfortable' : 'compact';
    } catch {
      return 'compact'; // el almacenamiento puede estar bloqueado
    }
  })();

  const density = ref<Density>(stored);

  watch(
    density,
    () => {
      document.documentElement.setAttribute('data-density', density.value);
      try { localStorage.setItem(STORAGE_KEY, density.value); } catch { /* sin almacenamiento: no se recuerda */ }
    },
    { immediate: true },
  );

  return { density, setDensity: (d: Density) => { density.value = d; } };
});
