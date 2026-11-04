import { computed, type Ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { supabase } from '../services/supabase';
import { buildExplanation, type Explanation, type HistGame } from '../lib/explain';
import type { Selection } from '../lib/opportunities';

const GAMES_PER_TEAM = 10;
const H2H_LIMIT = 5;

const STAT_FIELDS = 'home_shots, away_shots, home_shots_on_target, away_shots_on_target, home_xg, away_xg';
const COLS = {
  goals_total: ['home_goals_total', 'away_goals_total'],
  corners_total: ['home_corners_total', 'away_corners_total'],
} as const;

function toGames(rows: any[], market: keyof typeof COLS): HistGame[] {
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

async function fetchGames(filter: string, market: keyof typeof COLS, limit: number): Promise<HistGame[]> {
  const [hc, ac] = COLS[market];
  const { data, error } = await supabase
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

// Carga (solo cuando se pide) los últimos partidos de cada equipo y los cruces directos,
// y arma la explicación de la selección.
export function useExplanation(selection: Ref<Selection>, enabled: Ref<boolean>) {
  const market = computed(() => selection.value.market);
  const homeId = computed(() => selection.value.match.home_team_id);
  const awayId = computed(() => selection.value.match.away_team_id);

  const raw = useQuery({
    queryKey: ['explain-data', homeId, awayId, market],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const [homeGames, awayGames, h2h] = await Promise.all([
        fetchGames(`home_team_id.eq.${homeId.value},away_team_id.eq.${homeId.value}`, market.value, GAMES_PER_TEAM),
        fetchGames(`home_team_id.eq.${awayId.value},away_team_id.eq.${awayId.value}`, market.value, GAMES_PER_TEAM),
        fetchGames(
          `and(home_team_id.eq.${homeId.value},away_team_id.eq.${awayId.value}),and(home_team_id.eq.${awayId.value},away_team_id.eq.${homeId.value})`,
          market.value,
          H2H_LIMIT,
        ),
      ]);
      return { homeGames, awayGames, h2h };
    },
  });

  const explanation = computed<Explanation | null>(() => {
    if (!raw.data.value) return null;
    const s = selection.value;
    return buildExplanation({
      market: s.market,
      side: s.side,
      line: s.line,
      homeId: homeId.value,
      awayId: awayId.value,
      homeName: s.match.home?.name ?? 'Local',
      awayName: s.match.away?.name ?? 'Visitante',
      ...raw.data.value,
    });
  });

  return { explanation, isLoading: raw.isLoading, isError: raw.isError };
}
