// Tipos de las tablas usadas por la app (nombres tal como están en Supabase).
export type Market = 'corners_total' | 'goals_total';

export interface Profile {
  user_id: string;
  initial_bankroll: number;
  stake_mode: 'percent' | 'fixed';
  stake_value: number;
  value_threshold: number; // fracción: 0.05 = 5 %
  daily_bet_limit: number;
  pause_level: number;
  active_league_ids: number[];
  active_markets: Market[];
}

export interface League {
  id: number;
  name: string;
  country: string;
  active: boolean;
}

export interface CashMovement {
  id: number;
  type: 'deposit' | 'withdrawal';
  amount: number;
  occurred_on: string;
  note: string | null;
}

export interface Reconciliation {
  id: number;
  betano_balance: number;
  calculated_balance: number;
  difference: number;
  checked_on: string;
}

export interface BetMoney {
  status: 'open' | 'closed' | 'confirmed' | 'void';
  stake: number;
  profit_loss: number | null;
}

export interface PickLine {
  line: number;
  projection: number;
  probability: number; // probabilidad de "más de" la línea
  min_odds: number; // cuota mínima para "más de"
  model_version: string;
}

export interface UpcomingMatch {
  id: number;
  kickoff_at: string;
  league: { name: string } | null;
  home: { name: string } | null;
  away: { name: string } | null;
  picks: PickLine[];
}

export interface ManualOdds {
  id: number;
  match_id: number;
  market: Market;
  line: number;
  over_odds: number | null;
  under_odds: number | null;
}
