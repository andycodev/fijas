// Ejecución automática sin pantalla (la lanza GitHub Actions con horario; también sirve a mano):
//   npx tsx --env-file=.env scripts/auto.ts resolve   → revisa resultados de las recomendaciones pendientes
//   npx tsx --env-file=.env scripts/auto.ts analyze   → análisis completo (partidos, picks, cuotas, recomendaciones)
// Usa los mismos procesos que la app: respeta el tope diario de API, la vigencia de los datos y el bloqueo de ejecuciones simultáneas.
// Cada ejecución queda registrada en automation_runs para verla en la app (sección «Actividad automática»).
import { configureUsage, fetchStatus } from './api-football.ts';
import { recordAutomation } from './automation-log.ts';
import { createServiceClient } from './db.ts';
import { refreshAll } from './refresh.ts';
import { resolvePending } from './results.ts';

const mode = process.argv[2];
if (mode !== 'resolve' && mode !== 'analyze') {
  console.error('Uso: auto.ts resolve | analyze');
  process.exit(2);
}

const source = process.env.GITHUB_ACTIONS ? 'github' : 'local';
const db = createServiceClient();
const { data: profiles, error } = await db.from('profiles').select('user_id, api_daily_cap');
if (error) throw new Error(error.message);
const only = process.env.ANALYSIS_USER_ID; // opcional: limitar a un usuario
const users = (profiles ?? []).filter((p) => !only || p.user_id === only);
if (!users.length) {
  console.log('No hay perfiles que procesar.');
  process.exit(0);
}
const cap = Math.min(...users.map((u) => Number(u.api_daily_cap) || 90));

let failed = false;

if (mode === 'resolve') {
  const startedAt = new Date();
  try {
    // Primero se lee el consumo real del día (esa consulta no gasta solicitudes) y luego se revisan los resultados.
    configureUsage(db, { cap });
    try { await fetchStatus(); } catch (e) { console.log(`No se pudo leer el consumo de la API: ${(e as Error).message}`); }
    const r = await resolvePending(db, console.log, { apiCap: cap });
    console.log(`Resultado: ${r.skipped ? 'nada pendiente por revisar' : `${r.resolved} recomendaciones cerradas`} · solicitudes de API: ${r.apiRequests}`);
    await recordAutomation(db, {
      kind: 'resolve', source, status: 'succeeded', startedAt,
      summary: { pending: r.pendingBefore, due: r.due, resolved: r.resolved, apiRequests: r.apiRequests, apiStopped: r.apiStopped },
    });
  } catch (e) {
    failed = true;
    console.error(e);
    await recordAutomation(db, { kind: 'resolve', source, status: 'failed', startedAt, error: (e as Error).message });
  }
} else {
  for (const u of users) {
    const startedAt = new Date();
    try {
      const r = await refreshAll(console.log, { userId: u.user_id as string });
      console.log(r.skipped ? `Omitido (${r.reason})` : `Análisis completado · ${r.recommendations.total} recomendaciones, ${r.recommendations.lowValueTotal} de estudio`);
      await recordAutomation(db, {
        kind: 'analyze', source, userId: u.user_id as string, status: 'succeeded', startedAt,
        summary: r.skipped
          ? { skipped: r.reason }
          : {
              recommendations: r.recommendations.total, newRecommendations: r.recommendations.logged,
              lowValue: r.recommendations.lowValueTotal, newLowValue: r.recommendations.lowValueLogged,
              withOdds: r.odds.withOdds, apiStopped: r.apiStopped,
            },
      });
    } catch (e) {
      failed = true;
      console.error(e);
      await recordAutomation(db, { kind: 'analyze', source, userId: u.user_id as string, status: 'failed', startedAt, error: (e as Error).message });
    }
  }
}

if (failed) process.exit(1); // GitHub marca la ejecución en rojo
