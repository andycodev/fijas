-- Fijas · boletos simples y combinados, bankroll como libro de movimientos, ejecuciones de análisis y recomendaciones.
-- Es idempotente: se puede ejecutar más de una vez sin duplicar registros ni pisar tus ajustes.
--
-- Reutiliza lo existente:
--   bets            → ahora es el BOLETO (importe, cuota total, estado, retorno).
--   cash_movements  → ahora es el LIBRO de movimientos del bankroll (depósitos, retiros, importe apostado, retornos).
--   profiles        → guarda capital inicial, unidad fija y apuesta mínima.
-- Tablas nuevas, solo donde faltaba algo: bet_selections, analysis_runs, recommendations.

-- ═════════════ 1. Configuración del bankroll ═════════════
alter table public.profiles
  add column if not exists min_stake            numeric(12,2) not null default 10 check (min_stake > 0),
  add column if not exists currency             text          not null default 'PEN',
  add column if not exists bankroll_configured  boolean       not null default false;

-- Valores por defecto de los perfiles nuevos: capital S/ 300 y unidad fija de S/ 10.
alter table public.profiles alter column initial_bankroll set default 300;
alter table public.profiles alter column stake_mode set default 'fixed';
alter table public.profiles alter column stake_value set default 10;

-- Inicialización: una sola vez por perfil (el marcador evita repetirla y pisar cambios posteriores).
update public.profiles
set initial_bankroll = 300, stake_mode = 'fixed', stake_value = 10, min_stake = 10, currency = 'PEN',
    bankroll_configured = true
where not bankroll_configured;

-- Los perfiles que se creen desde ahora nacen ya configurados.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, bankroll_configured) values (new.id, true)
  on conflict (user_id) do nothing;
  return new;
end $$;

-- ═════════════ 2. Boletos (bets) ═════════════
alter table public.bets
  add column if not exists kind          text not null default 'single' check (kind in ('single', 'combo')),
  add column if not exists bookmaker     text not null default 'betano',
  add column if not exists computed_odds numeric(10,2),                  -- producto de las cuotas individuales
  add column if not exists odds_edited   boolean not null default false, -- true si se escribió la cuota real de la casa
  add column if not exists payout        numeric(12,2) check (payout >= 0), -- retorno total cobrado (0 si se pierde)
  add column if not exists settled_at    timestamptz,
  add column if not exists client_key    text;                           -- evita registrar dos veces el mismo boleto

-- La cuota total de una combinada puede superar el límite anterior.
alter table public.bets alter column accepted_odds type numeric(10,2);

-- Los datos de selección pasan a bet_selections; las columnas antiguas quedan como histórico.
alter table public.bets alter column match_id drop not null;
alter table public.bets alter column market   drop not null;
alter table public.bets alter column line     drop not null;
alter table public.bets alter column side     drop not null;

create unique index if not exists bets_client_key_uq on public.bets (user_id, client_key) where client_key is not null;

-- ═════════════ 3. Selecciones de cada boleto ═════════════
create table if not exists public.bet_selections (
  id                bigint generated always as identity primary key,
  bet_id            bigint not null references public.bets (id) on delete cascade,
  user_id           uuid   not null references auth.users (id) on delete cascade,
  position          smallint not null check (position > 0),
  match_id          bigint not null references public.matches (id),
  pick_id           bigint references public.picks (id) on delete set null, -- pick original del modelo
  market            text not null check (market in ('corners_total', 'goals_total')),
  line              numeric(4,1) not null,
  side              text not null check (side in ('over', 'under')),
  odds              numeric(6,2) not null check (odds > 1),
  model_probability numeric(5,4) check (model_probability > 0 and model_probability < 1),
  actual_value      smallint check (actual_value >= 0),
  result            text not null default 'pending' check (result in ('pending', 'won', 'lost', 'void')),
  settled_at        timestamptz,
  unique (bet_id, position)
);
create index if not exists bet_selections_bet_idx   on public.bet_selections (bet_id);
create index if not exists bet_selections_user_idx  on public.bet_selections (user_id);
create index if not exists bet_selections_match_idx on public.bet_selections (match_id);

