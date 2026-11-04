import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import { calculatedBalance } from '../lib/balance';
import { useProfile } from './useProfile';
import type { BetMoney, CashMovement, Reconciliation } from '../types/db';

export function useCash() {
  const auth = useAuthStore();
  const qc = useQueryClient();
  const uid = () => auth.user?.id;
  const enabled = () => !!auth.user;
  const refresh = () => qc.invalidateQueries({ queryKey: ['cash'] });

  const profile = useProfile();

  const movements = useQuery({
    queryKey: ['cash', 'movements', uid],
    enabled,
    queryFn: async (): Promise<CashMovement[]> => {
      const { data, error } = await supabase
        .from('cash_movements')
        .select('id, type, amount, occurred_on, note')
        .order('occurred_on', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return data as CashMovement[];
    },
  });

  const bets = useQuery({
    queryKey: ['cash', 'bets', uid],
    enabled,
    queryFn: async (): Promise<BetMoney[]> => {
      const { data, error } = await supabase.from('bets').select('status, stake, profit_loss');
      if (error) throw error;
      return data as BetMoney[];
    },
  });

  const reconciliations = useQuery({
    queryKey: ['cash', 'reconciliations', uid],
    enabled,
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

  const balance = computed(() =>
    profile.data.value && movements.data.value && bets.data.value
      ? calculatedBalance(profile.data.value.initial_bankroll, movements.data.value, bets.data.value)
      : null,
  );

  const addMovement = useMutation({
    mutationFn: async (m: { type: 'deposit' | 'withdrawal'; amount: number; occurred_on: string; note: string }) => {
      const { error } = await supabase
        .from('cash_movements')
        .insert({ ...m, note: m.note || null, user_id: auth.user!.id });
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

  return { profile, movements, reconciliations, balance, addMovement, removeMovement, addReconciliation };
}
