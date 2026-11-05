import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv, normalizePath, type Plugin } from 'vite';
import { handleApi } from './server/api.ts';

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

// Acciones que la app pide al servidor con `pnpm dev`. La lógica vive en server/api.ts y la comparte el servidor de producción
// (server/index.ts). Además, mientras corra el servidor local, revisa los resultados pendientes cada 20 minutos.
function localApi(mode: string): Plugin {
  return {
    name: 'fijas-local-api',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '');
      for (const key of ['API_FOOTBALL_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
        if (env[key]) process.env[key] = env[key];
      }

      let resolving = false;
      const tick = async () => {
        if (resolving || !env.SUPABASE_SERVICE_ROLE_KEY) return;
        resolving = true;
        try {
          const r = (await server.ssrLoadModule('/scripts/results.ts')) as { resolvePending: (db?: unknown, log?: (l: string) => void) => Promise<unknown> };
          await r.resolvePending(undefined, () => {});
        } catch (e) {
          server.config.logger.warn(`[resultados] ${e instanceof Error ? e.message : e}`);
        } finally {
          resolving = false;
        }
      };
      const first = setTimeout(tick, 30_000);
      const timer = setInterval(tick, 20 * 60_000);
      server.httpServer?.on('close', () => {
        clearTimeout(first);
        clearInterval(timer);
      });

      server.middlewares.use('/api', (req, res) => void handleApi(req, res, (p) => server.ssrLoadModule(p)));
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
