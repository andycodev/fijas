import { describe, expect, it } from 'vitest';
import { addUser, as, freshDb, migrationFiles } from './helpers';

// Comprueba que el entorno de pruebas reproduce tu esquema actual (migraciones 01 a 08).
describe('esquema actual (migraciones 01–08)', () => {
  it('se aplican todas sin errores y crean el perfil al registrarse', async () => {
    const db = await freshDb('20261104000008_leagues_and_api_usage.sql');
    const user = await addUser(db);
    const { rows } = await db.query<{ initial_bankroll: string; api_daily_cap: number }>(
      'select initial_bankroll, api_daily_cap from public.profiles where user_id = $1', [user]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.api_daily_cap).toBe(90);
    expect(migrationFiles().length).toBeGreaterThanOrEqual(8);
  });

  it('RLS: un usuario no ve el perfil de otro', async () => {
    const db = await freshDb('20261104000008_leagues_and_api_usage.sql');
    const a = await addUser(db), b = await addUser(db);
    const visible = await as(db, a, async () => (await db.query<{ user_id: string }>('select user_id from public.profiles')).rows);
    expect(visible.map((r) => r.user_id)).toEqual([a]);
    expect(b).not.toBe(a);
  });
});
