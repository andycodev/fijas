import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { addUser, as, freshDb, readMigration } from './helpers';

const M09 = '20261105000001_tickets_bankroll_analysis.sql';
const M08 = '20261104000008_leagues_and_api_usage.sql';

// Datos de apoyo: dos equipos, tres partidos y sus picks.
async function seed(db: PGlite) {
  await db.exec(`
    insert into public.teams (league_id, name) values (1, 'Local FC'), (1, 'Visita FC');
    insert into public.matches (league_id, season, kickoff_at, home_team_id, away_team_id, status) values
      (1, 2026, now() + interval '1 day', 1, 2, 'scheduled'),
      (1, 2026, now() + interval '2 day', 2, 1, 'scheduled'),
      (1, 2025, now() - interval '3 day', 1, 2, 'finished');
    insert into public.picks (match_id, market, line, projection, probability, min_odds, model_version) values
      (1, 'goals_total', 2.5, 2.8, 0.56, 1.78, 'g1'),
      (2, 'corners_total', 9.5, 10.2, 0.58, 1.72, 'v1'),
      (3, 'goals_total', 1.5, 2.9, 0.80, 1.25, 'g1');
  `);
}

const sel = (o: Record<string, unknown> = {}) => ({
  match_id: 1, market: 'goals_total', line: 2.5, side: 'under', odds: 1.8, pick_id: 1, model_probability: 0.44, ...o,
});

async function place(db: PGlite, user: string, selections: unknown[], stake = 10, total: number | null = null, key: string | null = null) {
  return as(db, user, async () => {
    const { rows } = await db.query<{ id: string }>(
      'select public.place_bet_ticket($1::jsonb, $2::numeric, $3::numeric, $4::text) as id',
      [JSON.stringify(selections), stake, total, key],
    );
    return Number(rows[0]!.id);
  });
}
const summary = (db: PGlite, user: string) =>
  as(db, user, async () => (await db.query<{ s: Record<string, number> }>('select public.get_bankroll_summary() as s')).rows[0]!.s);
const settle = (db: PGlite, user: string, id: number, result: string, payout: number | null = null) =>
  as(db, user, () => db.query('select public.settle_bet_ticket($1, $2, $3::numeric)', [id, result, payout]));
const count = async (db: PGlite, sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0]!.n);

describe('migración 09: actualización desde el esquema actual', () => {
  it('conserva los boletos anteriores, los pasa a selecciones y reconstruye el libro; y es idempotente', async () => {
    const db = await freshDb(M08);
    const u = await addUser(db);
    await seed(db);
    // Datos como los de hoy: una apuesta ganada, una perdida y una anulada (una selección por fila)
    await db.exec(`
      insert into public.bets (user_id, match_id, market, line, side, accepted_odds, stake, status, result, profit_loss, placed_at, closed_at) values
        ('${u}', 1, 'goals_total', 2.5, 'under', 3.45, 4, 'confirmed', 'won', 9.8, now() - interval '2 day', now() - interval '1 day'),
        ('${u}', 1, 'goals_total', 3.5, 'under', 2.10, 4, 'confirmed', 'lost', -4, now() - interval '2 day', now() - interval '1 day'),
        ('${u}', 2, 'corners_total', 6.5, 'over', 1.41, 4, 'void', 'void', 0, now() - interval '2 day', now() - interval '1 day');
    `);
    await db.exec(readMigration(M09));

    expect(await count(db, 'select count(*) n from public.bet_selections')).toBe(3);
    expect(await count(db, "select count(*) n from public.cash_movements where type = 'stake'")).toBe(3);
    expect(await count(db, "select count(*) n from public.cash_movements where type = 'payout'")).toBe(1);
    expect(await count(db, "select count(*) n from public.cash_movements where type = 'refund'")).toBe(1);

    const p = (await db.query<{ initial_bankroll: string; stake_value: string; min_stake: string; stake_mode: string }>(
      'select initial_bankroll, stake_value, min_stake, stake_mode from public.profiles')).rows[0]!;
    expect([Number(p.initial_bankroll), Number(p.stake_value), Number(p.min_stake), p.stake_mode]).toEqual([300, 10, 10, 'fixed']);

    // saldo = 300 − 12 de importes + 13.80 de retorno + 4 de devolución = 305.80  (la misma ganancia neta de +5.80 que antes)
    const s = await summary(db, u);
    expect(Number(s.available)).toBeCloseTo(305.8, 2);
    expect(Number(s.net)).toBeCloseTo(5.8, 2);

    // Segunda ejecución: nada se duplica y el usuario conserva lo que cambió después.
    await db.exec(`update public.profiles set initial_bankroll = 500`);
    await db.exec(readMigration(M09));
    expect(await count(db, 'select count(*) n from public.bet_selections')).toBe(3);
    expect(await count(db, 'select count(*) n from public.cash_movements')).toBe(5);
    expect(Number((await db.query<{ v: string }>('select initial_bankroll v from public.profiles')).rows[0]!.v)).toBe(500);
  });
});

