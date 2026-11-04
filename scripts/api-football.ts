// Cliente mínimo de API-Football: caché en disco y consumo REAL del proveedor.
// El consumo sale de los encabezados de cada respuesta y del endpoint /status (que no gasta solicitudes),
// no de un contador propio. Solo para scripts de servidor: la clave nunca llega a la app.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { detectReset } from '../src/lib/apiUsage.ts';
import type { Db } from './db.ts';

const BASE_URL = 'https://v3.football.api-sports.io';
const PROVIDER = 'api-football';
const DEFAULT_CAP = 90; // tope propio por día (el plan gratis permite 100); se puede configurar
const CACHE_DIR = new URL('./.cache/', import.meta.url);

const MIN_GAP_MS = 7000; // el plan gratis admite ~10 solicitudes por minuto
let lastCallAt = 0;

mkdirSync(CACHE_DIR, { recursive: true });

const today = () => new Date().toISOString().slice(0, 10);
const usageFile = new URL('usage.json', CACHE_DIR);

function readUsage(): Record<string, number> {
  return existsSync(usageFile) ? JSON.parse(readFileSync(usageFile, 'utf8')) : {};
}

// ───────── Consumo real del proveedor ─────────
let usageDb: Db | null = null;
let dailyCap = DEFAULT_CAP;
let knownUsed: number | null = null; // solicitudes usadas hoy según el proveedor
let knownRemaining: number | null = null;

// Conecta el cliente con la base para guardar el consumo real y fija el tope propio de solicitudes por día.
export function configureUsage(db: Db, opts: { cap?: number } = {}): void {
  usageDb = db;
  if (opts.cap) dailyCap = opts.cap;
}

// Solicitudes usadas hoy: la cifra del proveedor si la conocemos; si no, el contador local de respaldo.
export function requestsUsedToday(): number {
  return knownUsed ?? readUsage()[today()] ?? 0;
}

interface Snapshot {
  used?: number | null;
  limit?: number | null;
  remaining?: number | null;
  status: 'ok' | 'rate_limited' | 'error' | 'unreachable';
  requestMade?: boolean;
  plan?: { name: string | null; end: string | null };
}

async function saveSnapshot(s: Snapshot): Promise<void> {
  if (!usageDb) return;
  try {
    const { data: prev } = await usageDb
      .from('api_usage')
      .select('remaining, requests_used, daily_limit')
      .eq('provider', PROVIDER)
      .order('day', { ascending: false })
      .limit(1)
      .maybeSingle();
    const now = new Date().toISOString();
    const remaining = s.remaining ?? null;
    const row: Record<string, unknown> = {
      provider: PROVIDER,
      day: today(),
      requests_used: s.used ?? prev?.requests_used ?? 0,
      daily_limit: s.limit ?? prev?.daily_limit ?? null,
      remaining: remaining ?? prev?.remaining ?? null,
      last_status: s.status,
    };
    if (s.requestMade) row.last_request_at = now;
    if (detectReset(prev?.remaining ?? null, remaining)) row.reset_observed_at = now; // el contador volvió a subir
    if (s.plan) { row.plan_name = s.plan.name; row.plan_end = s.plan.end; }
    await usageDb.from('api_usage').upsert(row, { onConflict: 'provider,day' });
  } catch {
    // Guardar el consumo es informativo: un fallo aquí nunca debe romper una consulta.
  }
}

// Consulta /status: informa el consumo real, el plan y su vencimiento. No gasta solicitudes.
export async function fetchStatus() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('Falta API_FOOTBALL_KEY en .env');
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/status`, { headers: { 'x-apisports-key': key } });
  } catch {
    await saveSnapshot({ status: 'unreachable' });
    throw new Error('No hay conexión con el proveedor de la API.');
  }
  const body: any = await res.json().catch(() => ({}));
  const r = body.response?.requests;
  if (!res.ok || !r) {
    await saveSnapshot({ status: res.status === 429 ? 'rate_limited' : 'error' });
    throw new Error('El proveedor no devolvió el estado de la cuenta.');
  }
  knownUsed = Number(r.current);
  knownRemaining = Number(r.limit_day) - Number(r.current);
  await saveSnapshot({
    used: knownUsed,
    limit: Number(r.limit_day),
    remaining: knownRemaining,
    status: 'ok',
    plan: { name: body.response?.subscription?.plan ?? null, end: body.response?.subscription?.end ?? null },
  });
  return { used: knownUsed, limit: Number(r.limit_day), remaining: knownRemaining };
}

export interface ApiResult {
  // deno-lint-ignore no-explicit-any
  body: any;
  fromCache: boolean;
}

// maxAgeHours: vigencia de la caché (sin valor = para siempre; útil para partidos ya jugados).
export async function apiGet(
  path: string,
  params: Record<string, string | number | boolean>,
  opts: { maxAgeHours?: number } = {},
): Promise<ApiResult> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const url = `${BASE_URL}${path}?${query}`;
  const cacheFile = new URL(`${createHash('sha1').update(url).digest('hex')}.json`, CACHE_DIR);

  const fresh = (): boolean =>
    opts.maxAgeHours === undefined || Date.now() - statSync(cacheFile).mtimeMs < opts.maxAgeHours * 3600_000;
  if (existsSync(cacheFile) && fresh()) {
    return { body: JSON.parse(readFileSync(cacheFile, 'utf8')), fromCache: true }; // consulta repetida: no gasta solicitud
  }

  // Tope: la cifra real del proveedor manda; el contador local solo es respaldo si aún no la conocemos.
  const usage = readUsage();
  const used = knownUsed ?? usage[today()] ?? 0;
  if (used >= dailyCap || knownRemaining === 0) {
    throw new Error(`Tope diario alcanzado (${used}/${dailyCap}). Detenido.`);
  }

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('Falta API_FOOTBALL_KEY en .env');

  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();

  let res: Response;
  try {
    // Solo el header permitido por la API.
    res = await fetch(url, { headers: { 'x-apisports-key': key } });
  } catch {
    await saveSnapshot({ status: 'unreachable', requestMade: true });
    throw new Error('No hay conexión con el proveedor de la API.');
  }
  usage[today()] = (usage[today()] ?? 0) + 1;
  writeFileSync(usageFile, JSON.stringify(usage, null, 2));

  const body = await res.json();
  const limit = Number(res.headers.get('x-ratelimit-requests-limit'));
  const remaining = Number(res.headers.get('x-ratelimit-requests-remaining'));
  const hasHeaders = Number.isFinite(limit) && limit > 0 && Number.isFinite(remaining);
  if (hasHeaders) {
    knownUsed = limit - remaining;
    knownRemaining = remaining;
  }

  const hasErrors = body.errors && (Array.isArray(body.errors) ? body.errors.length : Object.keys(body.errors).length);
  const rateLimited = res.status === 429 || (hasErrors && (body.errors.rateLimit || body.errors.requests));
  await saveSnapshot({
    used: hasHeaders ? limit - remaining : null,
    limit: hasHeaders ? limit : null,
    remaining: hasHeaders ? remaining : null,
    status: rateLimited ? 'rate_limited' : !res.ok || hasErrors ? 'error' : 'ok',
    requestMade: true,
  });
  console.log(`  [${res.status}] ${path}?${query}  (consumo real del proveedor: ${hasHeaders ? `${limit - remaining}/${limit}` : 'n/d'})`);

  if (!res.ok || hasErrors) {
    // Las respuestas con error no se guardan en caché.
    return { body, fromCache: false };
  }
  writeFileSync(cacheFile, JSON.stringify(body));
  return { body, fromCache: false };
}
