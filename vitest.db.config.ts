import { defineConfig } from 'vitest/config';

// Pruebas de las migraciones y funciones SQL contra un Postgres en memoria (PGlite). Tardan ~1 minuto.
export default defineConfig({
  test: { globals: true, environment: 'node', include: ['supabase/tests/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 60_000 },
});
