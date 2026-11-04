-- Fijas · gestión de ligas y consumo real de la API

-- Consumo real informado por el proveedor (API-Football): se guarda tras cada llamada y al consultar /status.
alter table public.api_usage
  add column daily_limit      integer,       -- límite diario (limit_day / x-ratelimit-requests-limit)
  add column remaining        integer,       -- restantes según el proveedor
  add column last_request_at  timestamptz,   -- última consulta realizada
  add column last_status      text,          -- ok | rate_limited | error | unreachable
  add column reset_observed_at timestamptz,  -- último momento en que se observó que el contador se reiniciaba
  add column plan_name        text,          -- plan informado por el proveedor
  add column plan_end         timestamptz;   -- fin de la suscripción informado por el proveedor

-- El consumo no es secreto: lo puede leer cualquier usuario con sesión (solo el servidor escribe).
create policy api_usage_read on public.api_usage for select to authenticated using (true);

-- Preferencias personales
alter table public.profiles
  add column favorite_league_ids      bigint[]     not null default '{}',
  add column api_daily_cap            smallint     not null default 90  check (api_daily_cap between 10 and 100),   -- tope propio de solicitudes por día
  add column refresh_interval_minutes smallint     not null default 60  check (refresh_interval_minutes between 5 and 1440),
  add column api_reset_hour_utc       smallint     not null default 0   check (api_reset_hour_utc between 0 and 23), -- ESTIMACIÓN: la API no informa la hora de reinicio
  add column last_refresh_at          timestamptz;

-- Tipo de competición (liga o copa) tal como la clasifica el proveedor
alter table public.leagues add column kind text check (kind in ('league', 'cup'));

-- Los perfiles existentes empiezan con todas las ligas actuales activas.
update public.profiles
set active_league_ids = coalesce((select array_agg(id) from public.leagues), '{}')
where cardinality(active_league_ids) = 0;