describe('boletos y bankroll', () => {
  let db: PGlite, a: string, b: string;
  beforeEach(async () => {
    db = await freshDb();
    a = await addUser(db);
    b = await addUser(db);
    await seed(db);
  });

  it('un perfil nuevo nace con S/ 300 y unidad de S/ 10', async () => {
    const s = await summary(db, a);
    expect(Number(s.initial)).toBe(300);
    expect(Number(s.available)).toBe(300);
  });

  it('simple: descuenta S/ 10 una vez y deja el importe como comprometido', async () => {
    const id = await place(db, a, [sel()]);
    const s = await summary(db, a);
    expect(Number(s.available)).toBe(290);
    expect(Number(s.committed)).toBe(10);
    expect(Number(s.equity)).toBe(300);
    const t = (await db.query<{ kind: string; status: string }>('select kind, status from public.bets where id = $1', [id])).rows[0]!;
    expect(t).toEqual({ kind: 'single', status: 'open' });
  });

  it('combinada del ejemplo: 1.80 × 1.90 = 3.42, retorno 34.20 y se descuentan S/ 10 por el boleto (no por selección)', async () => {
    const id = await place(db, a, [sel(), sel({ match_id: 2, market: 'corners_total', line: 9.5, side: 'over', odds: 1.9, pick_id: 2 })]);
    const t = (await db.query<{ kind: string; accepted_odds: string; computed_odds: string; odds_edited: boolean }>(
      'select kind, accepted_odds, computed_odds, odds_edited from public.bets where id = $1', [id])).rows[0]!;
    expect(t.kind).toBe('combo');
    expect(Number(t.accepted_odds)).toBe(3.42);
    expect(t.odds_edited).toBe(false);
    expect(await count(db, `select count(*) n from public.bet_selections where bet_id = ${id}`)).toBe(2);
    expect(await count(db, `select count(*) n from public.cash_movements where bet_id = ${id} and type = 'stake'`)).toBe(1);
    expect(Number((await summary(db, a)).available)).toBe(290);

    await settle(db, a, id, 'won');
    const s = await summary(db, a);
    expect(Number(s.available)).toBeCloseTo(324.2, 2); // 300 − 10 + 34.20
    expect(Number(s.net)).toBeCloseTo(24.2, 2);
    const closed = (await db.query<{ payout: string; profit_loss: string }>('select payout, profit_loss from public.bets where id = $1', [id])).rows[0]!;
    expect([Number(closed.payout), Number(closed.profit_loss)]).toEqual([34.2, 24.2]);
  });

  it('permite escribir la cuota real de Betano y lo registra como editada', async () => {
    const id = await place(db, a, [sel(), sel({ match_id: 2, line: 9.5, odds: 1.9, pick_id: 2, market: 'corners_total', side: 'over' })], 10, 3.4);
    const t = (await db.query<{ accepted_odds: string; odds_edited: boolean }>('select accepted_odds, odds_edited from public.bets where id = $1', [id])).rows[0]!;
    expect([Number(t.accepted_odds), t.odds_edited]).toEqual([3.4, true]);
  });

  it('validaciones: saldo, mínimo, vacío, cuota, repetidas y fecha futura', async () => {
    await expect(place(db, a, [sel()], 301)).rejects.toThrow(/Saldo insuficiente/);
    await expect(place(db, a, [sel()], 9)).rejects.toThrow(/mínimo/);
    await expect(place(db, a, [])).rejects.toThrow(/al menos una selección/);
    await expect(place(db, a, [sel({ odds: 1 })])).rejects.toThrow(/inválida/);
    await expect(place(db, a, [sel({ market: 'goles' })])).rejects.toThrow(/Mercado inválido/);
    await expect(place(db, a, [sel({ match_id: 999 })])).rejects.toThrow(/inexistente/);
    await expect(place(db, a, [sel(), sel()])).rejects.toThrow(/repetida/);
    await expect(
      as(db, a, () => db.query(`select public.place_bet_ticket($1::jsonb, 10, null, null, now() + interval '2 day')`, [JSON.stringify([sel()])])),
    ).rejects.toThrow(/futura/);
    expect(Number((await summary(db, a)).available)).toBe(300); // nada se descontó
  });

  it('no deja gastar más del saldo: 30 boletos de S/ 10 sí, el 31 no', async () => {
    for (let i = 0; i < 30; i++) await place(db, a, [sel({ line: 0.5 + (i % 5), side: i % 2 ? 'over' : 'under', match_id: 1 + (i % 2), market: 'goals_total', pick_id: null })], 10, null, `k${i}`);
    expect(Number((await summary(db, a)).available)).toBe(0);
    await expect(place(db, a, [sel()], 10, null, 'k31')).rejects.toThrow(/Saldo insuficiente/);
  });

  it('reintentar con la misma clave no duplica el boleto ni el descuento', async () => {
    const id1 = await place(db, a, [sel()], 10, null, 'abc');
    const id2 = await place(db, a, [sel()], 10, null, 'abc');
    expect(id2).toBe(id1);
    expect(await count(db, 'select count(*) n from public.bets')).toBe(1);
    expect(Number((await summary(db, a)).available)).toBe(290);
  });

  it('perdido: queda la pérdida y no hay retorno; anulado: devuelve el importe', async () => {
    const lost = await place(db, a, [sel()]);
    await settle(db, a, lost, 'lost');
    expect(Number((await summary(db, a)).available)).toBe(290);
    expect(await count(db, `select count(*) n from public.cash_movements where bet_id = ${lost} and type = 'payout'`)).toBe(0);

    const voided = await place(db, a, [sel({ match_id: 2, market: 'corners_total', line: 9.5, side: 'over', pick_id: 2 })]);
    expect(Number((await summary(db, a)).available)).toBe(280);
    await settle(db, a, voided, 'void');
    const s = await summary(db, a);
    expect(Number(s.available)).toBe(290);
    expect(Number(s.net)).toBe(-10);
    expect(Number(s.total_staked)).toBe(10); // el anulado no cuenta como apostado
  });

  it('liquidar dos veces o con datos inválidos se rechaza y no mueve dinero', async () => {
    const id = await place(db, a, [sel()]);
    await settle(db, a, id, 'won');
    await expect(settle(db, a, id, 'won')).rejects.toThrow(/ya está liquidado/);
    await expect(settle(db, a, id, 'lost')).rejects.toThrow(/ya está liquidado/);
    const id2 = await place(db, a, [sel({ line: 3.5, pick_id: null })]);
    await expect(settle(db, a, id2, 'ganado')).rejects.toThrow(/inválido/);
    await expect(settle(db, a, id2, 'won', 5)).rejects.toThrow(/al menos el importe/);
    expect(await count(db, `select count(*) n from public.cash_movements where type = 'payout'`)).toBe(1);
  });

  it('un retorno real distinto del calculado (selección anulada dentro de la combinada) se respeta', async () => {
    const id = await place(db, a, [sel(), sel({ match_id: 2, market: 'corners_total', line: 9.5, side: 'over', odds: 1.9, pick_id: 2 })]);
    await settle(db, a, id, 'won', 18); // Betano pagó con solo una selección válida: 10 × 1.80
    expect(Number((await summary(db, a)).net)).toBe(8);
  });

  it('resultado por selección: pasa de pendiente a final y no se contradice; no cuenta como acierto del boleto', async () => {
    const id = await place(db, a, [sel(), sel({ match_id: 2, market: 'corners_total', line: 9.5, side: 'over', odds: 1.9, pick_id: 2 })]);
    const ids = (await db.query<{ id: string }>(`select id from public.bet_selections where bet_id = ${id} order by position`)).rows.map((r) => Number(r.id));
    await as(db, a, () => db.query('select public.set_selection_results($1, $2::jsonb)', [id, JSON.stringify([{ selection_id: ids[0], result: 'won', actual_value: 2 }, { selection_id: ids[1], result: 'lost', actual_value: 8 }])]));
    const r = (await db.query<{ result: string }>(`select result from public.bet_selections where bet_id = ${id} order by position`)).rows.map((x) => x.result);
    expect(r).toEqual(['won', 'lost']);
    await expect(as(db, a, () => db.query('select public.set_selection_results($1, $2::jsonb)', [id, JSON.stringify([{ selection_id: ids[0], result: 'lost' }])]))).rejects.toThrow(/distinto/);
    // el boleto sigue pendiente: liquidarlo es una decisión aparte
    expect((await db.query<{ status: string }>(`select status from public.bets where id = ${id}`)).rows[0]!.status).toBe('open');
  });

  it('confirmar solo funciona sobre boletos cerrados', async () => {
    const id = await place(db, a, [sel()]);
    await expect(as(db, a, () => db.query('select public.confirm_bet_ticket($1)', [id]))).rejects.toThrow(/cerrado/);
    await settle(db, a, id, 'lost');
    await as(db, a, () => db.query('select public.confirm_bet_ticket($1)', [id]));
    expect((await db.query<{ status: string }>(`select status from public.bets where id = ${id}`)).rows[0]!.status).toBe('confirmed');
  });
});

