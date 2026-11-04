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
  daily_exposure_pct: number;
  monthly_loss_limit_pct: number;
  losing_streak_alert: number;
  min_probability: number;
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
  id: number;
  market: Market;
  line: number;
  projection: number;
  probability: number; // probabilidad de "más de" la línea
  min_odds: number; // cuota mínima para "más de"
  model_version: string;
  home_games_used: number | null;
  away_games_used: number | null;
  latest_game_at: string | null;
}

export interface UpcomingMatch {
  id: number;
  home_team_id: number;
  away_team_id: number;
  kickoff_at: string;
  league: { name: string } | null;
  home: { name: string } | null;
  away: { name: string } | null;
  picks: PickLine[];
}

export interface OddsRow {
  id: number;
  match_id: number;
  market: Market;
  line: number;
  over_odds: number | null;
  under_odds: number | null;
  origin: 'auto' | 'manual'; // auto = Betano vía proveedor (sin verificar) · manual = escrita por el usuario
  captured_at: string;
}

export interface Bet {
  id: number;
  match_id: number;
  pick_id: number | null;
  market: Market;
  line: number;
  side: 'over' | 'under';
  accepted_odds: number;
  stake: number;
  status: 'open' | 'closed' | 'confirmed' | 'void';
  actual_corners: number | null;
  actual_goals: number | null;
  model_probability: number | null;
  result: 'won' | 'lost' | 'void' | null;
  profit_loss: number | null;
  placed_at: string;
  closed_at: string | null;
  match: {
    kickoff_at: string;
    status: string;
    league: { name: string } | null;
    home: { name: string } | null;
    away: { name: string } | null;
    match_stats: MatchStatsTotals | MatchStatsTotals[] | null;
  } | null;
}

export interface MatchStatsTotals {
  home_corners_total: number | null;
  away_corners_total: number | null;
  home_goals_total: number | null;
  away_goals_total: number | null;
}
