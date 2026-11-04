import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import { settleBet } from '../lib/settle';
import type { Bet, Market } from '../types/db';

const BET_SELECT =
  'id, match_id, pick_id, market, line, side, accepted_odds, stake, status, actual_corners, actual_goals, model_probability, result, profit_loss, placed_at, closed_at, ' +
  'match:matches(kickoff_at, status, league:leagues(name), home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name), match_stats(home_corners_total, away_corners_total, home_goals_total, away_goals_total))';

export function useBets() {
  const auth = useAuthStore();
  const query = useQuery({
    queryKey: ['bets', computed(() => auth.user?.id)],
    enabled: () => !!auth.user,
    queryFn: async (): Promise<Bet[]> => {
      const { data, error } = await supabase.from('bets').select(BET_SELECT).order('placed_at', { ascending: false });
      if (error) throw error;
      return data as unknown as Bet[];
    },
  });

  // Apuestas registradas hoy (día local), para el tope diario.
  const placedToday = computed(() => {
    const today = new Date().toDateString();
    return (query.data.value ?? []).filter((b) => b.status !== 'void' && new Date(b.placed_at).toDateString() === today).length;
  });

  return { ...query, placedToday };
}

// Resultado real del mercado de la apuesta (córners o goles totales), si la base ya lo tiene.
export function realTotal(bet: Bet): number | null {
  const s = Array.isArray(bet.match?.match_stats) ? bet.match?.match_stats[0] : bet.match?.match_stats;
  if (!s) return null;
  const [h, a] = bet.market === 'goals_total' ? [s.home_goals_total, s.away_goals_total] : [s.home_corners_total, s.away_corners_total];
  return h === null || a === null ? null : h + a;
}

// Valor guardado al cerrar (córners o goles según el mercado).
export const actualOf = (bet: Bet): number | null => (bet.market === 'goals_total' ? bet.actual_goals : bet.actual_corners);

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['bets'] }), qc.invalidateQueries({ queryKey: ['cash'] })]);
}

export function useCreateBet() {
  const auth = useAuthStore();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (b: {
      match_id: number;
      pick_id: number | null;
      market: Market;
      line: number;
      side: 'over' | 'under';
      odds: number;
      stake: number;
      model_probability?: number | null; // probabilidad del modelo para la selección apostada
      placed_at?: string; // fecha de la apuesta (por defecto, ahora)
      result?: 'pending' | 'won' | 'lost' | 'void'; // si ya se conoce el resultado al registrarla
    }) => {
      const result = b.result ?? 'pending';
      const settled = result === 'won' || result === 'lost' || result === 'void';
      const profit = result === 'won' ? Math.round(b.stake * (b.odds - 1) * 100) / 100 : result === 'lost' ? -b.stake : 0;
      const { error } = await supabase.from('bets').insert({
        user_id: auth.user!.id,
        match_id: b.match_id,
        pick_id: b.pick_id,
        market: b.market,
        line: b.line,
        side: b.side,
        accepted_odds: b.odds,
        stake: b.stake,
        model_probability: b.model_probability ?? null,
        ...(b.placed_at ? { placed_at: b.placed_at } : {}),
        ...(settled
          ? {
              status: result === 'void' ? 'void' : 'closed',
              result,
              profit_loss: profit,
              closed_at: new Date().toISOString(),
            }
          : {}),
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCloseBet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ bet, value }: { bet: Bet; value: number }) => {
      const s = settleBet({ side: bet.side, line: Number(bet.line), odds: Number(bet.accepted_odds), stake: Number(bet.stake), corners: value });
      const { error } = await supabase
        .from('bets')
        .update({
          status: s.result === 'void' ? 'void' : 'closed',
          ...(bet.market === 'goals_total' ? { actual_goals: value } : { actual_corners: value }),
          result: s.result,
          profit_loss: s.profit,
          closed_at: new Date().toISOString(),
        })
        .eq('id', bet.id)
        .eq('status', 'open');
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useVoidBet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('bets')
        .update({ status: 'void', result: 'void', profit_loss: 0, closed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'open');
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useConfirmBet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('bets').update({ status: 'confirmed' }).eq('id', id).eq('status', 'closed');
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// Marca una apuesta abierta como ganada, perdida o anulada/reembolsada sin indicar el resultado real.
export function useResolveBet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ bet, result }: { bet: Bet; result: 'won' | 'lost' | 'void' }) => {
      const stake = Number(bet.stake);
      const profit = result === 'won' ? Math.round(stake * (Number(bet.accepted_odds) - 1) * 100) / 100 : result === 'lost' ? -stake : 0;
      const { error } = await supabase
        .from('bets')
        .update({
          status: result === 'void' ? 'void' : 'closed',
          result,
          profit_loss: profit,
          closed_at: new Date().toISOString(),
        })
        .eq('id', bet.id)
        .eq('status', 'open');
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// Partidos recientes y próximos para elegir al registrar una apuesta a mano.
export function useSelectableMatches() {
  return useQuery({
    queryKey: ['selectable-matches'],
    queryFn: async () => {
      const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const to = new Date(Date.now() + 4 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('matches')
        .select('id, kickoff_at, league:leagues(name), home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)')
        .gte('kickoff_at', from)
        .lte('kickoff_at', to)
        .neq('status', 'cancelled')
        .order('kickoff_at', { ascending: false });
      if (error) throw error;
      return data as unknown as {
        id: number;
        kickoff_at: string;
        league: { name: string } | null;
        home: { name: string } | null;
        away: { name: string } | null;
      }[];
    },
  });
}

// Pick (si existe) para la selección, con la probabilidad que daba el modelo a esa selección.
export async function modelProbabilityFor(matchId: number, market: Market, line: number, side: 'over' | 'under') {
  const { data } = await supabase
    .from('picks')
    .select('id, probability, model_version')
    .eq('match_id', matchId)
    .eq('market', market)
    .eq('line', line)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { pickId: null as number | null, probability: null as number | null };
  const p = Number(data.probability);
  return { pickId: data.id as number, probability: side === 'over' ? p : 1 - p };
}
