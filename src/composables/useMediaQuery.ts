import { onBeforeUnmount, onMounted, ref } from 'vue';

// Indica si una media query se cumple ahora (se actualiza al girar o redimensionar). Sirve para elegir entre dos presentaciones
// de los mismos datos (p. ej. tabla en pantallas anchas y filas apiladas en móvil) sin dibujar las dos a la vez.
export function useMediaQuery(query: string) {
  const matches = ref(typeof window !== 'undefined' ? window.matchMedia(query).matches : false);
  let mql: MediaQueryList | null = null;
  const update = (e: MediaQueryListEvent) => { matches.value = e.matches; };
  onMounted(() => {
    mql = window.matchMedia(query);
    matches.value = mql.matches;
    mql.addEventListener('change', update);
  });
  onBeforeUnmount(() => mql?.removeEventListener('change', update));
  return matches;
}
