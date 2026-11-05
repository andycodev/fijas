import { onBeforeUnmount, onMounted } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { callAction } from './useServerAction';

const EVERY_MINUTES = 20;

// Mientras la app está abierta, pide al servidor cada 20 min que revise los resultados de las recomendaciones pendientes.
// El servidor decide si hace falta consultar algo (no gasta API si no hay partidos terminados ni repite consultas recientes).
// Si la app está cerrada, el propio servidor local (`pnpm dev`) lo hace con su temporizador, o `pnpm resolve` a mano.
export function useAutoResolve() {
  const qc = useQueryClient();
  let timer: ReturnType<typeof setInterval> | undefined;

  const run = async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const { summary } = await callAction<{ resolved?: number }>('resolve', {});
      if (summary?.resolved) await qc.invalidateQueries({ queryKey: ['recommendations'] });
    } catch {
      /* silencioso: es un refresco en segundo plano; el error real aparece al pulsar Analizar */
    }
  };

  onMounted(() => {
    void run();
    timer = setInterval(run, EVERY_MINUTES * 60_000);
  });
  onBeforeUnmount(() => clearInterval(timer));
}