-- Los boletos anteriores (una selección por fila) pasan a tener su selección.
insert into public.bet_selections
  (bet_id, user_id, position, match_id, pick_id, market, line, side, odds, model_probability, actual_value, result, settled_at)
select b.id, b.user_id, 1, b.match_id, b.pick_id, b.market, b.line, b.side, b.accepted_odds, b.model_probability,
       case when b.market = 'goals_total' then b.actual_goals else b.actual_corners end,
       case b.result when 'won' then 'won' when 'lost' then 'lost' when 'void' then 'void' else 'pending' end,
       b.closed_at
from public.bets b
where b.match_id is not null
  and not exists (select 1 from public.bet_selections s where s.bet_id = b.id);

-- ═════════════ 4. Libro de movimientos del bankroll (cash_movements) ═════════════
alter table public.cash_movements
  add column if not exists bet_id     bigint references public.bets (id) on delete cascade,
  add column if not exists created_at timestamptz not null default now();

alter table public.cash_movements drop constraint if exists cash_movements_type_check;
alter table public.cash_movements add constraint cash_movements_type_check
  check (type in ('deposit', 'withdrawal', 'stake', 'payout', 'refund'));

-- Los movimientos de apuesta siempre pertenecen a un boleto; los depósitos y retiros, a ninguno.
alter table public.cash_movements drop constraint if exists cash_movements_bet_coherence;
alter table public.cash_movements add constraint cash_movements_bet_coherence
  check ((type in ('stake', 'payout', 'refund')) = (bet_id is not null));

-- Un boleto solo puede tener un descuento, un cobro y una devolución: imposible duplicar movimientos.
create unique index if not exists cash_movements_bet_type_uq on public.cash_movements (bet_id, type) where bet_id is not null;

-- Liquidación de los boletos anteriores (retorno y fecha).
update public.bets
set settled_at = coalesce(closed_at, placed_at),
    payout = case when result = 'won' then stake + coalesce(profit_loss, 0) when result = 'void' then stake else 0 end
where status in ('closed', 'confirmed', 'void') and payout is null;

-- Libro de los boletos anteriores: importe apostado, y retorno o devolución si ya se liquidaron.
insert into public.cash_movements (user_id, type, amount, occurred_on, note, bet_id, created_at)
select b.user_id, 'stake', b.stake, b.placed_at::date, 'Boleto #' || b.id, b.id, b.placed_at
from public.bets b
on conflict (bet_id, type) where bet_id is not null do nothing;

insert into public.cash_movements (user_id, type, amount, occurred_on, note, bet_id, created_at)
select b.user_id, 'payout', b.payout, coalesce(b.settled_at, b.placed_at)::date, 'Retorno boleto #' || b.id, b.id, coalesce(b.settled_at, b.placed_at)
from public.bets b where b.result = 'won' and b.payout > 0
on conflict (bet_id, type) where bet_id is not null do nothing;

insert into public.cash_movements (user_id, type, amount, occurred_on, note, bet_id, created_at)
select b.user_id, 'refund', b.stake, coalesce(b.settled_at, b.placed_at)::date, 'Devolución boleto #' || b.id, b.id, coalesce(b.settled_at, b.placed_at)
from public.bets b where b.result = 'void'
on conflict (bet_id, type) where bet_id is not null do nothing;

-- ═════════════ 5. Ejecuciones del análisis ═════════════
create table if not exists public.analysis_runs (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  status           text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  trigger          text not null default 'manual'  check (trigger in ('manual', 'forced')),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  api_used_before  integer,   -- consumo real del proveedor al empezar
  api_used_after   integer,   -- y al terminar
  summary          jsonb,
  error            text,
  check ((status = 'running') = (finished_at is null))
);
create index if not exists analysis_runs_user_idx on public.analysis_runs (user_id, started_at desc);
-- Solo puede haber un análisis en curso por usuario: bloquea ejecuciones simultáneas.
create unique index if not exists analysis_runs_one_running on public.analysis_runs (user_id) where status = 'running';

