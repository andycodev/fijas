// Acciones que la app pide al servidor local (botones de Picks y de Ajustes). Solo servidor.
import type { Db } from './db.ts';
import { apiGet, configureUsage, fetchStatus } from './api-football.ts';
import { FOOTBALL_DATA_CODES } from './football-data-map.ts';
import { loadFootballData } from './load-football-data.ts';
import { refreshAll } from './refresh.ts';

const HISTORY_SEASONS = [2022, 2023, 2024, 2025, 2026];

export interface CatalogLeague {
  id: number;
  name: string;
  country: string;
  type: string; // League | Cup
  hasHistory: boolean; // tiene histórico gratuito para calcular picks
}

async function userSettings(db: Db, userId: string) {
  const { data } = await db
    .from('profiles')
    .select('active_league_ids, api_daily_cap')
    .eq('user_id', userId)
    .maybeSingle();
  return data as { active_league_ids: number[]; api_daily_cap: number } | null;
}

// Consulta /status (no gasta solicitudes) y devuelve lo que quedó guardado.
export async function apiStatus(db: Db, userId: string) {
  const s = await userSettings(db, userId);
  configureUsage(db, { cap: s?.api_daily_cap });
  await fetchStatus();
  const { data } = await db.from('api_usage').select('*').eq('provider', 'api-football').order('day', { ascending: false }).limit(1).maybeSingle();
  return data;
}

// Todas las competiciones de la API con temporada en curso. Cuesta 1 solicitud y se guarda en caché una semana.
export async function leaguesCatalog(db: Db, userId: string): Promise<{ leagues: CatalogLeague[]; fromCache: boolean }> {
  const s = await userSettings(db, userId);
  configureUsage(db, { cap: s?.api_daily_cap });
  const res = await apiGet('/leagues', {}, { maxAgeHours: 24 * 7 });
  if (res.body.errors && Object.keys(res.body.errors).length) throw new Error(`API: ${JSON.stringify(res.body.errors)}`);
  const leagues: CatalogLeague[] = (res.body.response as any[])
    .filter((l) => (l.seasons as any[]).some((x) => x.current))
    .map((l) => ({
      id: l.league.id,
      name: l.league.name,
      country: l.country?.name ?? '',
      type: l.league.type,
      hasHistory: l.league.id in FOOTBALL_DATA_CODES,
    }));
  return { leagues, fromCache: res.fromCache };
}

// Agrega una liga del catálogo, la activa para el usuario y, si hay histórico gratuito, lo carga.
export async function addLeague(db: Db, userId: string, apiId: number, log: (s: string) => void = console.log) {
  const { leagues } = await leaguesCatalog(db, userId);
  const found = leagues.find((l) => l.id === apiId);
  if (!found) throw new Error('Esa competición no está en el catálogo de la API.');

  const mapped = FOOTBALL_DATA_CODES[apiId];
  // Si el nombre del catálogo no se parece al esperado, no se carga histórico: evita mezclar ligas por un id equivocado.
  const code = mapped && mapped.expectedName.test(found.name) ? mapped.code : null;
  if (mapped && !code) log(`El id ${apiId} se llama «${found.name}» y no coincide con lo esperado: se agrega sin histórico.`);

  const { data: sameName } = await db.from('leagues').select('api_football_id').eq('name', found.name).maybeSingle();
  const name = sameName && sameName.api_football_id !== apiId ? `${found.name} (${found.country})` : found.name;

  const { data: league, error } = await db
    .from('leagues')
    .upsert(
      { name, country: found.country, api_football_id: apiId, football_data_code: code, kind: found.type === 'Cup' ? 'cup' : 'league' },
      { onConflict: 'api_football_id' },
    )
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const s = await userSettings(db, userId);
  const active = [...new Set([...(s?.active_league_ids ?? []), league.id as number])];
  const up = await db.from('profiles').update({ active_league_ids: active }).eq('user_id', userId);
  if (up.error) throw new Error(up.error.message);

  let historyLoaded = false;
  if (code) {
    log(`Cargando histórico de ${name} (${code})…`);
    await loadFootballData(db, HISTORY_SEASONS, log, [league.id as number]);
    historyLoaded = true;
  }
  return { leagueId: league.id as number, name, historyLoaded };
}

export { refreshAll };
