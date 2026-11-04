-- Fijas · filtro de probabilidad, transparencia de datos y estadísticas para explicar cada pick

-- Probabilidad mínima para recomendar (por defecto 75 %; el usuario la cambia en la app)
alter table public.profiles
  add column min_probability numeric(4,3) not null default 0.750 check (min_probability between 0.5 and 0.99);

-- Datos con los que se calculó cada pick: partidos usados por equipo y fecha del partido más reciente
alter table public.picks
  add column home_games_used smallint check (home_games_used >= 0),
  add column away_games_used smallint check (away_games_used >= 0),
  add column latest_game_at  timestamptz;

-- Remates y xG de Football-Data (remates desde 2022-23; xG solo en la temporada actual).
-- Lo que la fuente no trae queda en null: no se inventa.
alter table public.match_stats
  add column home_shots           smallint check (home_shots >= 0),
  add column away_shots           smallint check (away_shots >= 0),
  add column home_shots_on_target smallint check (home_shots_on_target >= 0),
  add column away_shots_on_target smallint check (away_shots_on_target >= 0),
  add column home_xg              numeric(4,2) check (home_xg >= 0),
  add column away_xg              numeric(4,2) check (away_xg >= 0);