-- ═════════════ 6. Recomendaciones generadas (para evaluar al modelo) ═════════════
create table if not exists public.recommendations (
  id                bigint generated always as identity primary key,
  user_id           uuid   not null references auth.users (id) on delete cascade,
  run_id            bigint references public.analysis_runs (id) on delete set null,
  pick_id           bigint not null references public.picks (id) on delete cascade,
  match_id          bigint not null references public.matches (id),
  market            text   not null check (market in ('corners_total', 'goals_total')),
  line              numeric(4,1) not null,
  side              text   not null check (side in ('over', 'under')),
  model_probability numeric(5,4) not null check (model_probability > 0 and model_probability < 1),
  odds              numeric(6,2) not null check (odds > 1),
  ev                numeric(8,4) not null,
  odds_origin       text check (odds_origin in ('auto', 'manual')),
  created_at        timestamptz not null default now(),
  result            text not null default 'pending' check (result in ('pending', 'won', 'lost')),
  actual_value      smallint,
  settled_at        timestamptz,
  unique (user_id, pick_id, side) -- la misma recomendación no se cuenta dos veces
);
create index if not exists recommendations_user_idx on public.recommendations (user_id, created_at desc);

-- ═════════════ 7. Funciones (toda la lógica de dinero, en una transacción) ═════════════

-- Saldo disponible = capital inicial + depósitos + retornos + devoluciones − retiros − importes apostados.
create or replace function public.bankroll_available(p_user uuid) returns numeric
language sql stable set search_path = public as $$
  select coalesce((select initial_bankroll from public.profiles where user_id = p_user), 0)
       + coalesce((select sum(case type when 'withdrawal' then -amount when 'stake' then -amount else amount end)
                   from public.cash_movements where user_id = p_user), 0)
$$;

-- Resumen del bankroll del usuario con sesión. Se ejecuta con permisos del dueño pero SIEMPRE filtra por auth.uid().
create or replace function public.get_bankroll_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_initial numeric; v_available numeric;
  v_staked numeric; v_committed numeric; v_gains numeric; v_losses numeric; v_settled_stake numeric;
  v_deposits numeric; v_withdrawals numeric; v_payouts numeric;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select initial_bankroll into v_initial from public.profiles where user_id = v_uid;
  v_available := public.bankroll_available(v_uid);

  select coalesce(sum(amount) filter (where type = 'deposit'), 0),
         coalesce(sum(amount) filter (where type = 'withdrawal'), 0),
         coalesce(sum(amount) filter (where type = 'payout'), 0)
    into v_deposits, v_withdrawals, v_payouts
    from public.cash_movements where user_id = v_uid;

  select coalesce(sum(stake) filter (where status <> 'void'), 0),
         coalesce(sum(stake) filter (where status = 'open'), 0),
         coalesce(sum(profit_loss) filter (where status in ('closed', 'confirmed') and profit_loss > 0), 0),
         coalesce(-sum(profit_loss) filter (where status in ('closed', 'confirmed') and profit_loss < 0), 0),
         coalesce(sum(stake) filter (where status in ('closed', 'confirmed')), 0)
    into v_staked, v_committed, v_gains, v_losses, v_settled_stake
    from public.bets where user_id = v_uid;

  return jsonb_build_object(
    'initial', v_initial,
    'available', v_available,                       -- lo que puedes usar ahora
    'committed', v_committed,                       -- apostado en boletos pendientes (ya descontado del disponible)
    'equity', v_available + v_committed,            -- disponible + comprometido
    'deposits', v_deposits, 'withdrawals', v_withdrawals,
    'total_staked', v_staked,                       -- dinero apostado (boletos no anulados)
    'total_returned', v_payouts,                    -- retorno cobrado (incluye el importe apostado)
    'gains', v_gains, 'losses', v_losses,
    'net', v_gains - v_losses,                      -- ganancia neta de boletos liquidados
    'roi', case when v_settled_stake > 0 then round((v_gains - v_losses) / v_settled_stake * 100, 2) end
  );
