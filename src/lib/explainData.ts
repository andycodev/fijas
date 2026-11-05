import type { SupabaseClient } from '@supabase/supabase-js';
import type { HistGame } from './explain';
import type { Market } from '../types/db';

// Carga el historial que alimenta la explicación de una selección. Lo usan la pantalla (con tu sesión)
// y el servidor (para congelar la justificación en cada recomendación): ambos explican con los mismos datos.
const GAMES_PER_TEAM = 10;
const H2H_LIMIT = 5;

const STAT_FIELDS = 'home_shots, away_shots, home_shots_on_target, away_shots_on_target, home_xg, away_xg';
const COLS = {
  goals_total: ['home_goals_total', 'away_goals_total'],
  corners_total: ['home_corners_total', 'away_corners_total'],
} as const;

function toGames(rows: any[], market: Market): HistGame[] {
  const [hc, ac] = COLS[market];
  return rows.map((m) => {
    const s = Array.isArray(m.match_stats) ? m.match_stats[0] : m.match_stats;
    return {
      t: Date.parse(m.kickoff_at),
      home: m.home_team_id,
      away: m.away_team_id,
      h: s[hc],
      a: s[ac],
      hShots: s.home_shots ?? null,
      aShots: s.away_shots ?? null,
      hSot: s.home_shots_on_target ?? null,
      aSot: s.away_shots_on_target ?? null,
      hXg: s.home_xg ?? null,
      aXg: s.away_xg ?? null,
    };
  });
}

async function fetchGames(db: SupabaseClient, filter: string, market: Market, limit: number): Promise<HistGame[]> {
  const [hc, ac] = COLS[market];
  const { data, error } = await db
    .from('matches')
    .select(`kickoff_at, home_team_id, away_team_id, match_stats!inner(${hc}, ${ac}, ${STAT_FIELDS})`)
    .eq('status', 'finished')
    .not(`match_stats.${hc}`, 'is', null)
    .not(`match_stats.${ac}`, 'is', null)
    .or(filter)
    .order('kickoff_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return toGames(data as any[], market);
}

export async function loadExplanationData(db: SupabaseClient, market: Market, homeId: number, awayId: number) {
  const [homeGames, awayGames, h2h] = await Promise.all([
    fetchGames(db, `home_team_id.eq.${homeId},away_team_id.eq.${homeId}`, market, GAMES_PER_TEAM),
    fetchGames(db, `home_team_id.eq.${awayId},away_team_id.eq.${awayId}`, market, GAMES_PER_TEAM),
    fetchGames(
      db,
      `and(home_team_id.eq.${homeId},away_team_id.eq.${awayId}),and(home_team_id.eq.${awayId},away_team_id.eq.${homeId})`,
      market,
      H2H_LIMIT,
    ),
  ]);
  return { homeGames, awayGames, h2h };
}
