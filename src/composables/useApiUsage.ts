import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { supabase } from '../services/supabase';
import { callAction } from './useServerAction';
import type { UsageSnapshot } from '../lib/apiUsage';

// Última lectura REAL del consumo, tal como la informó el proveedor (se guarda en api_usage tras cada llamada).
export function useApiUsage() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['api-usage'],
    queryFn: async (): Promise<UsageSnapshot | null> => {
      const { data, error } = await supabase
        .from('api_usage')
        .select('day, requests_used, daily_limit, remaining, last_request_at, last_status, reset_observed_at, plan_name, plan_end')
        .eq('provider', 'api-football')
        .order('day', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as UsageSnapshot | null) ?? null;
    },
  });

  // Pregunta al proveedor el estado de la cuenta (el endpoint /status no gasta solicitudes).
  const check = useMutation({
    mutationFn: async () => (await callAction('api-status')).summary,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-usage'] }),
  });

  return { ...query, snapshot: computed(() => query.data.value ?? null), check };
}
