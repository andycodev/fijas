-- Fijas · categoría de la recomendación: principal (valor ≥ umbral) o de estudio (valor entre 0 y el umbral).
-- Las de estudio se registran y se evalúan igual (mismo proceso automático), pero se miden por separado y no se muestran
-- como recomendaciones principales. Idempotente.

alter table public.recommendations
  add column if not exists category text not null default 'main' check (category in ('main', 'low_value'));

-- Lo ya registrado era siempre principal (antes solo se guardaba lo que superaba el umbral).
-- La categoría queda congelada como el resto de la predicción.
create or replace function public.recommendations_frozen() returns trigger
language plpgsql as $fn$
begin
  if (new.user_id, new.run_id, new.pick_id, new.match_id, new.market, new.line, new.side, new.model_probability, new.odds, new.ev, new.odds_origin, new.created_at, new.category)
     is distinct from
     (old.user_id, old.run_id, old.pick_id, old.match_id, old.market, old.line, old.side, old.model_probability, old.odds, old.ev, old.odds_origin, old.created_at, old.category)
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

create index if not exists recommendations_category_idx on public.recommendations (user_id, category);
