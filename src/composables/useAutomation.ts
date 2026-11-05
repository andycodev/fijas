import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import type { AutomationRun } from '../lib/automation';

// Últimas ejecuciones automáticas (robot de GitHub Actions). Si la migración aún no se aplicó, simplemente no hay nada que mostrar.
export function useAutomationRuns() {
  const auth = useAuthStore();
  return useQuery({
    queryKey: ['automation-runs', computed(() => auth.user?.id)],
    enabled: () => !!auth.user,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    queryFn: async (): Promise<AutomationRun[]> => {
      const { data, error } = await supabase
        .from('automation_runs')
        .select('id, kind, source, status, started_at, finished_at, summary, error')
        .order('started_at', { ascending: false })
        .limit(40);
      if (error) {
        if (/automation_runs|relation|schema cache/i.test(error.message)) return []; // tabla aún no creada
        throw error;
      }
      return data as AutomationRun[];
    },
  });
}
