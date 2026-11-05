import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv, normalizePath, type Plugin } from 'vite';

// Tailwind lee tailwind.config.js solo al arrancar. Sin esto, tras cambiar colores o ajustes hay que reiniciar a mano
// `pnpm dev` y, mientras tanto, aparecen errores como «la clase bg-surface no existe».
function restartOnTailwindConfig(): Plugin {
  const file = normalizePath(`${process.cwd()}/tailwind.config.js`);
  return {
    name: 'restart-on-tailwind-config',
    configureServer(server) {
      server.watcher.add(file);
      server.watcher.on('change', (changed) => {
        if (normalizePath(changed) === file) void server.restart();
      });
    },
  };
}

// Tipos mínimos de los módulos cargados en el servidor (los scripts no se revisan con vue-tsc).
interface DbModule {
  createServiceClient: () => { auth: { getUser: (token: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }> } };
}
interface ResultsModule {
  resolvePending: (db?: unknown, log?: (line: string) => void) => Promise<{ resolved: number }>;
}
interface ActionsModule {
  refreshAll: (log: (line: string) => void, opts: { userId: string; force: boolean }) => Promise<unknown>;
  apiStatus: (db: unknown, userId: string) => Promise<unknown>;
  leaguesCatalog: (db: unknown, userId: string) => Promise<unknown>;
  addLeague: (db: unknown, userId: string, apiId: number, log: (line: string) => void) => Promise<unknown>;
}

// Acciones locales que la app pide al servidor (solo existen con `pnpm dev`). Las claves de servidor
// (API-Football y service role) se leen aquí, en Node, y nunca llegan al navegador. Cada acción exige tu sesión.
function localApi(mode: string): Plugin {
  const running = new Set<string>(); // evita ejecutar dos veces a la vez la misma acción pesada
  return {
    name: 'fijas-local-api',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '');
      for (const key of ['API_FOOTBALL_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
        if (env[key]) process.env[key] = env[key];
      }

      // Sin depender de abrir la app: mientras corra `pnpm dev`, revisa los resultados pendientes cada 20 minutos.
      let resolving = false;
      const tick = async () => {
        if (resolving || !env.SUPABASE_SERVICE_ROLE_KEY) return;
        resolving = true;
        try {
          const r = (await server.ssrLoadModule('/scripts/results.ts')) as ResultsModule;
          await r.resolvePending(undefined, () => {});
        } catch (e) {
          server.config.logger.warn(`[resultados] ${e instanceof Error ? e.message : e}`);
        } finally {
          resolving = false;
        }
      };
      const first = setTimeout(tick, 30_000);
      const timer = setInterval(tick, 20 * 60_000);
      server.httpServer?.on('close', () => { clearTimeout(first); clearInterval(timer); });

      server.middlewares.use('/api', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return send(405, { error: 'Método no permitido' });

        const action = (req.url ?? '').split('?')[0]!.replace(/^\/+/, '');
        if (!['analyze', 'refresh', 'resolve', 'api-status', 'leagues-catalog', 'leagues-add'].includes(action)) {
          return send(404, { error: 'Acción desconocida' });
        }

        let payload: Record<string, unknown> = {};
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const raw = Buffer.concat(chunks).toString('utf8');
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          return send(400, { error: 'Cuerpo inválido' });
        }

        try {
          const { createServiceClient } = (await server.ssrLoadModule('/scripts/db.ts')) as DbModule;
          const db = createServiceClient();
          const token = (req.headers.authorization ?? '').replace(/^Bearer /i, '');
          const { data, error } = await db.auth.getUser(token);
          if (error || !data.user) return send(401, { error: 'Sesión no válida' });
          const userId = data.user.id;

          if (running.has(action)) return send(409, { error: 'Esa acción ya está en curso' });
          running.add(action);
          try {
            const log: string[] = [];
            const a = (await server.ssrLoadModule('/scripts/actions.ts')) as ActionsModule;
            let result: unknown;
            if (action === 'resolve') result = await ((await server.ssrLoadModule('/scripts/results.ts')) as ResultsModule).resolvePending(db, (l) => log.push(l));
            else if (action === 'analyze' || action === 'refresh') result = await a.refreshAll((l) => log.push(l), { userId, force: payload.force === true });
            else if (action === 'api-status') result = await a.apiStatus(db, userId);
            else if (action === 'leagues-catalog') result = await a.leaguesCatalog(db, userId);
            else result = await a.addLeague(db, userId, Number(payload.apiId), (l) => log.push(l));
            send(200, { ok: true, summary: result, log });
          } finally {
            running.delete(action);
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
  plugins: [vue(), localApi(mode), restartOnTailwindConfig()],
  build: {
    cssMinify: false,
  },
}));
