import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import { callAction } from './useServerAction';
import { latestVersionPicks } from '../lib/opportunities';
import type { Market, OddsRow, UpcomingMatch } from '../types/db';

const HOURS_AHEAD = 72;

export function useUpcomingMatches() {
  return useQuery({
    queryKey: ['upcoming-matches'],
    queryFn: async (): Promise<UpcomingMatch[]> => {
      const from = new Date(Date.now() - 3 * 3600_000).toISOString();
      const to = new Date(Date.now() + HOURS_AHEAD * 3600_000).toISOString();
      const { data, error } = await supabase
        .from('matches')
        .select(
          'id, league_id, home_team_id, away_team_id, kickoff_at, league:leagues(name), home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name), picks(id, line, projection, probability, min_odds, model_version, market, home_games_used, away_games_used, latest_game_at)',
        )
        .eq('status', 'scheduled')
        .gte('kickoff_at', from)
        .lte('kickoff_at', to)
        .order('kickoff_at');
      if (error) throw error;
      // Solo la versión de modelo más reciente de cada partido, y las líneas en orden.
      return (data as unknown as UpcomingMatch[]).map((m) => ({ ...m, picks: latestVersionPicks(m.picks) }));
    },
  });
}

export function useOdds(matchIds: () => number[]) {
  const auth = useAuthStore();
  return useQuery({
    queryKey: ['odds', computed(() => auth.user?.id), computed(() => matchIds().join(','))],
    enabled: () => !!auth.user && matchIds().length > 0,
    queryFn: async (): Promise<OddsRow[]> => {
      const { data, error } = await supabase
        .from('odds')
        .select('id, match_id, market, line, over_odds, under_odds, origin, captured_at')
        .eq('bookmaker', 'betano')
        .in('match_id', matchIds());
      if (error) throw error;
      return data as OddsRow[];
    },
  });
}

export function useSaveOdds() {
  const auth = useAuthStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: { match_id: number; market: Market; line: number; over: number | null; under: number | null }) => {
      const userId = auth.user!.id;
      const del = await supabase
        .from('odds')
        .delete()
        .eq('origin', 'manual')
        .eq('bookmaker', 'betano')
        .eq('match_id', o.match_id)
        .eq('market', o.market)
        .eq('line', o.line);
      if (del.error) throw del.error;
      if (o.over === null && o.under === null) return;
      const { error } = await supabase.from('odds').insert({
        match_id: o.match_id,
        bookmaker: 'betano',
        market: o.market,
        line: o.line,
        over_odds: o.over,
        under_odds: o.under,
        origin: 'manual',
        user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['odds'] }),
  });
}

export type AnalyzeSummary =
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

// Pide al servidor local analizar: resultados, partidos, picks, cuotas y recomendaciones. El servidor decide si los datos
// siguen vigentes (no gasta API), bloquea ejecuciones simultáneas y registra la ejecución.
// Con force = true se ignora la vigencia (la app lo pide con confirmación).
export function useAnalyze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (force: boolean = false): Promise<AnalyzeSummary> => {
      const { summary } = await callAction<AnalyzeSummary>('analyze', { force });
      return summary;
    },
    // Termine bien o mal, el servidor dejó registrada la ejecución y pudo cambiar datos.
    onSettled: () =>
      Promise.all(
        ['upcoming-matches', 'odds', 'api-usage', 'profile', 'analysis-runs', 'recommendations'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      ),
  });
}
