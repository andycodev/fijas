-- Fijas · RLS en las 12 tablas

-- Personales: cada usuario solo ve y modifica sus filas.
alter table public.profiles        enable row level security;
alter table public.bets            enable row level security;
alter table public.cash_movements  enable row level security;
alter table public.reconciliations enable row level security;

create policy profiles_own on public.profiles
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy bets_own on public.bets
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy cash_movements_own on public.cash_movements
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reconciliations_own on public.reconciliations
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Compartidas: lectura con sesión; escritura solo con la service role (que ignora RLS).
alter table public.leagues     enable row level security;
alter table public.teams       enable row level security;
alter table public.matches     enable row level security;
alter table public.match_stats enable row level security;
alter table public.picks       enable row level security;

create policy leagues_read     on public.leagues     for select to authenticated using (true);
create policy teams_read       on public.teams       for select to authenticated using (true);
create policy matches_read     on public.matches     for select to authenticated using (true);
create policy match_stats_read on public.match_stats for select to authenticated using (true);
create policy picks_read       on public.picks       for select to authenticated using (true);

-- odds: las automáticas (sin usuario) son compartidas; las manuales, personales.
alter table public.odds enable row level security;

create policy odds_read on public.odds
  for select to authenticated
  using (user_id is null or user_id = auth.uid());

create policy odds_manual_write on public.odds
  for all to authenticated
  using (origin = 'manual' and user_id = auth.uid())
  with check (origin = 'manual' and user_id = auth.uid());

-- Técnicas: RLS activo y sin políticas = nadie con sesión puede leer ni escribir.
alter table public.api_usage enable row level security;
alter table public.api_cache enable row level security;
