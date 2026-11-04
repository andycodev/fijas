import type { Db } from './db.ts';

export interface Game {
  t: number; // instante del partido (ms)
  season: number;
  home: number;
  away: number;
  hc: number; // córners del local
  ac: number; // córners del visitante
}

// Todos los partidos terminados que tienen córners totales, de más antiguo a más reciente.
export async function loadGames(db: Db): Promise<Game[]> {
  const games: Game[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('matches')
      .select('kickoff_at, season, home_team_id, away_team_id, match_stats!inner(home_corners_total, away_corners_total)')
      .eq('status', 'finished')
      .not('match_stats.home_corners_total', 'is', null)
      .not('match_stats.away_corners_total', 'is', null)
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
        hc: s.home_corners_total,
        ac: s.away_corners_total,
      });
    }
    if (data.length < 1000) break;
  }
  return games.sort((a, b) => a.t - b.t);
}
