-- Fijas · goles en match_stats (aditivo; el 2.º tiempo = total - 1.er tiempo)
alter table public.match_stats
  add column home_goals_1h    smallint check (home_goals_1h >= 0),
  add column away_goals_1h    smallint check (away_goals_1h >= 0),
  add column home_goals_total smallint check (home_goals_total >= 0),
  add column away_goals_total smallint check (away_goals_total >= 0);
