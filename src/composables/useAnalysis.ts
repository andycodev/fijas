import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import type { AnalysisRun, RecommendationRow } from '../types/db';

// Ejecuciones del análisis (botón Analizar y robot automático).
export function useAnalysisRuns() {
  const auth = useAuthStore();
  const query = useQuery({
    queryKey: ['analysis-runs', computed(() => auth.user?.id)],
    enabled: () => !!auth.user,
    // Mientras haya un análisis en curso se consulta cada pocos segundos para ver cuándo termina.
    refetchInterval: (q) => ((q.state.data as AnalysisRun[] | undefined)?.[0]?.status === 'running' ? 3000 : false),
    queryFn: async (): Promise<AnalysisRun[]> => {
      const { data, error } = await supabase
        .from('analysis_runs')
        .select('id, status, trigger, started_at, finished_at, api_used_before, api_used_after, error')
        .order('started_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as AnalysisRun[];
    },
  });
  const last = computed(() => query.data.value?.[0] ?? null);
  const lastSuccess = computed(() => query.data.value?.find((r) => r.status === 'succeeded') ?? null);
  return { ...query, last, lastSuccess };
}

// Recomendaciones registradas por el modelo (congeladas tal como se generaron) y su resultado.
export function useRecommendations() {
  const auth = useAuthStore();
  return useQuery({
    queryKey: ['recommendations', computed(() => auth.user?.id)],
    enabled: () => !!auth.user,
    queryFn: async (): Promise<RecommendationRow[]> => {
      const base = 'id, pick_id, match_id, market, line, side, model_probability, odds, ev, odds_origin, created_at, result, actual_value, settled_at';
      const rest = 'league_id, kickoff_at, rationale, resolution_note, match:matches(kickoff_at, status, league:leagues(name), home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name))';
      const run = (cols: string) => supabase.from('recommendations').select(cols).order('kickoff_at', { ascending: false }).limit(2000);
      let res = await run(`${base}, category, ${rest}`);
      // Si la migración de categorías aún no se aplicó, todo lo registrado cuenta como principal.
      if (res.error && /category/.test(res.error.message)) res = await run(`${base}, ${rest}`);
      if (res.error) throw res.error;
      return (res.data as unknown as RecommendationRow[]).map((r) => ({ ...r, category: r.category ?? 'main' }));
    },
  });
}
