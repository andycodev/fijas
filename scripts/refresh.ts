// Análisis completo: resultados nuevos (Football-Data) → partidos por jugar (API-Football) → picks → cuotas → recomendaciones.
// La llama el botón «Analizar» de la app (vía el servidor de desarrollo) y también se puede correr a mano:
//   npx tsx --env-file=.env scripts/refresh.ts
//
// Cada ejecución de un usuario queda registrada en analysis_runs: empieza «en curso», y solo pasa a «terminada» o
// «fallida» al final. Solo puede haber una en curso por usuario (lo garantiza un índice único en la base).
import { createServiceClient, isMain, type Db } from './db.ts';
import { configureUsage, fetchStatus, requestsUsedToday } from './api-football.ts';
import { loadFootballData } from './load-football-data.ts';
import { syncFixtures } from './sync-fixtures.ts';
import { generatePicks, settlePicks } from './picks.ts';
import { syncOdds } from './sync-odds.ts';
import { logRecommendations, settleRecommendations } from './recommendations.ts';
import { refreshAllowedAt } from '../src/lib/apiUsage.ts';

const currentSeason = () => {
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1; // temporada empieza en julio/agosto
};

const isCapError = (e: unknown) => e instanceof Error && e.message.includes('Tope diario');
const STALE_RUN_MINUTES = 10; // un análisis «en curso» más viejo que esto se considera interrumpido

export interface RefreshOptions {
  userId?: string; // usuario que pide el análisis: define sus ligas activas, su tope, su frecuencia y su registro de ejecuciones
  force?: boolean; // ignora la vigencia de los datos (la app lo pide con confirmación)
}

export type RefreshResult =
  | { skipped: true; reason: 'fresh'; lastRunAt: string; nextAllowedAt: string }
  | { skipped: true; reason: 'running' }
  | {
      skipped: false;
      runId: number | null;
      apiStopped: boolean;
      fixtures: { saved: number; withHistory: number; unmatched: string[]; apiRequestsToday: number };
      picks: { matches: number; skipped: number };
      odds: { matches: number; withOdds: number; without: number; rows: number };
      recommendations: { logged: number; total: number; lowValueLogged: number; lowValueTotal: number };
      finishedAt: string;
    };

async function pipeline(db: Db, log: (s: string) => void, ctx: { userId?: string; runId: number | null; profile: any }): Promise<Exclude<RefreshResult, { skipped: true }>> {
  const { profile, userId, runId } = ctx;
  const activeLeagueIds = profile?.active_league_ids?.length ? (profile.active_league_ids as number[]) : undefined;

  log('1/6 Resultados recientes (Football-Data)…');
  await loadFootballData(db, [currentSeason()], log, activeLeagueIds);
  log('\n2/6 Resultado real de picks anteriores…');
  await settlePicks(db, log);
  log(`Recomendaciones cerradas: ${await settleRecommendations(db)}`);

  let apiStopped = false;
  const emptyFixtures = { saved: 0, withHistory: 0, unmatched: [] as string[], apiRequestsToday: requestsUsedToday() };
  const emptyOdds = { matches: 0, withOdds: 0, without: 0, rows: 0, apiRequestsToday: requestsUsedToday() };

  log('\n3/6 Partidos de hoy y mañana (API-Football)…');
  let fixtures = emptyFixtures;
  try {
    fixtures = await syncFixtures(db, 1, log, { activeLeagueIds });
  } catch (e) {
    if (!isCapError(e)) throw e;
    apiStopped = true;
    log(`${(e as Error).message} Se siguen usando los partidos ya guardados.`);
  }

  log('\n4/6 Picks…');
  const picks = await generatePicks(db, log, { activeLeagueIds });

  log('\n5/6 Cuotas de Betano…');
  let odds = emptyOdds;
  if (apiStopped) {
    log('Omitido: se alcanzó el tope de solicitudes de hoy.');
  } else {
    try {
      odds = await syncOdds(db, log, { activeLeagueIds, minProbability: Number(profile?.min_probability ?? 0.75), dailyCap: Number(profile?.api_daily_cap ?? 90) });
    } catch (e) {
      if (!isCapError(e)) throw e;
      apiStopped = true;
      log((e as Error).message);
    }
  }

  let recommendations = { logged: 0, total: 0, lowValueLogged: 0, lowValueTotal: 0 };
  if (userId && runId !== null) {
    log('\n6/6 Recomendaciones…');
    recommendations = await logRecommendations(db, {
      userId, runId, activeLeagueIds,
      minProbability: Number(profile?.min_probability ?? 0.75),
      valueThreshold: Number(profile?.value_threshold ?? 0.05),
    });
    log(`Recomendaciones: ${recommendations.total} (${recommendations.logged} nuevas en el registro) · de estudio (valor 0–${((Number(profile?.value_threshold ?? 0.05)) * 100).toFixed(0)}%): ${recommendations.lowValueTotal} (${recommendations.lowValueLogged} nuevas)`);
  }
  return { skipped: false, runId, apiStopped, fixtures, picks, odds, recommendations, finishedAt: new Date().toISOString() };
}

