// Ejecución automática sin pantalla (la lanza GitHub Actions con horario; también sirve a mano):
//   npx tsx --env-file=.env scripts/auto.ts resolve   → revisa resultados de las recomendaciones pendientes
//   npx tsx --env-file=.env scripts/auto.ts analyze   → análisis completo (partidos, picks, cuotas, recomendaciones)
// Usa los mismos procesos que la app: respeta el tope diario de API, la vigencia de los datos y el bloqueo de ejecuciones simultáneas.
import { configureUsage, fetchStatus } from './api-football.ts';
import { createServiceClient } from './db.ts';
import { refreshAll } from './refresh.ts';
import { resolvePending } from './results.ts';

const mode = process.argv[2];
if (mode !== 'resolve' && mode !== 'analyze') {
  console.error('Uso: auto.ts resolve | analyze');
  process.exit(2);
}

const db = createServiceClient();
const { data: profiles, error } = await db.from('profiles').select('user_id, api_daily_cap');
if (error) throw new Error(error.message);
const only = process.env.ANALYSIS_USER_ID; // opcional: limitar a un usuario
const users = (profiles ?? []).filter((p) => !only || p.user_id === only);
if (!users.length) {
  console.log('No hay perfiles que procesar.');
  process.exit(0);
}

if (mode === 'resolve') {
  // Primero se lee el consumo real del día (esa consulta no gasta solicitudes) y luego se revisan los resultados.
  configureUsage(db, { cap: Math.min(...users.map((u) => Number(u.api_daily_cap) || 90)) });
  try { await fetchStatus(); } catch (e) { console.log(`No se pudo leer el consumo de la API: ${(e as Error).message}`); }
  const r = await resolvePending(db, console.log, { apiCap: Math.min(...users.map((u) => Number(u.api_daily_cap) || 90)) });
  console.log(`Resultado: ${r.skipped ? 'nada pendiente por revisar' : `${r.resolved} recomendaciones cerradas`} · solicitudes de API: ${r.apiRequests}`);
} else {
  for (const u of users) {
    const r = await refreshAll(console.log, { userId: u.user_id as string });
    console.log(r.skipped ? `Omitido (${r.reason})` : `Análisis completado · ${r.recommendations.total} recomendaciones, ${r.recommendations.lowValueTotal} de estudio`);
  }
}
