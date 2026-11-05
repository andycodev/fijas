import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import { legResult } from '../lib/tickets';
import type {
  AnalysisRun, BankrollSummary, LedgerEntry, Market, RecommendationRow, Ticket, TicketSelection,
} from '../types/db';

const TICKET_SELECT =
  'id, kind, bookmaker, accepted_odds, computed_odds, odds_edited, stake, status, result, payout, profit_loss, placed_at, closed_at, settled_at, ' +
  'selections:bet_selections(id, position, match_id, pick_id, market, line, side, odds, model_probability, actual_value, result, ' +
  'match:matches(kickoff_at, status, league:leagues(name), home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name), ' +
  'match_stats(home_corners_total, away_corners_total, home_goals_total, away_goals_total)))';

const uid = () => useAuthStore().user?.id;

// ───────── Lectura ─────────
export function useTickets() {
  const auth = useAuthStore();
  return useQuery({
    queryKey: ['tickets', computed(() => auth.user?.id)],
    enabled: () => !!auth.user,
    queryFn: async (): Promise<Ticket[]> => {
      const { data, error } = await supabase.from('bets').select(TICKET_SELECT).order('placed_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Ticket[]).map((t) => ({ ...t, selections: [...(t.selections ?? [])].sort((a, b) => a.position - b.position) }));
    },
  });
}

// Valor real del mercado de una selección (goles o córners totales), si la base ya lo tiene.
export function realTotal(sel: TicketSelection): number | null {
  const s = Array.isArray(sel.match?.match_stats) ? sel.match?.match_stats[0] : sel.match?.match_stats;
  if (!s) return null;
  const [h, a] = sel.market === 'goals_total' ? [s.home_goals_total, s.away_goals_total] : [s.home_corners_total, s.away_corners_total];
  return h === null || a === null ? null : h + a;
}

export function useBankroll() {
  const auth = useAuthStore();
  return useQuery({
    queryKey: ['bankroll', computed(() => auth.user?.id)],
    enabled: () => !!auth.user,
    queryFn: async (): Promise<BankrollSummary> => {
      const { data, error } = await supabase.rpc('get_bankroll_summary');
      if (error) throw error;
      return data as BankrollSummary;
    },
  });
}

// Historial completo de movimientos del bankroll (depósitos, retiros, importes apostados, retornos y devoluciones).
export function useLedger() {
  const auth = useAuthStore();
  return useQuery({
    queryKey: ['cash', 'ledger', computed(() => auth.user?.id)],
    enabled: () => !!auth.user,
    queryFn: async (): Promise<LedgerEntry[]> => {
      const { data, error } = await supabase
        .from('cash_movements')
        .select('id, type, amount, occurred_on, note, bet_id, created_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return data as LedgerEntry[];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['tickets'] }),
      qc.invalidateQueries({ queryKey: ['bankroll'] }),
      qc.invalidateQueries({ queryKey: ['cash'] }),
    ]);
}

// ───────── Escritura: siempre mediante las funciones de la base (transaccionales) ─────────
export interface PlaceTicketInput {
  selections: { match_id: number; pick_id: number | null; market: Market; line: number; side: 'over' | 'under'; odds: number; model_probability: number | null }[];
  stake: number;
  totalOdds: number | null; // null = producto de las cuotas individuales
  clientKey: string; // el mismo boleto reenviado no se duplica
  placedAt?: string;
}

export function usePlaceTicket() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (i: PlaceTicketInput): Promise<number> => {
      const { data, error } = await supabase.rpc('place_bet_ticket', {
        p_selections: i.selections,
        p_stake: i.stake,
        p_total_odds: i.totalOdds,
        p_client_key: i.clientKey,
        p_placed_at: i.placedAt ?? null,
      });
      if (error) throw new Error(error.message);
      return Number(data);
    },
    onSuccess: invalidate,
  });
}

export function useSettleTicket() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, result, payout }: { id: number; result: 'won' | 'lost' | 'void'; payout?: number | null }) => {
      const { error } = await supabase.rpc('settle_bet_ticket', { p_bet_id: id, p_result: result, p_payout: payout ?? null });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

// Marca el resultado de cada selección pendiente cuyo partido ya tiene datos en la base.
export function useApplyLegResults() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (ticket: Ticket): Promise<number> => {
      const results = ticket.selections
        .filter((s) => s.result === 'pending')
        .flatMap((s) => {
          const actual = realTotal(s);
          return actual === null ? [] : [{ selection_id: s.id, result: legResult(s.side, Number(s.line), actual), actual_value: actual }];
        });
      if (!results.length) return 0;
      const { error } = await supabase.rpc('set_selection_results', { p_bet_id: ticket.id, p_results: results });
      if (error) throw new Error(error.message);
      return results.length;
    },
    onSuccess: invalidate,
  });
}

export function useConfirmTicket() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.rpc('confirm_bet_ticket', { p_bet_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

// ───────── Apoyo para armar boletos ─────────
// Partidos recientes y próximos para elegir al añadir una selección a mano.
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
      return data as unknown as { id: number; kickoff_at: string; league: { name: string } | null; home: { name: string } | null; away: { name: string } | null }[];
    },
  });
}

// Pick del modelo (si existe) para una selección escrita a mano, con la probabilidad que daba a ese lado.
export async function modelProbabilityFor(matchId: number, market: Market, line: number, side: 'over' | 'under') {
  const { data } = await supabase
    .from('picks')
    .select('id, probability')
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

// ───────── Análisis y recomendaciones ─────────
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

export { uid };
