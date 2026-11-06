import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { addUser, as, freshDb } from './helpers';

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
