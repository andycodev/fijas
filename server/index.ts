// Servidor de producción: publica la app compilada (carpeta dist) y atiende las acciones del servidor en /api.
// Es lo que hace `pnpm dev`, pero para Render u otro hosting con Node: así el botón «Analizar» funciona publicado.
//   pnpm build && pnpm start        (el puerto sale de la variable PORT; por defecto 3000)
// Variables de servidor (en el panel del hosting, nunca en el código): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, API_FOOTBALL_KEY.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { handleApi } from './api.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 3000);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// Los módulos del servidor viven en /scripts; se cargan con tsx (el servidor se inicia con él).
const load = (path: string) => import(pathToFileURL(join(ROOT, path)).href);

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('Falta la carpeta dist: ejecuta primero `pnpm build`.');
  process.exit(1);
}

// Si el servidor se reinicia (p. ej. al desplegar una versión nueva) con un análisis en curso, ese análisis se pierde.
// Antes de cerrar, se marca como interrumpido; así la app no lo muestra «en curso» para siempre.
async function markInterrupted(signal: string) {
  try {
    const { createServiceClient } = (await load('/scripts/db.ts')) as { createServiceClient: () => { from: (t: string) => any } };
    await createServiceClient()
      .from('analysis_runs')
      .update({ status: 'failed', finished_at: new Date().toISOString(), error: `Interrumpida: el servidor se reinició (${signal}). Vuelve a analizar.` })
      .eq('status', 'running');
  } catch {
    /* sin conexión o sin claves: no hay nada más que hacer al cerrar */
  }
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => void markInterrupted(signal).finally(() => process.exit(0)));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    req.url = url.pathname.slice('/api'.length) + url.search; // el manejador espera solo el nombre de la acción
    return handleApi(req, res, load);
  }
  if (url.pathname === '/healthz') {
    res.end('ok');
    return;
  }

  // Archivos estáticos; cualquier otra ruta devuelve index.html (la app usa rutas del lado del cliente).
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST + sep) && file !== DIST) {
    res.statusCode = 403;
    res.end('Prohibido');
    return;
  }
  const isAsset = existsSync(file) && statSync(file).isFile();
  if (!isAsset) file = join(DIST, 'index.html');

  res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
  // Los archivos con hash en /assets no cambian: se guardan un año. El HTML nunca se guarda en caché.
  res.setHeader('Cache-Control', file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`Fijas escuchando en el puerto ${PORT}`));