export async function refreshAll(log: (s: string) => void = console.log, options: RefreshOptions = {}): Promise<RefreshResult> {
  const db = createServiceClient();
  const { userId, force = false } = options;

  const { data: profile } = userId
    ? await db
        .from('profiles')
        .select('active_league_ids, api_daily_cap, refresh_interval_minutes, min_probability, value_threshold')
        .eq('user_id', userId)
        .maybeSingle()
    : { data: null };

  configureUsage(db, { cap: profile ? Number(profile.api_daily_cap) : undefined });

  // Sin usuario (ejecución a mano desde la terminal) no se registra la ejecución.
  if (!userId) {
    const result = await pipeline(db, log, { profile, userId, runId: null });
    return result;
  }

  // 1) Interrumpidas: una ejecución «en curso» demasiado vieja se marca como fallida para liberar el bloqueo.
  await db
    .from('analysis_runs')
    .update({ status: 'failed', finished_at: new Date().toISOString(), error: 'Interrumpida: no terminó a tiempo.' })
    .eq('user_id', userId)
    .eq('status', 'running')
    .lt('started_at', new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString());

  // 2) Vigencia: si el último análisis exitoso es reciente, no se gasta API a menos que se fuerce.
  if (!force) {
    const { data: last } = await db
      .from('analysis_runs')
      .select('finished_at')
      .eq('user_id', userId)
      .eq('status', 'succeeded')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = last?.finished_at ? refreshAllowedAt(last.finished_at, Number(profile?.refresh_interval_minutes ?? 60)) : null;
    if (last?.finished_at && next && next.getTime() > Date.now()) {
      log(`Los datos siguen vigentes (último análisis: ${last.finished_at}).`);
      return { skipped: true, reason: 'fresh', lastRunAt: last.finished_at, nextAllowedAt: next.toISOString() };
    }
  }

  // 3) Bloqueo: la base solo admite una ejecución en curso por usuario.
  let apiBefore: number | null = null;
  try { apiBefore = (await fetchStatus()).used; } catch (e) { log(`No se pudo consultar el estado de la cuenta: ${(e as Error).message}`); }
  const { data: run, error: lockError } = await db
    .from('analysis_runs')
    .insert({ user_id: userId, trigger: force ? 'forced' : 'manual', api_used_before: apiBefore })
    .select('id')
    .single();
  if (lockError) {
    if (lockError.code === '23505') return { skipped: true, reason: 'running' }; // ya hay un análisis en curso
    throw new Error(lockError.message);
  }
  const runId = run.id as number;

  // 4) Ejecución: solo se marca «terminada» si todo salió bien.
  try {
    const result = await pipeline(db, log, { profile, userId, runId });
    let apiAfter: number | null = null;
    try { apiAfter = (await fetchStatus()).used; } catch { /* informativo */ }
    await db
      .from('analysis_runs')
      .update({ status: 'succeeded', finished_at: result.finishedAt, api_used_after: apiAfter, summary: { ...result } })
      .eq('id', runId);
    return result;
  } catch (e) {
    await db
      .from('analysis_runs')
      .update({ status: 'failed', finished_at: new Date().toISOString(), error: (e as Error).message.slice(0, 500) })
      .eq('id', runId);
    throw e;
  }
}

if (isMain(import.meta.url)) await refreshAll();
