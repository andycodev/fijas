-- Fijas · evaluación del modelo: cada recomendación queda congelada tal como se generó y se resuelve sola contra el resultado real.
-- Idempotente. Reutiliza public.recommendations (creada en la migración anterior); no crea tablas nuevas.

-- ═════════════ 1. Datos que la recomendación conserva ═════════════
alter table public.recommendations
  add column if not exists league_id        bigint references public.leagues (id),
  add column if not exists kickoff_at       timestamptz,   -- fecha del partido TAL COMO se recomendó (si se aplaza, aquí no cambia)
  add column if not exists rationale        jsonb,          -- justificación generada en ese momento (se guarda congelada)
  add column if not exists resolution_note  text;           -- por qué se anuló, o con qué dato se resolvió

-- Las recomendaciones ya registradas toman liga y fecha de su partido.
update public.recommendations r
set league_id = m.league_id, kickoff_at = m.kickoff_at
from public.matches m
where m.id = r.match_id and (r.league_id is null or r.kickoff_at is null);

-- Estado «cancelada» (anulada): partido cancelado o sin resultado definitivo; no cuenta como acierto ni fallo.
alter table public.recommendations drop constraint if exists recommendations_result_check;
alter table public.recommendations add constraint recommendations_result_check
  check (result in ('pending', 'won', 'lost', 'void'));

-- Cuándo se consultó por última vez el resultado de un partido (evita gastar solicitudes de API de más).
alter table public.matches add column if not exists result_checked_at timestamptz;

-- ═════════════ 2. La predicción no se puede reescribir ═════════════
-- Una vez guardada, solo se pueden completar el resultado y la fecha de resolución.
create or replace function public.recommendations_frozen() returns trigger
language plpgsql as $fn$
begin
  if (new.user_id, new.run_id, new.pick_id, new.match_id, new.market, new.line, new.side, new.model_probability, new.odds, new.ev, new.odds_origin, new.created_at)
     is distinct from
     (old.user_id, old.run_id, old.pick_id, old.match_id, old.market, old.line, old.side, old.model_probability, old.odds, old.ev, old.odds_origin, old.created_at)
     -- liga, fecha y justificación solo se pueden rellenar si estaban vacías (recomendaciones antiguas)
     or (old.league_id is not null and new.league_id is distinct from old.league_id)
     or (old.kickoff_at is not null and new.kickoff_at is distinct from old.kickoff_at)
     or (old.rationale is not null and new.rationale is distinct from old.rationale)
  then
    raise exception 'Una recomendación ya registrada no se puede modificar';
  end if;
  if old.result <> 'pending' and (new.result, new.actual_value) is distinct from (old.result, old.actual_value) then
    raise exception 'Una recomendación ya resuelta no se puede cambiar';
  end if;
  return new;
end $fn$;

drop trigger if exists recommendations_frozen on public.recommendations;
create trigger recommendations_frozen before update on public.recommendations
  for each row execute function public.recommendations_frozen();

-- ═════════════ 3. Resolución contra el resultado real (no se vuelve a ejecutar el modelo) ═════════════
-- · Ganada/perdida: compara la selección ORIGINAL (lado y línea) con el total real del partido (90 min).
-- · Cancelada: el partido se canceló, o sigue sin resultado definitivo 7 días después de la fecha original.
-- · Un partido aplazado que se juega después se resuelve con su resultado cuando exista.
create or replace function public.settle_recommendations() returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer := 0; v_k integer;
begin
  update public.recommendations r
  set result = case when (r.side = 'over' and p.actual_result > r.line) or (r.side = 'under' and p.actual_result < r.line)
                    then 'won' else 'lost' end,
      actual_value = p.actual_result, settled_at = now(),
      resolution_note = 'Resultado real del partido'
  from public.picks p
  where p.id = r.pick_id and r.result = 'pending' and p.actual_result is not null;
  get diagnostics v_n = row_count;

  update public.recommendations r
  set result = 'void', settled_at = now(),
      resolution_note = case m.status when 'cancelled' then 'Partido cancelado' else 'Sin resultado definitivo 7 días después del partido' end
  from public.matches m
  where m.id = r.match_id and r.result = 'pending'
    and (m.status = 'cancelled'
         or (m.status in ('postponed', 'scheduled', 'live') and coalesce(r.kickoff_at, m.kickoff_at) < now() - interval '7 days'));
  get diagnostics v_k = row_count;

  return v_n + v_k;
end $$;

revoke all on function public.settle_recommendations() from public, anon, authenticated;
grant execute on function public.settle_recommendations() to service_role;

-- Anula una recomendación concreta con un motivo (la usa el servidor, p. ej. córners de un partido con tiempo extra).
create or replace function public.void_recommendations(p_match_id bigint, p_market text, p_note text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update public.recommendations
  set result = 'void', settled_at = now(), resolution_note = p_note
  where match_id = p_match_id and market = p_market and result = 'pending';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.void_recommendations(bigint, text, text) from public, anon, authenticated;
grant execute on function public.void_recommendations(bigint, text, text) to service_role;

create index if not exists recommendations_pending_idx on public.recommendations (match_id) where result = 'pending';
