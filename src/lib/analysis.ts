import type { AnalysisRun } from '../types/db';

export type AnalysisState = 'none' | 'running' | 'succeeded' | 'failed';

export interface AnalysisStatus {
  state: AnalysisState; // estado del intento más reciente
  lastSuccessAt: string | null; // fin del último análisis completado correctamente
  analyzedToday: boolean; // ¿hubo un análisis completado hoy (hora local)?
  fresh: boolean; // ¿los datos siguen vigentes según la frecuencia configurada?
  validUntil: string | null; // hasta cuándo siguen vigentes
  startedAt: string | null; // inicio del intento más reciente
  error: string | null;
}

// Un análisis «en curso» más viejo que esto se da por interrumpido (el servidor se reinició o dejó de responder).
// Debe coincidir con STALE_RUN_MINUTES de scripts/refresh.ts, que lo libera en la base al iniciar el siguiente.
export const STALE_RUN_MINUTES = 10;

const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// Resume las ejecuciones del análisis. «Iniciada» (en curso) y «completada» son cosas distintas:
// solo un análisis terminado correctamente cuenta como último análisis y vigencia.
export function describeAnalysis(runs: AnalysisRun[], intervalMinutes: number, now: Date = new Date()): AnalysisStatus {
  const latest = runs[0] ?? null; // vienen de más reciente a más antigua
  const interrupted = latest?.status === 'running' && now.getTime() - Date.parse(latest.started_at) > STALE_RUN_MINUTES * 60_000;
  const success = runs.find((r) => r.status === 'succeeded' && r.finished_at) ?? null;
  const validUntil = success?.finished_at ? new Date(Date.parse(success.finished_at) + intervalMinutes * 60_000) : null;
  return {
    state: interrupted ? 'failed' : (latest?.status ?? 'none'),
    lastSuccessAt: success?.finished_at ?? null,
    analyzedToday: !!success?.finished_at && localDay(new Date(success.finished_at)) === localDay(now),
    fresh: !!validUntil && validUntil.getTime() > now.getTime(),
    validUntil: validUntil?.toISOString() ?? null,
    startedAt: latest?.started_at ?? null,
    error: interrupted
      ? `El análisis se interrumpió (llevaba más de ${STALE_RUN_MINUTES} minutos sin terminar: el servidor se reinició o dejó de responder). Puedes volver a analizar.`
      : latest?.status === 'failed' ? latest.error : null,
  };
}
