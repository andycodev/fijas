// Actualización completa: resultados nuevos (Football-Data) → partidos por jugar (API-Football) → picks → cuotas.
// La llama el botón de la app (vía el servidor de desarrollo) y también se puede correr a mano:
//   npx tsx --env-file=.env scripts/refresh.ts
import { createServiceClient, isMain } from './db.ts';
import { configureUsage, fetchStatus, requestsUsedToday } from './api-football.ts';
import { loadFootballData } from './load-football-data.ts';
import { syncFixtures } from './sync-fixtures.ts';
import { generatePicks, settlePicks } from './picks.ts';
import { syncOdds } from './sync-odds.ts';
import { refreshAllowedAt } from '../src/lib/apiUsage.ts';

const currentSeason = () => {
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1; // temporada empieza en julio/agosto
};

const isCapError = (e: unknown) => e instanceof Error && e.message.includes('Tope diario');

export interface RefreshOptions {
  userId?: string; // usuario que pide la actualización: define sus ligas activas, su tope y su frecuencia
  force?: boolean; // ignora la frecuencia mínima entre actualizaciones
}

export async function refreshAll(log: (s: string) => void = console.log, options: RefreshOptions = {}) {
  const db = createServiceClient();

  const { data: profile } = options.userId
    ? await db
        .from('profiles')
        .select('active_league_ids, api_daily_cap, refresh_interval_minutes, last_refresh_at')
        .eq('user_id', options.userId)
        .maybeSingle()
    : { data: null };

  // Frecuencia configurada: evita análisis repetidos sin necesidad.
  if (profile && !options.force) {
    const next = refreshAllowedAt(profile.last_refresh_at, Number(profile.refresh_interval_minutes));
    if (next && next.getTime() > Date.now()) {
      log(`Actualizado hace poco. La próxima actualización automática está permitida desde ${next.toISOString()}.`);
      return { skipped: true as const, nextAllowedAt: next.toISOString() };
    }
  }

  configureUsage(db, { cap: profile ? Number(profile.api_daily_cap) : undefined });
  const activeLeagueIds = profile?.active_league_ids?.length ? (profile.active_league_ids as number[]) : undefined;

  // El consumo real sale del proveedor (/status no gasta solicitudes).
  try {
    const st = await fetchStatus();
    log(`Consumo real del proveedor: ${st.used}/${st.limit} solicitudes hoy.`);
  } catch (e) {
    log(`No se pudo consultar el estado de la cuenta: ${(e as Error).message}`);
  }

  log('1/5 Resultados recientes (Football-Data)…');
  await loadFootballData(db, [currentSeason()], log, activeLeagueIds);
  log('\n2/5 Resultado real de picks anteriores…');
  await settlePicks(db, log);

  let apiStopped = false;
  const emptyFixtures = { saved: 0, withHistory: 0, unmatched: [] as string[], apiRequestsToday: requestsUsedToday() };
  const emptyOdds = { matches: 0, withOdds: 0, without: 0, rows: 0, apiRequestsToday: requestsUsedToday() };

  log('\n3/5 Partidos de hoy y mañana (API-Football)…');
  let fixtures = emptyFixtures;
  try {
    fixtures = await syncFixtures(db, 1, log, { activeLeagueIds });
  } catch (e) {
    if (!isCapError(e)) throw e;
    apiStopped = true;
    log(`${(e as Error).message} Se siguen usando los partidos ya guardados.`);
  }

  log('\n4/5 Picks…');
  const picks = await generatePicks(db, log, { activeLeagueIds });

  log('\n5/5 Cuotas de Betano…');
  let odds = emptyOdds;
  if (apiStopped) {
    log('Omitido: se alcanzó el tope de solicitudes de hoy.');
  } else {
    try {
      odds = await syncOdds(db, log, { activeLeagueIds });
    } catch (e) {
      if (!isCapError(e)) throw e;
      apiStopped = true;
      log((e as Error).message);
    }
  }

  if (options.userId) {
    await db.from('profiles').update({ last_refresh_at: new Date().toISOString() }).eq('user_id', options.userId);
  }
  return { skipped: false as const, apiStopped, fixtures, picks, odds };
}

if (isMain(import.meta.url)) await refreshAll();
