import { describe, expect, it } from 'vitest';
import { addUser, as, freshDb, readMigration } from './helpers';

const M12 = '20261108000001_automation_runs.sql';
const M13 = '20261109000001_lab_only.sql';

const exists = async (db: Awaited<ReturnType<typeof freshDb>>, name: string) =>
  (await db.query<{ r: string | null }>('select to_regclass($1) as r', [`public.${name}`])).rows[0]!.r !== null;
const functionExists = async (db: Awaited<ReturnType<typeof freshDb>>, name: string) =>
  Number((await db.query<{ n: number }>('select count(*) n from pg_proc where proname = $1', [name])).rows[0]!.n) > 0;
const columns = async (db: Awaited<ReturnType<typeof freshDb>>) =>
  (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'profiles'`)).rows.map((r) => r.column_name);

describe('migración 13: solo laboratorio (sin apuestas ni dinero)', () => {
  it('retira tablas, funciones y columnas de apuestas/dinero y conserva lo del análisis', async () => {
    const db = await freshDb(M12);
    const u = await addUser(db);
    expect(await exists(db, 'bets')).toBe(true);
    await db.exec(readMigration(M13));

    for (const t of ['bets', 'bet_selections', 'cash_movements', 'reconciliations']) expect(await exists(db, t), t).toBe(false);
    for (const f of ['place_bet_ticket', 'settle_bet_ticket', 'set_selection_results', 'confirm_bet_ticket', 'get_bankroll_summary', 'bankroll_available']) {
      expect(await functionExists(db, f), f).toBe(false);
    }
    for (const t of ['recommendations', 'analysis_runs', 'automation_runs', 'picks', 'odds', 'matches', 'leagues']) expect(await exists(db, t), t).toBe(true);
    for (const f of ['settle_recommendations', 'void_recommendations']) expect(await functionExists(db, f), f).toBe(true);

    const cols = await columns(db);
    for (const c of ['initial_bankroll', 'stake_mode', 'stake_value', 'min_stake', 'daily_bet_limit', 'pause_level', 'daily_exposure_pct', 'monthly_loss_limit_pct', 'losing_streak_alert', 'bankroll_configured']) {
      expect(cols, c).not.toContain(c);
    }
    for (const c of ['value_threshold', 'min_probability', 'active_league_ids', 'active_markets', 'api_daily_cap', 'refresh_interval_minutes', 'currency', 'unit_value']) {
      expect(cols, c).toContain(c);
    }
    // El perfil existente recibe la unidad teórica por defecto
    const { rows } = await db.query<{ unit_value: string }>('select unit_value from public.profiles where user_id = $1', [u]);
    expect(Number(rows[0]!.unit_value)).toBe(10);
  });

  it('un usuario nuevo sigue obteniendo su perfil, y cada uno ve solo el suyo', async () => {
    const db = await freshDb();
    const a = await addUser(db);
    const b = await addUser(db);
    expect(await as(db, a, async () => (await db.query<{ user_id: string }>('select user_id from public.profiles')).rows.map((r) => r.user_id))).toEqual([a]);
    expect(b).not.toBe(a);
  });

  it('es idempotente: ejecutarla otra vez no falla ni cambia nada', async () => {
    const db = await freshDb(M13);
    await db.exec(readMigration(M13));
    await db.exec(readMigration(M13));
    expect(await exists(db, 'bets')).toBe(false);
  });

  it('si hay apuestas registradas, se detiene sin borrar nada', async () => {
    const db = await freshDb(M12);
    const u = await addUser(db);
    await db.query(`insert into public.bets (user_id, accepted_odds, stake) values ($1, 1.5, 10)`, [u]);
    await expect(db.exec(readMigration(M13))).rejects.toThrow(/registros de apuestas o caja/);
    expect(await exists(db, 'bets')).toBe(true);
    expect(Number((await db.query<{ n: number }>('select count(*) n from public.bets')).rows[0]!.n)).toBe(1);
    expect(await functionExists(db, 'place_bet_ticket')).toBe(true);
  });
});
