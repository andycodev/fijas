import type { Db } from './db.ts';

export type CountMarket = 'corners_total' | 'goals_total';

// Columnas de match_stats que alimentan cada mercado.
export const STAT_COLUMNS: Record<CountMarket, { home: string; away: string }> = {
  corners_total: { home: 'home_corners_total', away: 'away_corners_total' },
  goals_total: { home: 'home_goals_total', away: 'away_goals_total' },
};

export interface Game {
  t: number; // instante del partido (ms)
  season: number;
  home: number;
  away: number;
  h: number; // valor del mercado para el local (córners o goles)
  a: number; // valor del mercado para el visitante
}

// Partidos terminados que tienen el dato del mercado, de más antiguo a más reciente.
export async function loadGames(db: Db, market: CountMarket = 'corners_total'): Promise<Game[]> {
  const cols = STAT_COLUMNS[market];
  const games: Game[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('matches')
      .select(`kickoff_at, season, home_team_id, away_team_id, match_stats!inner(${cols.home}, ${cols.away})`)
      .eq('status', 'finished')
      .not(`match_stats.${cols.home}`, 'is', null)
      .not(`match_stats.${cols.away}`, 'is', null)
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const m of data as any[]) {
      const s = Array.isArray(m.match_stats) ? m.match_stats[0] : m.match_stats;
      games.push({
        t: Date.parse(m.kickoff_at),
        season: m.season,
        home: m.home_team_id,
        away: m.away_team_id,
        h: s[cols.home],
        a: s[cols.away],
      });
    }
    if (data.length < 1000) break;
  }
  return games.sort((a, b) => a.t - b.t);
}
