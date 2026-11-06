// Tipos de las tablas usadas por la app (nombres tal como están en Supabase).
export type Market = 'corners_total' | 'goals_total';

export interface Profile {
  user_id: string;
  value_threshold: number; // fracción: 0.05 = 5 %
  active_league_ids: number[];
  active_markets: Market[];
  min_probability: number;
  unit_value: number; // unidad teórica con la que el laboratorio calcula ROI y EV en dinero (no hay dinero real en juego)
  currency: string;
  favorite_league_ids: number[];
  api_daily_cap: number;
  refresh_interval_minutes: number;
  api_reset_hour_utc: number;
  last_refresh_at: string | null;
}

export interface League {
  id: number;
  name: string;
  country: string;
  active: boolean;
  api_football_id: number | null;
  football_data_code: string | null;
  kind: 'league' | 'cup' | null;
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
  league_id: number;
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

// ───────── Análisis y recomendaciones ─────────
export interface AnalysisRun {
  id: number;
  status: 'running' | 'succeeded' | 'failed';
  trigger: 'manual' | 'forced';
  started_at: string;
  finished_at: string | null;
  api_used_before: number | null;
  api_used_after: number | null;
  error: string | null;
}

export interface RecommendationRationale {
  model_version: string | null;
  projection: number;
  fair_odds: number;
  games_home: number | null;
  games_away: number | null;
  latest_game_at: string | null;
  min_probability: number;
  value_threshold: number;
  odds_captured_at: string | null;
  summary: string;
  factors: { title: string; detail: string; direction: string }[];
  unavailable: string[];
}

export interface RecommendationRow {
  id: number;
  pick_id: number;
  match_id: number;
  market: Market;
  line: number;
  side: 'over' | 'under';
  model_probability: number;
  odds: number;
  ev: number;
  odds_origin: 'auto' | 'manual' | null;
  created_at: string;
  result: 'pending' | 'won' | 'lost' | 'void';
  actual_value: number | null;
  settled_at: string | null;
  category: 'main' | 'low_value'; // principal o de estudio (valor entre 0 y el umbral)
  league_id: number | null;
  kickoff_at: string | null; // fecha del partido tal como se recomendó
  rationale: RecommendationRationale | null; // justificación congelada
  resolution_note: string | null;
  match: { kickoff_at: string; status: string; league: { name: string } | null; home: { name: string } | null; away: { name: string } | null } | null;
}
