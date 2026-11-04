-- Fijas · datos iniciales: las 4 ligas
-- api_football_id confirmado en la prueba de viabilidad; football_data_code son los códigos de los CSV.
insert into public.leagues (name, country, api_football_id, football_data_code) values
  ('Premier League', 'England', 39,  'E0'),
  ('LaLiga',         'Spain',   140, 'SP1'),
  ('Serie A',        'Italy',   135, 'I1'),
  ('Bundesliga',     'Germany', 78,  'D1')
on conflict (name) do nothing;
