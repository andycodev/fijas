import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { addUser, as, freshDb, readMigration } from './helpers';

const M09 = '20261105000001_tickets_bankroll_analysis.sql';
const M10 = '20261106000001_recommendation_evaluation.sql';

async function seed(db: PGlite) {
  await db.exec(`
    insert into public.teams (league_id, name) values (1, 'Local FC'), (1, 'Visita FC');
    insert into public.matches (league_id, season, kickoff_at, home_team_id, away_team_id, status) values
      (1, 2020, now() - interval '5 hour', 1, 2, 'finished'),    -- 1: terminó
      (1, 2021, now() - interval '5 hour', 2, 1, 'finished'),    -- 2: terminó
      (1, 2022, now() - interval '3 hour', 1, 2, 'cancelled'),   -- 3: cancelado
      (1, 2023, now() - interval '10 day', 2, 1, 'postponed'),   -- 4: aplazado hace más de 7 días
      (1, 2024, now() - interval '1 day',  1, 2, 'postponed'),   -- 5: aplazado hace poco
      (1, 2025, now() + interval '1 day',  2, 1, 'scheduled');   -- 6: aún no se juega
    insert into public.picks (match_id, market, line, projection, probability, min_odds, model_version) values
      (1, 'goals_total', 2.5, 2.8, 0.56, 1.78, 'g1'), (2, 'goals_total', 2.5, 2.8, 0.56, 1.78, 'g1'),
      (3, 'goals_total', 2.5, 2.8, 0.56, 1.78, 'g1'), (4, 'goals_total', 2.5, 2.8, 0.56, 1.78, 'g1'),
      (5, 'goals_total', 2.5, 2.8, 0.56, 1.78, 'g1'), (6, 'goals_total', 2.5, 2.8, 0.56, 1.78, 'g1');
  `);
}

async function rec(db: PGlite, user: string, pick: number, side: 'over' | 'under') {
  await db.query(
    `insert into public.recommendations (user_id, pick_id, match_id, market, line, side, model_probability, odds, ev, league_id, kickoff_at, rationale)
     select $1, $2, m.id, 'goals_total', 2.5, $3, 0.62, 1.9, 0.178, m.league_id, m.kickoff_at, '{"summary":"x"}'::jsonb
     from public.matches m where m.id = $2`,
    [user, pick, side],
  );
}
const state = async (db: PGlite) =>
  (await db.query<{ pick_id: string; result: string; note: string | null }>('select pick_id, result, resolution_note as note from public.recommendations order by pick_id')).rows;

describe('migración 10: evaluación del modelo', () => {
  it('rellena liga y fecha de las recomendaciones anteriores y es idempotente', async () => {
    const db = await freshDb(M09);
    const u = await addUser(db);
    await seed(db);
    await db.query(`insert into public.recommendations (user_id, pick_id, match_id, market, line, side, model_probability, odds, ev) values ($1, 1, 1, 'goals_total', 2.5, 'over', 0.6, 1.9, 0.14)`, [u]);
    await db.exec(readMigration(M10));
    await db.exec(readMigration(M10)); // segunda vez: sin error ni cambios
    const r = (await db.query<{ league_id: string; kickoff_at: string | null }>('select league_id, kickoff_at from public.recommendations')).rows[0]!;
    expect(Number(r.league_id)).toBe(1);
    expect(r.kickoff_at).not.toBeNull();
  });
});

describe('la predicción queda congelada', () => {
  let db: PGlite, u: string;
  beforeEach(async () => { db = await freshDb(); u = await addUser(db); await seed(db); await rec(db, u, 1, 'over'); });

  it('no se puede cambiar probabilidad, cuota, valor, selección ni justificación', async () => {
    for (const set of ['model_probability = 0.9', 'odds = 2.5', 'ev = 0.5', "side = 'under'", 'line = 3.5', "rationale = '{}'::jsonb", "kickoff_at = now()"]) {
      await expect(db.query(`update public.recommendations set ${set}`), set).rejects.toThrow(/no se puede modificar/);
    }
  });
  it('lo que sí se rellena al resolver: resultado, valor real y fecha', async () => {
    await db.exec(`update public.picks set actual_result = 3 where id = 1; select public.settle_recommendations();`);
    expect((await state(db))[0]).toMatchObject({ result: 'won', note: 'Resultado real del partido' });
  });
  it('una vez resuelta, no se reabre ni se cambia el resultado', async () => {
    await db.exec(`update public.picks set actual_result = 3 where id = 1; select public.settle_recommendations();`);
    await expect(db.query(`update public.recommendations set result = 'lost'`)).rejects.toThrow(/ya resuelta/);
    // Si el partido se corrigiera después, la recomendación ya cerrada no se vuelve a evaluar
    await db.exec(`update public.picks set actual_result = 1 where id = 1`);
    expect(Number((await db.query<{ n: number }>('select public.settle_recommendations() as n')).rows[0]!.n)).toBe(0);
    expect((await state(db))[0]!.result).toBe('won');
  });
});