describe('seguridad: aislamiento y escrituras directas', () => {
  let db: PGlite, a: string, b: string;
  beforeEach(async () => {
    db = await freshDb();
    a = await addUser(db);
    b = await addUser(db);
    await seed(db);
  });

  it('un usuario no ve ni puede tocar los boletos de otro', async () => {
    const id = await place(db, a, [sel()]);
    expect(await as(db, b, async () => (await db.query('select * from public.bets')).rows.length)).toBe(0);
    expect(await as(db, b, async () => (await db.query('select * from public.bet_selections')).rows.length)).toBe(0);
    expect(await as(db, b, async () => (await db.query('select * from public.cash_movements')).rows.length)).toBe(0);
    await expect(settle(db, b, id, 'won')).rejects.toThrow(/no encontrado/);
    await expect(as(db, b, () => db.query('select public.confirm_bet_ticket($1)', [id]))).rejects.toThrow(/cerrado/);
    expect(Number((await summary(db, b)).available)).toBe(300);
  });

  it('no se puede escribir un boleto directamente, solo por la función', async () => {
    await expect(as(db, a, () => db.query(`insert into public.bets (user_id, accepted_odds, stake) values ('${a}', 2, 10)`))).rejects.toThrow();
    const id = await place(db, a, [sel()]);
    // un UPDATE directo no afecta ninguna fila (la política no lo permite)
    const r = await as(db, a, () => db.query(`update public.bets set status = 'closed', result = 'won', profit_loss = 999 where id = ${id}`));
    expect(r.affectedRows ?? 0).toBe(0);
    expect((await db.query<{ status: string }>(`select status from public.bets where id = ${id}`)).rows[0]!.status).toBe('open');
    await expect(as(db, a, () => db.query(`insert into public.bet_selections (bet_id, user_id, position, match_id, market, line, side, odds) values (${id}, '${a}', 9, 1, 'goals_total', 1.5, 'over', 2)`))).rejects.toThrow();
  });

  it('no se pueden fabricar movimientos de apuesta, pero sí depósitos y retiros propios', async () => {
    await expect(as(db, a, () => db.query(`insert into public.cash_movements (user_id, type, amount) values ('${a}', 'payout', 500)`))).rejects.toThrow();
    await expect(as(db, a, () => db.query(`insert into public.cash_movements (user_id, type, amount) values ('${a}', 'stake', 5)`))).rejects.toThrow();
    await as(db, a, () => db.query(`insert into public.cash_movements (user_id, type, amount, note) values ('${a}', 'deposit', 100, 'recarga')`));
    expect(Number((await summary(db, a)).available)).toBe(400);
    await expect(as(db, a, () => db.query(`insert into public.cash_movements (user_id, type, amount) values ('${b}', 'deposit', 100)`))).rejects.toThrow();
  });

  it('la base impide un segundo cobro del mismo boleto aunque se intente saltar la función', async () => {
    const id = await place(db, a, [sel()]);
    await settle(db, a, id, 'won');
    await expect(db.query(`insert into public.cash_movements (user_id, type, amount, bet_id) values ('${a}', 'payout', 18, ${id})`)).rejects.toThrow(/duplicate|unique/i);
  });

  it('los anónimos no pueden usar las funciones', async () => {
    await db.exec(`set role anon`);
    await expect(db.query(`select public.get_bankroll_summary()`)).rejects.toThrow();
    await expect(db.query(`select public.place_bet_ticket('[]'::jsonb, 10)`)).rejects.toThrow();
    await db.exec(`reset role`);
  });

  it('el usuario con sesión no puede ejecutar las funciones internas del servidor', async () => {
    await expect(as(db, a, () => db.query(`select public.settle_recommendations()`))).rejects.toThrow();
    await expect(as(db, a, () => db.query(`select public.bankroll_available('${b}')`))).rejects.toThrow();
  });
});

