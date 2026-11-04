-- Fijas · esquema base (12 tablas)
-- Solo totales del partido. Mercados como texto con check: para sumar otro mercado (p. ej. ganadas) basta ampliar el check.

-- ───────── Personales ─────────
create table public.profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  initial_bankroll numeric(12,2) not null default 0 check (initial_bankroll >= 0),
  stake_mode       text not null default 'percent' check (stake_mode in ('percent', 'fixed')),
  stake_value      numeric(12,2) not null default 2 check (stake_value > 0),
  value_threshold  numeric(5,4) not null default 0.05,
  daily_bet_limit  smallint not null default 3 check (daily_bet_limit >= 0),
  pause_level      smallint not null default 0 check (pause_level >= 0),
  active_league_ids bigint[] not null default '{}',
  active_markets   text[] not null default array['corners_total'],
  created_at       timestamptz not null default now()
);

-- ───────── Compartidas ─────────
create table public.leagues (
  id                bigint generated always as identity primary key,
  name              text not null unique,
  country           text not null,
  api_football_id   integer unique,
  football_data_code text unique,
  active            boolean not null default true
);

create table public.teams (
  id                  bigint generated always as identity primary key,
  league_id           bigint not null references public.leagues (id),
  name                text not null,
  api_football_id     integer unique,
  football_data_name  text,
  aliases             text[] not null default '{}',
  unique (league_id, name)
);

create table public.matches (
  id               bigint generated always as identity primary key,
  league_id        bigint not null references public.leagues (id),
  season           smallint not null,                -- año de inicio, p. ej. 2025 = 2025-26
  kickoff_at       timestamptz not null,
  home_team_id     bigint not null references public.teams (id),
  away_team_id     bigint not null references public.teams (id),
  status           text not null default 'scheduled'
                   check (status in ('scheduled', 'live', 'finished', 'postponed', 'cancelled')),
  api_football_id  integer unique,
  check (home_team_id <> away_team_id),
  unique (league_id, season, home_team_id, away_team_id)
);
create index matches_kickoff_idx on public.matches (kickoff_at);
create index matches_home_idx on public.matches (home_team_id, kickoff_at desc);
create index matches_away_idx on public.matches (away_team_id, kickoff_at desc);

create table public.match_stats (
  match_id            bigint primary key references public.matches (id) on delete cascade,
  home_corners_total  smallint check (home_corners_total >= 0),
  away_corners_total  smallint check (away_corners_total >= 0),
  home_goals_total    smallint check (home_goals_total >= 0),
  away_goals_total    smallint check (away_goals_total >= 0),
  source              text not null check (source in ('football_data', 'api_football')),
  updated_at          timestamptz not null default now()
);

create table public.odds (
  id           bigint generated always as identity primary key,
  match_id     bigint not null references public.matches (id) on delete cascade,
  bookmaker    text not null default 'betano',
  market       text not null check (market in ('corners_total', 'goals_total')),
  line         numeric(4,1) not null,
  over_odds    numeric(6,2) check (over_odds > 1),
  under_odds   numeric(6,2) check (under_odds > 1),
  captured_at  timestamptz not null default now(),
  origin       text not null check (origin in ('auto', 'manual')),
  user_id      uuid references auth.users (id) on delete cascade,
  -- manual => lleva usuario; automática => no lleva
  check ((origin = 'manual') = (user_id is not null))
);
create index odds_match_idx on public.odds (match_id, market, line);

create table public.picks (
  id             bigint generated always as identity primary key,
  match_id       bigint not null references public.matches (id) on delete cascade,
  market         text not null check (market in ('corners_total', 'goals_total')),
  line           numeric(4,1) not null,
  projection     numeric(6,2) not null,
  probability    numeric(5,4) not null check (probability between 0 and 1),
  min_odds       numeric(6,2) not null,
  value          numeric(6,4),
  signal         text not null check (signal in ('green', 'yellow', 'red')),
  model_version  text not null,
  generated_at   timestamptz not null default now(),
  actual_result  numeric(6,1),
  hit            boolean,
  unique (match_id, market, line, model_version)
);

-- ───────── Personales (apuestas y caja) ─────────
create table public.bets (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  match_id       bigint not null references public.matches (id),
  pick_id        bigint references public.picks (id) on delete set null,
  market         text not null check (market in ('corners_total', 'goals_total')),
  line           numeric(4,1) not null,
  side           text not null check (side in ('over', 'under')),
  accepted_odds  numeric(6,2) not null check (accepted_odds > 1),
  stake          numeric(12,2) not null check (stake > 0),
  status         text not null default 'open' check (status in ('open', 'closed', 'confirmed', 'void')),
  actual_corners smallint check (actual_corners >= 0),
  result         text check (result in ('won', 'lost', 'void')),
  profit_loss    numeric(12,2),
  placed_at      timestamptz not null default now(),
  closed_at      timestamptz
);
create index bets_user_idx on public.bets (user_id, placed_at desc);

create table public.cash_movements (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  type         text not null check (type in ('deposit', 'withdrawal')),
  amount       numeric(12,2) not null check (amount > 0),
  occurred_on  date not null default current_date,
  note         text
);
create index cash_movements_user_idx on public.cash_movements (user_id, occurred_on desc);

create table public.reconciliations (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  betano_balance     numeric(12,2) not null,
  calculated_balance numeric(12,2) not null,
  difference         numeric(12,2) generated always as (betano_balance - calculated_balance) stored,
  checked_on         date not null default current_date
);
create index reconciliations_user_idx on public.reconciliations (user_id, checked_on desc);

-- ───────── Técnicas (solo servidor) ─────────
create table public.api_usage (
  id             bigint generated always as identity primary key,
  provider       text not null,
  day            date not null,
  requests_used  integer not null default 0 check (requests_used >= 0),
  unique (provider, day)
);

create table public.api_cache (
  id         bigint generated always as identity primary key,
  provider   text not null,
  query_key  text not null,
  response   jsonb not null,
  fetched_at timestamptz not null default now(),
  unique (provider, query_key)
);

-- Perfil automático al registrarse un usuario
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