describe('resolución contra el resultado real', () => {
  let db: PGlite, u: string;
  beforeEach(async () => { db = await freshDb(); u = await addUser(db); await seed(db); });

  it('«más de» gana si el total supera la línea; «menos de» gana si no la alcanza', async () => {
    await rec(db, u, 1, 'over');   // 3 goles: gana
    await rec(db, u, 2, 'under');  // 3 goles: pierde
    await db.exec(`update public.picks set actual_result = 3 where id in (1, 2); select public.settle_recommendations();`);
    expect((await state(db)).map((r) => r.result)).toEqual(['won', 'lost']);
  });
  it('2-1 con «más de 2.5»: ganada (ejemplo del enunciado) y 1-0 con la misma línea: perdida', async () => {
    await rec(db, u, 1, 'over'); await rec(db, u, 2, 'over');
    await db.exec(`update public.picks set actual_result = 3 where id = 1; update public.picks set actual_result = 1 where id = 2; select public.settle_recommendations();`);
    expect((await state(db)).map((r) => r.result)).toEqual(['won', 'lost']);
  });
  it('un partido en curso o sin jugar sigue pendiente', async () => {
    await rec(db, u, 6, 'over');
    await db.exec('select public.settle_recommendations()');
    expect((await state(db))[0]!.result).toBe('pending');
  });
  it('un partido cancelado anula la recomendación (no cuenta como acierto ni fallo)', async () => {
    await rec(db, u, 3, 'over');
    await db.exec('select public.settle_recommendations()');
    expect((await state(db))[0]).toMatchObject({ result: 'void', note: 'Partido cancelado' });
  });
  it('un aplazado sigue pendiente 7 días; pasado ese plazo sin resultado se anula', async () => {
    await rec(db, u, 5, 'over'); await rec(db, u, 4, 'over');
    await db.exec('select public.settle_recommendations()');
    expect((await state(db)).map((r) => [Number(r.pick_id), r.result])).toEqual([[4, 'void'], [5, 'pending']]);
  });
  it('un aplazado que finalmente se juega se resuelve con su resultado, aunque se haya reprogramado', async () => {
    await rec(db, u, 4, 'over');
    await db.exec(`update public.matches set status = 'finished', kickoff_at = now() - interval '1 hour' where id = 4; update public.picks set actual_result = 4 where id = 4;
                   select public.settle_recommendations();`);
    expect((await state(db))[0]!.result).toBe('won');
  });
  it('anular por tiempo extra solo afecta a recomendaciones pendientes del mercado indicado', async () => {
    await rec(db, u, 1, 'over');
    await db.exec(`update public.picks set actual_result = 3 where id = 1; select public.settle_recommendations();`);
    const n = async (m: string) => Number((await db.query<{ n: number }>('select public.void_recommendations(1, $1, $2) as n', [m, 'Tiempo extra'])).rows[0]!.n);
    expect(await n('goals_total')).toBe(0); // ya resuelta: no se toca
    expect((await state(db))[0]!.result).toBe('won');
  });
  it('el usuario con sesión no puede anular ni resolver recomendaciones', async () => {
    await rec(db, u, 1, 'over');
    await expect(as(db, u, () => db.query(`select public.void_recommendations(1, 'goals_total', 'x')`))).rejects.toThrow();
    await as(db, u, () => db.query(`update public.recommendations set result = 'won'`)); // sin política de escritura: no cambia nada
    expect((await state(db))[0]!.result).toBe('pending');
  });
});

describe('categoría de la recomendación', () => {
  let db: PGlite, u: string;
  beforeEach(async () => { db = await freshDb(); u = await addUser(db); await seed(db); });

  it('por defecto es principal; las de estudio se guardan aparte y se resuelven igual', async () => {
    await rec(db, u, 1, 'over');
    await db.query(`insert into public.recommendations (user_id, pick_id, match_id, market, line, side, model_probability, odds, ev, category) values ($1, 2, 2, 'goals_total', 2.5, 'over', 0.74, 1.40, 0.036, 'low_value')`, [u]);
    const cats = (await db.query<{ category: string }>('select category from public.recommendations order by pick_id')).rows.map((r) => r.category);
    expect(cats).toEqual(['main', 'low_value']);
    await db.exec(`update public.picks set actual_result = 3 where id in (1, 2); select public.settle_recommendations();`);
    expect((await state(db)).map((r) => r.result)).toEqual(['won', 'won']);
  });
  it('la categoría no se puede cambiar después (ni «promover» una de estudio a principal)', async () => {
    await db.query(`insert into public.recommendations (user_id, pick_id, match_id, market, line, side, model_probability, odds, ev, category) values ($1, 1, 1, 'goals_total', 2.5, 'over', 0.74, 1.40, 0.036, 'low_value')`, [u]);
    await expect(db.query(`update public.recommendations set category = 'main'`)).rejects.toThrow(/no se puede modificar/);
  });
  it('solo admite las categorías definidas', async () => {
    await expect(db.query(`insert into public.recommendations (user_id, pick_id, match_id, market, line, side, model_probability, odds, ev, category) values ($1, 1, 1, 'goals_total', 2.5, 'over', 0.7, 1.4, 0.0, 'otra')`, [u])).rejects.toThrow();
  });
});