describe('ejecuciones del análisis y recomendaciones', () => {
  let db: PGlite, a: string, b: string;
  beforeEach(async () => {
    db = await freshDb();
    a = await addUser(db);
    b = await addUser(db);
    await seed(db);
  });

  it('solo puede haber un análisis en curso por usuario, pero dos usuarios pueden analizar a la vez', async () => {
    await db.query(`insert into public.analysis_runs (user_id) values ('${a}')`);
    await expect(db.query(`insert into public.analysis_runs (user_id) values ('${a}')`)).rejects.toThrow(/duplicate|unique/i);
    await db.query(`insert into public.analysis_runs (user_id) values ('${b}')`);
    await db.query(`update public.analysis_runs set status = 'succeeded', finished_at = now() where user_id = '${a}'`);
    await db.query(`insert into public.analysis_runs (user_id) values ('${a}')`); // ya terminó el anterior
    await expect(db.query(`update public.analysis_runs set status = 'succeeded' where user_id = '${b}'`)).rejects.toThrow(); // terminar exige fecha de fin
  });

  it('el usuario ve sus ejecuciones pero no puede crearlas ni modificarlas', async () => {
    await db.query(`insert into public.analysis_runs (user_id, status, finished_at) values ('${a}', 'succeeded', now())`);
    expect(await as(db, a, async () => (await db.query('select * from public.analysis_runs')).rows.length)).toBe(1);
    expect(await as(db, b, async () => (await db.query('select * from public.analysis_runs')).rows.length)).toBe(0);
    await expect(as(db, a, () => db.query(`insert into public.analysis_runs (user_id) values ('${a}')`))).rejects.toThrow();
  });

  it('las recomendaciones se evalúan una vez terminado el partido y no se duplican', async () => {
    await db.query(`insert into public.recommendations (user_id, pick_id, match_id, market, line, side, model_probability, odds, ev) values
      ('${a}', 3, 3, 'goals_total', 1.5, 'over', 0.80, 1.3, 0.04),
      ('${a}', 1, 1, 'goals_total', 2.5, 'under', 0.44, 3.0, 0.32)`);
    await expect(db.query(`insert into public.recommendations (user_id, pick_id, match_id, market, line, side, model_probability, odds, ev) values ('${a}', 3, 3, 'goals_total', 1.5, 'over', 0.80, 1.4, 0.1)`)).rejects.toThrow(/duplicate|unique/i);
    // El partido 3 terminó con 3 goles: «más de 1.5» acierta. El partido 1 aún no se juega.
    await db.exec(`update public.picks set actual_result = 3 where id = 3`);
    const n = Number((await db.query<{ n: number }>(`select public.settle_recommendations() as n`)).rows[0]!.n);
    expect(n).toBe(1);
    const rows = (await db.query<{ pick_id: string; result: string; actual_value: number }>('select pick_id, result, actual_value from public.recommendations order by pick_id')).rows;
    expect(rows.map((r) => r.result)).toEqual(['pending', 'won']);
    // una segunda llamada no vuelve a tocar nada
    expect(Number((await db.query<{ n: number }>(`select public.settle_recommendations() as n`)).rows[0]!.n)).toBe(0);
    expect(await as(db, b, async () => (await db.query('select * from public.recommendations')).rows.length)).toBe(0);
  });
});
