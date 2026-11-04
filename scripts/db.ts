import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Db = SupabaseClient;

// Cliente con service role. Solo para scripts/servidor: nunca se importa desde la app.
export function createServiceClient(): Db {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env');
  // Node 20 no trae WebSocket nativo y estos scripts no usan tiempo real: transporte vacío.
  return createClient(url, key, { auth: { persistSession: false }, realtime: { transport: class {} as never } });
}

// true cuando el archivo se ejecuta directamente (npx tsx archivo.ts) y no cuando se importa.
export const isMain = (metaUrl: string): boolean =>
  !!process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(metaUrl));
