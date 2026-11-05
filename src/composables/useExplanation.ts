import { computed, type Ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { supabase } from '../services/supabase';
import { buildExplanation, type Explanation } from '../lib/explain';
import { loadExplanationData } from '../lib/explainData';
import type { Selection } from '../lib/opportunities';

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
    queryFn: () => loadExplanationData(supabase, market.value, homeId.value, awayId.value),
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
