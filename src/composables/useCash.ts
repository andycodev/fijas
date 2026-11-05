import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import { useProfile } from './useProfile';
import { useBankroll, useLedger } from './useTickets';
import type { Reconciliation } from '../types/db';

// Caja: el saldo sale del libro de movimientos y lo calcula la base (una sola fuente de verdad).
export function useCash() {
  const auth = useAuthStore();
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['cash'] }), qc.invalidateQueries({ queryKey: ['bankroll'] })]);

  const profile = useProfile();
  const bankroll = useBankroll();
  const movements = useLedger();

  const reconciliations = useQuery({
    queryKey: ['cash', 'reconciliations', computed(() => auth.user?.id)],
    enabled: () => !!auth.user,
    queryFn: async (): Promise<Reconciliation[]> => {
      const { data, error } = await supabase
        .from('reconciliations')
        .select('id, betano_balance, calculated_balance, difference, checked_on')
        .order('checked_on', { ascending: false })
        .order('id', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as Reconciliation[];
    },
  });

  // Saldo disponible ahora (lo que Betano muestra como saldo: ya sin el importe de los boletos pendientes).
  const balance = computed(() => bankroll.data.value?.available ?? null);

  // Solo depósitos y retiros: los movimientos de apuestas los crean únicamente las funciones de la base.
  const addMovement = useMutation({
    mutationFn: async (m: { type: 'deposit' | 'withdrawal'; amount: number; occurred_on: string; note: string }) => {
      const { error } = await supabase.from('cash_movements').insert({ ...m, note: m.note || null, user_id: auth.user!.id });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const removeMovement = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('cash_movements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const addReconciliation = useMutation({
    mutationFn: async (betanoBalance: number) => {
      if (balance.value === null) throw new Error('El saldo calculado aún no está disponible.');
      const { error } = await supabase.from('reconciliations').insert({
        user_id: auth.user!.id,
        betano_balance: betanoBalance,
        calculated_balance: balance.value,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return { profile, bankroll, movements, reconciliations, balance, addMovement, removeMovement, addReconciliation };
}
