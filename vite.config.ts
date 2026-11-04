import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// Tipos mínimos de los módulos cargados en el servidor (los scripts no se revisan con vue-tsc).
interface DbModule {
  createServiceClient: () => { auth: { getUser: (token: string) => Promise<{ data: { user: unknown }; error: unknown }> } };
}
interface RefreshModule {
  refreshAll: (log: (line: string) => void) => Promise<unknown>;
}

// Endpoint local del botón "Actualizar" de la app. Solo existe con `pnpm dev`.
// Las claves de servidor (API-Football y service role) se leen aquí, en Node, y nunca llegan al navegador.
function localApi(mode: string): Plugin {
  let running = false;
  return {
    name: 'fijas-local-api',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '');
      for (const key of ['API_FOOTBALL_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
        if (env[key]) process.env[key] = env[key];
      }

      server.middlewares.use('/api/refresh', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return send(405, { error: 'Método no permitido' });

        try {
          const { createServiceClient } = (await server.ssrLoadModule('/scripts/db.ts')) as DbModule;
          const token = (req.headers.authorization ?? '').replace(/^Bearer /i, '');
          const { data, error } = await createServiceClient().auth.getUser(token);
          if (error || !data.user) return send(401, { error: 'Sesión no válida' });

          if (running) return send(409, { error: 'Ya hay una actualización en curso' });
          running = true;
          try {
            const log: string[] = [];
            const { refreshAll } = (await server.ssrLoadModule('/scripts/refresh.ts')) as RefreshModule;
            const summary = await refreshAll((line) => log.push(line));
            send(200, { ok: true, summary, log });
          } finally {
            running = false;
          }
        } catch (e) {
          send(500, { error: e instanceof Error ? e.message : 'Error desconocido' });
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [vue(), localApi(mode)],
  build: {
    cssMinify: false,
  },
}));
