// Amplía el histórico del modelo con las ligas que Football-Data.co.uk ofrece gratis y que aún no están en la base.
// No gasta solicitudes de API-Football: solo descarga CSV. Más histórico = más equipos con análisis (sobre todo clubes de copas europeas).
//   npx tsx --env-file=.env scripts/expand-history.ts            → carga el histórico de las ligas que falten
//   npx tsx --env-file=.env scripts/expand-history.ts --activate → además activa para el usuario las ligas de la lista PRIORITARIA
import { createServiceClient, isMain } from './db.ts';
import { FOOTBALL_DATA_CODES } from './football-data-map.ts';
import { loadFootballData } from './load-football-data.ts';

// Nombre y país de cada liga (se fija aquí para no gastar una solicitud del catálogo).
const INFO: Record<number, { name: string; country: string }> = {
  40: { name: 'Championship', country: 'England' }, 41: { name: 'League One', country: 'England' }, 42: { name: 'League Two', country: 'England' },
  141: { name: 'Segunda División', country: 'Spain' }, 136: { name: 'Serie B', country: 'Italy' },
  79: { name: '2. Bundesliga', country: 'Germany' }, 62: { name: 'Ligue 2', country: 'France' },
  88: { name: 'Eredivisie', country: 'Netherlands' }, 94: { name: 'Primeira Liga', country: 'Portugal' },
  144: { name: 'Jupiler Pro League', country: 'Belgium' }, 203: { name: 'Süper Lig', country: 'Turkey' },
  197: { name: 'Super League 1', country: 'Greece' }, 179: { name: 'Premiership', country: 'Scotland' },
};
// De donde salen muchos clubes de Europa y Conference: se activan para analizar también sus partidos.
export const PRIORITY_NEW = [88, 94, 144, 203, 197, 179];

export async function expandHistory(log: (s: string) => void = console.log, activate = false) {
  const db = createServiceClient();
  const { data: existing, error } = await db.from('leagues').select('id, api_football_id');
  if (error) throw new Error(error.message);
  const have = new Set((existing ?? []).map((l) => l.api_football_id as number));
  const missing = Object.keys(FOOTBALL_DATA_CODES).map(Number).filter((id) => !have.has(id) && INFO[id]);

  const rows = missing.map((id) => ({
    name: INFO[id]!.name, country: INFO[id]!.country, api_football_id: id, football_data_code: FOOTBALL_DATA_CODES[id]!.code, kind: 'league',
  }));
  if (rows.length) {
    const up = await db.from('leagues').upsert(rows, { onConflict: 'api_football_id' });
    if (up.error) throw new Error(up.error.message);
  }
  const { data: all } = await db.from('leagues').select('id, name, api_football_id').in('api_football_id', Object.keys(INFO).map(Number));
  // Sin histórico = ligas de la lista sin ningún partido guardado (así se puede reanudar si una carga se interrumpe).
  const ids: number[] = [];
  for (const l of all ?? []) {
    const c = await db.from('matches').select('id', { count: 'exact', head: true }).eq('league_id', l.id);
    if (!c.error && (c.count ?? 0) === 0) ids.push(l.id as number);
  }
  if (ids.length) {
    log(`Cargando histórico (2022–2026) de: ${(all ?? []).filter((l) => ids.includes(l.id as number)).map((l) => l.name).join(', ')}`);
    await loadFootballData(db, [2022, 2023, 2024, 2025, 2026], log, ids);
  }

  let activated: string[] = [];
  if (activate) {
    const prio = (all ?? []).filter((l) => PRIORITY_NEW.includes(l.api_football_id as number));
    const { data: profiles } = await db.from('profiles').select('user_id, active_league_ids');
    for (const p of profiles ?? []) {
      const next = [...new Set([...(p.active_league_ids as number[]), ...prio.map((l) => l.id as number)])];
      const u = await db.from('profiles').update({ active_league_ids: next }).eq('user_id', p.user_id);
      if (u.error) throw new Error(u.error.message);
    }
    activated = prio.map((l) => l.name as string);
    log(`Ligas activadas: ${activated.join(', ')}`);
  }
  return { added: rows.map((r) => r.name), activated };
}

if (isMain(import.meta.url)) await expandHistory(console.log, process.argv.includes('--activate'));
