-- Fijas · laboratorio del modelo: se retira de la base todo lo relacionado con la gestión de apuestas y dinero.
-- La app solo analiza, registra recomendaciones, espera resultados y mide el rendimiento del modelo. Las apuestas se hacen en Betano.
--
-- QUEDAN (no se tocan): ligas, equipos, partidos, estadísticas, picks, cuotas, analysis_runs, recommendations, automation_runs,
-- api_usage, api_cache y el perfil (criterios del modelo, ligas activas, límites de API).
-- SE ELIMINAN: bets, bet_selections, cash_movements, reconciliations, sus funciones, y las columnas de capital/riesgo del perfil.
--
-- Seguridad: si alguna de esas tablas tuviera registros, la migración se detiene SIN borrar nada, para no perder datos por accidente.
-- Idempotente: se puede ejecutar más de una vez.

-- ═════════════ 0. Protección ═════════════
do $$
declare t text; c bigint; n bigint := 0;
begin
  foreach t in array array['bet_selections', 'bets', 'cash_movements', 'reconciliations'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into c;
      n := n + c;
    end if;
  end loop;
  if n > 0 then
    raise exception 'Hay % registros de apuestas o caja. La migración se detuvo sin borrar nada: revísalos (o bórralos tú) y vuelve a ejecutarla.', n;
  end if;
end $$;

-- ═════════════ 1. Unidad teórica del laboratorio ═════════════
-- Escala fija con la que se calculan el ROI y el valor esperado acumulado en dinero. No es dinero real.
alter table public.profiles
  add column if not exists unit_value numeric(12,2) not null default 10 check (unit_value > 0);

-- ═════════════ 2. Perfil nuevo: ya no lleva capital ni límites ═════════════
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

-- ═════════════ 3. Funciones de apuestas y dinero ═════════════
drop function if exists public.place_bet_ticket(jsonb, numeric, numeric, text, timestamptz);
drop function if exists public.settle_bet_ticket(bigint, text, numeric);
drop function if exists public.set_selection_results(bigint, jsonb);
drop function if exists public.confirm_bet_ticket(bigint);
drop function if exists public.get_bankroll_summary();
drop function if exists public.bankroll_available(uuid);

-- ═════════════ 4. Tablas de apuestas y dinero ═════════════
drop table if exists public.bet_selections cascade;
drop table if exists public.cash_movements cascade;
drop table if exists public.reconciliations cascade;
drop table if exists public.bets cascade;

-- ═════════════ 5. Columnas de capital y riesgo del perfil ═════════════
alter table public.profiles
  drop column if exists initial_bankroll,
  drop column if exists stake_mode,
  drop column if exists stake_value,
  drop column if exists min_stake,
  drop column if exists daily_bet_limit,
  drop column if exists pause_level,
  drop column if exists daily_exposure_pct,
  drop column if exists monthly_loss_limit_pct,
  drop column if exists losing_streak_alert,
  drop column if exists bankroll_configured;
