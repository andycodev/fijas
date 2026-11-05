import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', 'supabase/tests/**'], // esas van aparte: pnpm test:db
    // Las pruebas de las migraciones levantan un Postgres en memoria: la primera vez tarda unos segundos.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
