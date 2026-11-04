// Cliente mínimo de API-Football con contador diario y caché en disco.
// Solo para scripts de servidor: la clave nunca llega a la app.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE_URL = 'https://v3.football.api-sports.io';
const DAILY_LIMIT = 90; // tope propio; el plan gratis permite 100
const CACHE_DIR = new URL('./.cache/', import.meta.url);

const MIN_GAP_MS = 7000;
let lastCallAt = 0;

mkdirSync(CACHE_DIR, { recursive: true });

const today = () => new Date().toISOString().slice(0, 10);
const usageFile = new URL('usage.json', CACHE_DIR);

function readUsage(): Record<string, number> {
  return existsSync(usageFile) ? JSON.parse(readFileSync(usageFile, 'utf8')) : {};
}

export function requestsUsedToday(): number {
  return readUsage()[today()] ?? 0;
}

export interface ApiResult {
  // deno-lint-ignore no-explicit-any
  body: any;
  fromCache: boolean;
}

export async function apiGet(path: string, params: Record<string, string | number | boolean>): Promise<ApiResult> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const url = `${BASE_URL}${path}?${query}`;
  const cacheFile = new URL(`${createHash('sha1').update(url).digest('hex')}.json`, CACHE_DIR);

  if (existsSync(cacheFile)) {
    return { body: JSON.parse(readFileSync(cacheFile, 'utf8')), fromCache: true };
  }

  const usage = readUsage();
  const used = usage[today()] ?? 0;
  if (used >= DAILY_LIMIT) {
    throw new Error(`Tope diario alcanzado (${used}/${DAILY_LIMIT}). Detenido.`);
  }

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('Falta API_FOOTBALL_KEY en .env');

  // El plan gratis permite ~10 solicitudes por minuto: pausa entre llamadas reales.
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();

  // Solo el header permitido por la API.
  const res = await fetch(url, { headers: { 'x-apisports-key': key } });
  usage[today()] = used + 1; // cuenta la solicitud aunque falle
  writeFileSync(usageFile, JSON.stringify(usage, null, 2));

  const body = await res.json();
  const remaining = res.headers.get('x-ratelimit-requests-remaining');
  console.log(`  [${res.status}] ${path}?${query}  (hoy: ${used + 1}/${DAILY_LIMIT}, restantes según API: ${remaining ?? 'n/d'})`);

  const hasErrors = body.errors && (Array.isArray(body.errors) ? body.errors.length : Object.keys(body.errors).length);
  if (!res.ok || hasErrors) {
    // Las respuestas con error no se guardan en caché.
    return { body, fromCache: false };
  }
  writeFileSync(cacheFile, JSON.stringify(body));
  return { body, fromCache: false };
}