end $$;

-- Registra un boleto (simple o combinado): valida, descuenta el importe UNA sola vez y guarda sus selecciones.
create or replace function public.place_bet_ticket(
  p_selections jsonb, p_stake numeric, p_total_odds numeric default null,
  p_client_key text default null, p_placed_at timestamptz default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_min numeric; v_available numeric; v_n int; v_id bigint;
  v_computed numeric := 1; v_total numeric; v_placed timestamptz := coalesce(p_placed_at, now());
  s jsonb; i int := 0;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  -- Reintento del mismo boleto: devuelve el existente en lugar de duplicar.
  if p_client_key is not null then
    select id into v_id from public.bets where user_id = v_uid and client_key = p_client_key;
    if found then return v_id; end if;
  end if;

  -- Serializa las operaciones del usuario: dos boletos a la vez no pueden gastar el mismo saldo.
  select min_stake into v_min from public.profiles where user_id = v_uid for update;
  if not found then raise exception 'Perfil no encontrado'; end if;

  if p_selections is null or jsonb_typeof(p_selections) <> 'array' then raise exception 'Selecciones inválidas'; end if;
  v_n := jsonb_array_length(p_selections);
  if v_n < 1 then raise exception 'Un boleto necesita al menos una selección'; end if;
  if v_n > 12 then raise exception 'Un boleto admite como máximo 12 selecciones'; end if;

  if p_stake is null or p_stake < v_min then raise exception 'El importe mínimo es %', v_min; end if;
  v_available := public.bankroll_available(v_uid);
  if p_stake > v_available then raise exception 'Saldo insuficiente: disponible %, importe %', v_available, p_stake; end if;
  if v_placed > now() + interval '5 minutes' then raise exception 'La fecha del boleto no puede ser futura'; end if;

  -- Valida cada selección y calcula la cuota combinada.
  for s in select * from jsonb_array_elements(p_selections) loop
    i := i + 1;
    if not exists (select 1 from public.matches where id = (s->>'match_id')::bigint) then raise exception 'La selección % apunta a un partido inexistente', i; end if;
    if (s->>'market') not in ('corners_total', 'goals_total') then raise exception 'Mercado inválido en la selección %', i; end if;
    if (s->>'side') not in ('over', 'under') then raise exception 'Lado inválido en la selección %', i; end if;
    if (s->>'line') is null or (s->>'odds') is null or (s->>'odds')::numeric <= 1 then raise exception 'Cuota o línea inválida en la selección %', i; end if;
    if (s->>'pick_id') is not null and not exists (select 1 from public.picks where id = (s->>'pick_id')::bigint) then raise exception 'Pick inexistente en la selección %', i; end if;
    if (select count(*) from jsonb_array_elements(p_selections) t
        where t->>'match_id' = s->>'match_id' and t->>'market' = s->>'market' and t->>'line' = s->>'line' and t->>'side' = s->>'side') > 1
    then raise exception 'Selección repetida en el boleto'; end if;
    v_computed := v_computed * (s->>'odds')::numeric;
  end loop;

  v_total := coalesce(p_total_odds, round(v_computed, 2));
  if v_total <= 1 then raise exception 'La cuota total debe ser mayor que 1'; end if;

  insert into public.bets (user_id, kind, bookmaker, accepted_odds, computed_odds, odds_edited, stake, status, placed_at, client_key)
  values (v_uid, case when v_n = 1 then 'single' else 'combo' end, 'betano', v_total, round(v_computed, 2),
          abs(v_total - round(v_computed, 2)) > 0.004, p_stake, 'open', v_placed, p_client_key)
  returning id into v_id;

  i := 0;
  for s in select * from jsonb_array_elements(p_selections) loop
    i := i + 1;
    insert into public.bet_selections (bet_id, user_id, position, match_id, pick_id, market, line, side, odds, model_probability)
    values (v_id, v_uid, i, (s->>'match_id')::bigint, nullif(s->>'pick_id', '')::bigint, s->>'market', (s->>'line')::numeric,
            s->>'side', (s->>'odds')::numeric, nullif(s->>'model_probability', '')::numeric);
  end loop;

  insert into public.cash_movements (user_id, type, amount, occurred_on, note, bet_id)
  values (v_uid, 'stake', p_stake, v_placed::date, 'Boleto #' || v_id, v_id);

  return v_id;
end $$;

-- Liquida un boleto pendiente: ganado (cobra el retorno total), perdido (queda la pérdida) o anulado (devuelve el importe).
create or replace function public.settle_bet_ticket(p_bet_id bigint, p_result text, p_payout numeric default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b public.bets%rowtype;
  v_payout numeric;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_result not in ('won', 'lost', 'void') then raise exception 'Resultado inválido: %', p_result; end if;

  select * into b from public.bets where id = p_bet_id and user_id = v_uid for update;
  if not found then raise exception 'Boleto no encontrado'; end if;
  if b.status <> 'open' then raise exception 'El boleto ya está liquidado'; end if;

  if p_result = 'won' then
    v_payout := coalesce(p_payout, round(b.stake * b.accepted_odds, 2));
    if v_payout < b.stake then raise exception 'Un boleto ganado debe devolver al menos el importe apostado'; end if;
  elsif p_result = 'void' then
    v_payout := b.stake;
  else
    v_payout := 0;
  end if;

  update public.bets
  set status = case when p_result = 'void' then 'void' else 'closed' end,
      result = p_result, payout = v_payout, profit_loss = v_payout - b.stake,
      closed_at = now(), settled_at = now()
  where id = b.id;

  if p_result = 'won' then
    insert into public.cash_movements (user_id, type, amount, occurred_on, note, bet_id)
    values (v_uid, 'payout', v_payout, current_date, 'Retorno boleto #' || b.id, b.id);
  elsif p_result = 'void' then
    insert into public.cash_movements (user_id, type, amount, occurred_on, note, bet_id)
    values (v_uid, 'refund', b.stake, current_date, 'Devolución boleto #' || b.id, b.id);
  end if;
end $$;

-- Marca el resultado de cada selección (acierto individual). Solo pasa de pendiente a un resultado final.
create or replace function public.set_selection_results(p_bet_id bigint, p_results jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r jsonb; v_current text; v_new text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from public.bets where id = p_bet_id and user_id = v_uid) then raise exception 'Boleto no encontrado'; end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array' then raise exception 'Resultados inválidos'; end if;

  for r in select * from jsonb_array_elements(p_results) loop
    v_new := r->>'result';
    if v_new not in ('won', 'lost', 'void') then raise exception 'Resultado de selección inválido: %', v_new; end if;
    select result into v_current from public.bet_selections
      where id = (r->>'selection_id')::bigint and bet_id = p_bet_id and user_id = v_uid for update;
    if not found then raise exception 'Selección no encontrada en este boleto'; end if;
    if v_current <> 'pending' and v_current <> v_new then raise exception 'La selección ya tiene un resultado distinto'; end if;
    update public.bet_selections
    set result = v_new, actual_value = nullif(r->>'actual_value', '')::smallint, settled_at = coalesce(settled_at, now())
    where id = (r->>'selection_id')::bigint;
  end loop;
end $$;

-- Confirma que un boleto cerrado coincide con lo que muestra Betano.
create or replace function public.confirm_bet_ticket(p_bet_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  update public.bets set status = 'confirmed' where id = p_bet_id and user_id = auth.uid() and status = 'closed';
  if not found then raise exception 'Solo se puede confirmar un boleto cerrado'; end if;
end $$;

-- Cierra las recomendaciones cuyos partidos ya terminaron (la llama el servidor tras actualizar resultados).
create or replace function public.settle_recommendations() returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update public.recommendations r
  set result = case when (r.side = 'over' and p.actual_result > r.line) or (r.side = 'under' and p.actual_result < r.line)
                    then 'won' else 'lost' end,
      actual_value = p.actual_result, settled_at = now()
  from public.picks p
  where p.id = r.pick_id and r.result = 'pending' and p.actual_result is not null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ═════════════ 8. Permisos y RLS ═════════════
-- La app ya no escribe boletos ni movimientos de apuesta directamente: solo mediante las funciones de arriba.
alter table public.bet_selections enable row level security;
alter table public.analysis_runs  enable row level security;
alter table public.recommendations enable row level security;

drop policy if exists bets_own on public.bets;
drop policy if exists bets_select_own on public.bets;
create policy bets_select_own on public.bets for select to authenticated using (user_id = auth.uid());

drop policy if exists bet_selections_select_own on public.bet_selections;
create policy bet_selections_select_own on public.bet_selections for select to authenticated using (user_id = auth.uid());

drop policy if exists analysis_runs_select_own on public.analysis_runs;
create policy analysis_runs_select_own on public.analysis_runs for select to authenticated using (user_id = auth.uid());

drop policy if exists recommendations_select_own on public.recommendations;
create policy recommendations_select_own on public.recommendations for select to authenticated using (user_id = auth.uid());

-- Libro de movimientos: lectura propia; el usuario solo crea y borra depósitos y retiros.
drop policy if exists cash_movements_own on public.cash_movements;
drop policy if exists cash_movements_select_own on public.cash_movements;
drop policy if exists cash_movements_insert_own on public.cash_movements;
drop policy if exists cash_movements_update_own on public.cash_movements;
drop policy if exists cash_movements_delete_own on public.cash_movements;
create policy cash_movements_select_own on public.cash_movements for select to authenticated using (user_id = auth.uid());
create policy cash_movements_insert_own on public.cash_movements for insert to authenticated
  with check (user_id = auth.uid() and type in ('deposit', 'withdrawal') and bet_id is null);
create policy cash_movements_update_own on public.cash_movements for update to authenticated
  using (user_id = auth.uid() and type in ('deposit', 'withdrawal'))
  with check (user_id = auth.uid() and type in ('deposit', 'withdrawal') and bet_id is null);
create policy cash_movements_delete_own on public.cash_movements for delete to authenticated
  using (user_id = auth.uid() and type in ('deposit', 'withdrawal'));

-- Permisos de las funciones: solo usuarios con sesión (nunca anónimos). El saldo base y el cierre de recomendaciones, solo servidor.
revoke all on function public.bankroll_available(uuid)                          from public, anon, authenticated;
revoke all on function public.settle_recommendations()                          from public, anon, authenticated;
revoke all on function public.get_bankroll_summary()                            from public, anon;
revoke all on function public.place_bet_ticket(jsonb, numeric, numeric, text, timestamptz) from public, anon;
revoke all on function public.settle_bet_ticket(bigint, text, numeric)          from public, anon;
revoke all on function public.set_selection_results(bigint, jsonb)              from public, anon;
revoke all on function public.confirm_bet_ticket(bigint)                        from public, anon;
grant execute on function public.get_bankroll_summary()                                     to authenticated;
grant execute on function public.place_bet_ticket(jsonb, numeric, numeric, text, timestamptz) to authenticated;
grant execute on function public.settle_bet_ticket(bigint, text, numeric)                    to authenticated;
grant execute on function public.set_selection_results(bigint, jsonb)                        to authenticated;
grant execute on function public.confirm_bet_ticket(bigint)                                   to authenticated;
grant execute on function public.bankroll_available(uuid)                                     to service_role;
grant execute on function public.settle_recommendations()                                     to service_role;
