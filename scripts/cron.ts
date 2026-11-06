// Aviso periódico del servidor: un servicio externo (UptimeRobot) llama a /cron/tick cada pocos minutos y aquí se decide qué toca.
//   · Siempre revisa los resultados pendientes (si no hay partidos terminados, no gasta nada de API).
//   · Hace un análisis completo solo cuando ya pasó un horario programado y desde entonces no hubo ninguno completado.
// Así no depende de que el aviso llegue a la hora exacta: si llega tarde, se recupera; si llega dos veces, no repite.
import { runAnalyze, runResolve } from './automation-run.ts';
import type { Db } from './db.ts';
import { pendingAnalysisSlot } from '../src/lib/automation.ts';

const MIN_GAP_MINUTES = 30; // tras cualquier intento de análisis (bueno o malo) no se reintenta antes de esto

let busy = false;
export const isBusy = () => busy;

export interface TickPlan { resolve: boolean; analyze: boolean; slot: string | null; reason: string }

// Decide qué toca ahora, sin ejecutar nada.
export async function planTick(db: Db, now: Date = new Date()): Promise<TickPlan> {
  const last = await db.from('analysis_runs').select('status, started_at, finished_at').order('started_at', { ascending: false }).limit(20);
  if (last.error) return { resolve: true, analyze: false, slot: null, reason: `No se pudo leer el historial de análisis: ${last.error.message}` };
  const rows = last.data ?? [];
  const lastSuccess = rows.find((r) => r.status === 'succeeded' && r.finished_at)?.finished_at ?? null;
  const slot = pendingAnalysisSlot(now, lastSuccess as string | null);
  if (!slot) return { resolve: true, analyze: false, slot: null, reason: 'Ya hubo un análisis completado desde el último horario programado.' };

  const recent = rows[0];
  if (recent && now.getTime() - Date.parse(recent.started_at as string) < MIN_GAP_MINUTES * 60_000) {
    return { resolve: true, analyze: false, slot: slot.toISOString(), reason: `Toca analizar, pero hubo un intento hace menos de ${MIN_GAP_MINUTES} min (${recent.status}).` };
  }
  return { resolve: true, analyze: true, slot: slot.toISOString(), reason: 'Pasó un horario programado sin análisis completado.' };
}

// Ejecuta lo que toca. Devuelve false si ya había un aviso en curso.
export async function tick(db: Db, log: (s: string) => void = console.log): Promise<boolean> {
  if (busy) return false;
  busy = true;
  try {
    const plan = await planTick(db);
    log(`[cron] ${plan.reason}`);
    await runResolve(db, 'app', log);
    if (plan.analyze) await runAnalyze(db, 'app', log);
    return true;
  } finally {
    busy = false;
  }
}
