-- Fijas · registro de ejecuciones automáticas (el robot de GitHub Actions y los comandos de terminal), para verlas en la app.
-- Idempotente. Solo escribe el servidor (service role); la app únicamente lee.

create table if not exists public.automation_runs (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('analyze', 'resolve')),         -- análisis completo / revisión de resultados
  source       text not null check (source in ('github', 'local', 'app')),   -- quién la lanzó
  user_id      uuid references auth.users (id) on delete cascade,            -- el análisis es por usuario; la revisión de resultados es general (null)
  status       text not null check (status in ('succeeded', 'failed')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz not null default now(),
  summary      jsonb,
  error        text
);
create index if not exists automation_runs_started_idx on public.automation_runs (started_at desc);
create index if not exists automation_runs_kind_idx on public.automation_runs (kind, started_at desc);

alter table public.automation_runs enable row level security;

-- Cada usuario ve las ejecuciones generales y las suyas.
drop policy if exists automation_runs_select on public.automation_runs;
create policy automation_runs_select on public.automation_runs for select to authenticated
  using (user_id is null or user_id = auth.uid());

-- La app no escribe aquí: solo el servidor.
revoke all on public.automation_runs from anon;
revoke insert, update, delete on public.automation_runs from authenticated;
