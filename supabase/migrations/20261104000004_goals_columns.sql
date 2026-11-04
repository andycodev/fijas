-- Fijas · goles totales del partido en match_stats (aditivo)
alter table public.match_stats
  add column home_goals_total smallint check (home_goals_total >= 0),
  add column away_goals_total smallint check (away_goals_total >= 0);
