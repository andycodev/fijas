import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import type { ManualOdds, UpcomingMatch } from '../types/db';

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
          'id, kickoff_at, league:leagues(name), home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name), picks(line, projection, probability, min_odds, model_version, market)',
        )
        .eq('status', 'scheduled')
        .gte('kickoff_at', from)
        .lte('kickoff_at', to)
        .eq('picks.market', 'corners_total')
        .order('kickoff_at');
      if (error) throw error;
      // Solo la versión de modelo más reciente de cada partido, y las líneas en orden.
      return (data as unknown as UpcomingMatch[]).map((m) => {
        const latest = m.picks.map((p) => p.model_version).sort().at(-1);
        return { ...m, picks: m.picks.filter((p) => p.model_version === latest).sort((a, b) => a.line - b.line) };
      });
    },
  });
}

export function useManualOdds(matchIds: () => number[]) {
  const auth = useAuthStore();
  return useQuery({
    queryKey: ['manual-odds', computed(() => auth.user?.id), computed(() => matchIds().join(','))],
    enabled: () => !!auth.user && matchIds().length > 0,
    queryFn: async (): Promise<ManualOdds[]> => {
      const { data, error } = await supabase
        .from('odds')
        .select('id, match_id, market, line, over_odds, under_odds')
        .eq('origin', 'manual')
        .eq('bookmaker', 'betano')
        .in('match_id', matchIds());
      if (error) throw error;
      return data as ManualOdds[];
    },
  });
}

export function useSaveOdds() {
  const auth = useAuthStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: { match_id: number; line: number; over: number | null; under: number | null }) => {
      const userId = auth.user!.id;
      const del = await supabase
        .from('odds')
        .delete()
        .eq('origin', 'manual')
        .eq('bookmaker', 'betano')
        .eq('match_id', o.match_id)
        .eq('market', 'corners_total')
        .eq('line', o.line);
      if (del.error) throw del.error;
      if (o.over === null && o.under === null) return;
      const { error } = await supabase.from('odds').insert({
        match_id: o.match_id,
        bookmaker: 'betano',
        market: 'corners_total',
        line: o.line,
        over_odds: o.over,
        under_odds: o.under,
        origin: 'manual',
        user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manual-odds'] }),
  });
}

export interface RefreshResult {
  ok: boolean;
  log: string[];
  summary: {
    fixtures: { saved: number; withHistory: number; unmatched: string[]; apiRequestsToday: number };
    picks: { matches: number; skipped: number };
  };
}

// Llama al endpoint local del servidor de desarrollo (no existe fuera de `pnpm dev`).
export function useRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<RefreshResult> => {
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/refresh', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      });
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error('El botón solo funciona con el servidor local (pnpm dev).');
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'No se pudo actualizar.');
      return body as RefreshResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['upcoming-matches'] }),
  });
}
