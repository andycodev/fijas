-- Fijas · resultado real de apuestas de goles (las de córners siguen usando actual_corners)
alter table public.bets
  add column actual_goals smallint check (actual_goals >= 0);
