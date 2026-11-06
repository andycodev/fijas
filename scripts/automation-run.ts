// Las dos tareas automáticas, reutilizables: las usan el robot de GitHub (auto.ts) y el aviso periódico del servidor (cron.ts).
// Ambas respetan el tope diario de API, la vigencia de los datos y el bloqueo de ejecuciones simultáneas, y dejan registro
// en automation_runs para verlas en la app.
import { configureUsage, fetchStatus } from './api-football.ts';
import { recordAutomation } from './automation-log.ts';
import type { Db } from './db.ts';
import { refreshAll } from './refresh.ts';
import { resolvePending } from './results.ts';

export type Source = 'github' | 'local' | 'app';

async function profilesOf(db: Db, only?: string) {
  const { data, error } = await db.from('profiles').select('user_id, api_daily_cap');
  if (error) throw new Error(error.message);
  return (data ?? []).filter((p) => !only || p.user_id === only);
}

// Revisa los resultados de las recomendaciones pendientes y las cierra. Devuelve false si falló.
export async function runResolve(db: Db, source: Source, log: (s: string) => void = console.log, only?: string): Promise<boolean> {
  const users = await profilesOf(db, only);
  if (!users.length) { log('No hay perfiles que procesar.'); return true; }
  const cap = Math.min(...users.map((u) => Number(u.api_daily_cap) || 90));
  const startedAt = new Date();
  try {
    // Primero se lee el consumo real del día (esa consulta no gasta solicitudes) y luego se revisan los resultados.
    configureUsage(db, { cap });
    try { await fetchStatus(); } catch (e) { log(`No se pudo leer el consumo de la API: ${(e as Error).message}`); }
    const r = await resolvePending(db, log, { apiCap: cap });
    log(`Resultado: ${r.skipped ? 'nada pendiente por revisar' : `${r.resolved} recomendaciones cerradas`} · solicitudes de API: ${r.apiRequests}`);
    await recordAutomation(db, {
      kind: 'resolve', source, status: 'succeeded', startedAt,
      summary: { pending: r.pendingBefore, due: r.due, resolved: r.resolved, apiRequests: r.apiRequests, apiStopped: r.apiStopped },
    }, log);
    return true;
  } catch (e) {
    log(`Falló la revisión de resultados: ${(e as Error).message}`);
    await recordAutomation(db, { kind: 'resolve', source, status: 'failed', startedAt, error: (e as Error).message }, log);
    return false;
  }
}

// Análisis completo para cada usuario. Devuelve false si alguno falló.
export async function runAnalyze(db: Db, source: Source, log: (s: string) => void = console.log, only?: string): Promise<boolean> {
  const users = await profilesOf(db, only);
  if (!users.length) { log('No hay perfiles que procesar.'); return true; }
  let ok = true;
  for (const u of users) {
    const startedAt = new Date();
    try {
      const r = await refreshAll(log, { userId: u.user_id as string });
      log(r.skipped ? `Omitido (${r.reason})` : `Análisis completado · ${r.recommendations.total} recomendaciones, ${r.recommendations.lowValueTotal} de estudio`);
      await recordAutomation(db, {
        kind: 'analyze', source, userId: u.user_id as string, status: 'succeeded', startedAt,
        summary: r.skipped
          ? { skipped: r.reason }
          : {
              recommendations: r.recommendations.total, newRecommendations: r.recommendations.logged,
              lowValue: r.recommendations.lowValueTotal, newLowValue: r.recommendations.lowValueLogged,
              withOdds: r.odds.withOdds, apiStopped: r.apiStopped,
            },
      }, log);
    } catch (e) {
      ok = false;
      log(`Falló el análisis: ${(e as Error).message}`);
      await recordAutomation(db, { kind: 'analyze', source, userId: u.user_id as string, status: 'failed', startedAt, error: (e as Error).message }, log);
    }
  }
  return ok;
}
