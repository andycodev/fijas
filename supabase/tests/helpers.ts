// Entorno de pruebas para las migraciones: un Postgres real (PGlite) con lo mínimo de Supabase simulado
// (roles, auth.users y auth.uid()). Nada de esto toca tu base de datos.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

// Lo que Supabase ya trae y las migraciones dan por existente.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export const migrationFiles = (): string[] => readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
export const readMigration = (file: string): string => readFileSync(join(MIGRATIONS, file), 'utf8');

// Base con las migraciones hasta «upTo» (inclusive; por defecto, todas). Se construye una vez y se clona: así cada prueba
// parte de una base limpia sin repetir todo el trabajo.
const templates = new Map<string, Blob | File>();
export async function freshDb(upTo?: string): Promise<PGlite> {
  const key = upTo ?? 'todas';
  if (!templates.has(key)) {
    const base = new PGlite();
    await base.exec(SUPABASE_STUB);
    for (const f of migrationFiles()) {
      if (upTo && f > upTo) break;
      await base.exec(readMigration(f));
    }
    templates.set(key, await base.dumpDataDir('none'));
    await base.close();
  }
  return new PGlite({ loadDataDir: templates.get(key)! });
}

export async function addUser(db: PGlite): Promise<string> {
  const { rows } = await db.query<{ id: string }>('insert into auth.users default values returning id');
  return rows[0]!.id; // el disparador crea su perfil
}

// Ejecuta como un usuario con sesión (RLS activa), igual que la app. `asService` imita la service role.
export async function as<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId}', false); set role authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
