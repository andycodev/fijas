// Resolución automática de recomendaciones: busca el resultado real de los partidos que ya deberían haber terminado
// y cierra cada recomendación comparando la selección ORIGINAL con ese resultado (no se vuelve a ejecutar el modelo).
//
// Para gastar lo mínimo de API:
//   1) Solo mira recomendaciones pendientes de partidos que ya pasaron su duración normal (kickoff + 2 h 15 min).
//   2) Cada partido se consulta como máximo cada 45 min (matches.result_checked_at).
//   3) Primero usa Football-Data.co.uk (gratis, sin cupo de API) para las ligas que cubre.
//   4) Lo que falta se pide a API-Football en bloques de hasta 20 partidos por solicitud; los córners cuestan 1 solicitud por partido.
//   5) Respeta el tope diario configurado: si se alcanza, se detiene y reintenta más tarde.
import { createServiceClient, isMain, type Db } from './db.ts';
import { apiGet, configureUsage } from './api-football.ts';
import { loadFootballData } from './load-football-data.ts';
import { settlePicks } from './picks.ts';
import { settleRecommendations } from './recommendations.ts';

const MATCH_MINUTES = 135; // 90' + descanso + descuento: antes de esto un partido no puede haber terminado
const RECHECK_MINUTES = 45;
const POSTPONED_RECHECK_MINUTES = 6 * 60; // un partido aplazado se revisa con menos frecuencia

export type ApiStatus = 'finished' | 'finished_extra' | 'postponed' | 'cancelled' | 'live' | 'scheduled';

// Estado del proveedor → estado interno. «finished_extra» = terminó en tiempo extra o penales.
export function apiStatusOf(short: string): ApiStatus {
  if (short === 'FT') return 'finished';
  if (short === 'AET' || short === 'PEN') return 'finished_extra';
  if (['PST', 'SUSP', 'INT'].includes(short)) return 'postponed';
  if (['CANC', 'ABD', 'AWD', 'WO'].includes(short)) return 'cancelled';
  if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(short)) return 'live';
  return 'scheduled'; // NS, TBD
}

export interface ResolveSummary {
  pendingBefore: number;
  due: number; // partidos que ya deberían haber terminado y se revisaron
  resolved: number; // recomendaciones cerradas en esta pasada
  voided: number;
  apiRequests: number;
  apiStopped: boolean;
  skipped: boolean; // true si no había nada que revisar
}

const currentSeason = () => {
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
};

const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

let inFlight: Promise<ResolveSummary> | null = null;

// Una sola revisión a la vez: si ya hay una en curso (temporizador o app), se comparte su resultado.
export function resolvePending(
  db: Db = createServiceClient(),
  log: (s: string) => void = console.log,
  opts: { now?: Date; apiCap?: number } = {},
): Promise<ResolveSummary> {
  inFlight ??= resolveOnce(db, log, opts).finally(() => { inFlight = null; });
  return inFlight;
}

async function resolveOnce(
  db: Db = createServiceClient(),
  log: (s: string) => void = console.log,
  opts: { now?: Date; apiCap?: number } = {},
): Promise<ResolveSummary> {
  const now = opts.now ?? new Date();
  const empty: ResolveSummary = { pendingBefore: 0, due: 0, resolved: 0, voided: 0, apiRequests: 0, apiStopped: false, skipped: true };

  const pending = must(
    await db
      .from('recommendations')
      .select('id, user_id, match_id, market, kickoff_at, matches!inner(id, status, api_football_id, league_id, kickoff_at, result_checked_at, leagues(football_data_code))')
      .eq('result', 'pending'),
  ) as any[];
  if (!pending.length) return empty;

  // Una pasada rápida por si ya hay resultados guardados (p. ej. cargados por «Analizar»).
  let resolved = await settleRecommendations(db);

  const dueCutoff = now.getTime() - MATCH_MINUTES * 60_000;
  const stillPending = must(await db.from('recommendations').select('id, match_id, market').eq('result', 'pending')) as any[];
  const pendingIds = new Set(stillPending.map((r) => r.id));
  const due = new Map<number, { match: any; markets: Set<string> }>();
  for (const r of pending) {
    if (!pendingIds.has(r.id)) continue;
    const m = r.matches;
    // Si el partido se reprogramó, manda la fecha nueva: no se consulta antes de que pueda haber terminado.
    const kickoff = Math.max(Date.parse(r.kickoff_at ?? m.kickoff_at), Date.parse(m.kickoff_at));
    if (kickoff > dueCutoff) continue; // aún puede estar en juego: sigue pendiente
    const gap = m.status === 'postponed' ? POSTPONED_RECHECK_MINUTES * 60_000 : RECHECK_MINUTES * 60_000;
    if (m.result_checked_at && Date.parse(m.result_checked_at) > now.getTime() - gap) continue; // consultado hace poco
    const entry = due.get(m.id) ?? { match: m, markets: new Set<string>() };
    entry.markets.add(r.market);
    due.set(m.id, entry);
  }
  const summary: ResolveSummary = { pendingBefore: pending.length, due: due.size, resolved, voided: 0, apiRequests: 0, apiStopped: false, skipped: due.size === 0 && resolved === 0 };
  if (!due.size) return summary;
  log(`Recomendaciones pendientes de ${due.size} partido(s) que ya deberían haber terminado.`);

  // 1) Football-Data.co.uk (gratis): solo las ligas que cubre y que tienen partidos por resolver.
  const fdLeagues = [...new Set([...due.values()].filter((d) => d.match.leagues?.football_data_code).map((d) => d.match.league_id as number))];
  if (fdLeagues.length) {
    try {
      await loadFootballData(db, [currentSeason()], log, fdLeagues);
      await settlePicks(db, log);
      resolved += await settleRecommendations(db);
    } catch (e) {
      log(`Football-Data no disponible ahora: ${(e as Error).message}`);
    }
  }

  // 2) API-Football para lo que siga sin resultado.
  const open = new Set(
    (must(await db.from('recommendations').select('match_id').eq('result', 'pending')) as any[]).map((r) => r.match_id as number),
  );
  const needApi = [...due.values()].filter((d) => open.has(d.match.id) && d.match.api_football_id);
  if (needApi.length) {
    if (opts.apiCap) configureUsage(db, { cap: opts.apiCap });
    try {
      // El plan gratis NO permite pedir varios partidos por id. Se usa lo que sí permite:
      //  · una solicitud por DÍA (/fixtures?date=) trae todos los partidos de ese día: un solo pedido cubre a todos los pendientes de ese día;
      //  · los partidos de hace más de un día (fuera de lo que admite «date») se piden de uno en uno (/fixtures?id=).
      const fixtures = new Map<number, any>();
      const apiOk = (res: { body: any }, what: string): boolean => {
        const errors = res.body.errors && Object.keys(res.body.errors).length ? res.body.errors : null;
        if (errors) log(`La API rechazó ${what}: ${JSON.stringify(errors)}`);
        return !errors;
      };
      const todayMs = Date.parse(now.toISOString().slice(0, 10));
      const dates = new Set<string>();
      const single: any[] = [];
      for (const d of needApi) {
        const day = String(d.match.kickoff_at).slice(0, 10);
        const diff = (Date.parse(day) - todayMs) / 86_400_000;
        if (diff >= -1 && diff <= 1) dates.add(day);
        else single.push(d);
      }
      for (const day of dates) {
        const res = await apiGet('/fixtures', { date: day }, { maxAgeHours: 0.4 });
        summary.apiRequests += res.fromCache ? 0 : 1;
        if (apiOk(res, `los partidos del ${day}`)) for (const f of res.body.response as any[]) fixtures.set(f.fixture.id, f);
      }
      for (const d of single) {
        const id = d.match.api_football_id as number;
        if (fixtures.has(id)) continue;
        const res = await apiGet('/fixtures', { id }, { maxAgeHours: 0.4 });
        summary.apiRequests += res.fromCache ? 0 : 1;
        if (apiOk(res, `el partido ${id}`)) for (const f of res.body.response as any[]) fixtures.set(f.fixture.id, f);
      }

      for (const entry of needApi) {
        const f = fixtures.get(entry.match.api_football_id as number);
        if (!f) continue;
        const matchId = entry.match.id as number;
        const st = apiStatusOf(f.fixture.status.short);

        if (st === 'postponed' || st === 'cancelled') {
          must(await db.from('matches').update({ status: st }).eq('id', matchId));
          continue; // cancelado → la base lo anula; aplazado → sigue pendiente hasta que se juegue o pasen 7 días
        }
        if (st !== 'finished' && st !== 'finished_extra') continue; // en curso o sin empezar: pendiente

        must(await db.from('matches').update({ status: 'finished' }).eq('id', matchId));
        // Goles de los 90 minutos (score.fulltime no incluye tiempo extra ni penales).
        const gh = f.score?.fulltime?.home, ga = f.score?.fulltime?.away;
        if (gh !== null && gh !== undefined && ga !== null && ga !== undefined) {
          const upd = must(await db.from('match_stats').update({ home_goals_total: gh, away_goals_total: ga }).eq('match_id', matchId).select('match_id')) as any[];
          if (!upd.length) must(await db.from('match_stats').insert({ match_id: matchId, home_goals_total: gh, away_goals_total: ga, source: 'api_football' }));
        }
        if (!entry.markets.has('corners_total')) continue;

        if (st === 'finished_extra') {
          // Los córners que da la API incluyen el tiempo extra y no se pueden separar de los 90': se anula, no se adivina.
          await db.rpc('void_recommendations', { p_match_id: matchId, p_market: 'corners_total', p_note: 'Tiempo extra: los córners de los 90 minutos no se pueden separar' });
          continue;
        }
        const stats = await apiGet('/fixtures/statistics', { fixture: f.fixture.id });
        summary.apiRequests += stats.fromCache ? 0 : 1;
        const corners = (stats.body.response as any[]).map(
          (t) => (t.statistics as any[]).find((x) => x.type === 'Corner Kicks')?.value as number | null | undefined,
        );
        if (corners.length === 2 && corners.every((c) => typeof c === 'number')) {
          const upd = must(await db.from('match_stats').update({ home_corners_total: corners[0], away_corners_total: corners[1] }).eq('match_id', matchId).select('match_id')) as any[];
          if (!upd.length) must(await db.from('match_stats').insert({ match_id: matchId, home_corners_total: corners[0], away_corners_total: corners[1], source: 'api_football' }));
        } else {
          log(`Sin córners publicados todavía para el partido ${matchId}; se reintentará.`);
        }
      }
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes('Tope diario')) throw e;
      summary.apiStopped = true;
      log(`${e.message} Se reintentará más tarde.`);
    }
    await settlePicks(db, log);
    resolved += await settleRecommendations(db);
  }

  // 3) Marca la consulta para no repetirla enseguida.
  must(await db.from('matches').update({ result_checked_at: now.toISOString() }).in('id', [...due.keys()]));

  const left = (must(await db.from('recommendations').select('id').eq('result', 'pending')) as any[]).length;
  summary.resolved = resolved;
  summary.skipped = false;
  log(`Recomendaciones cerradas: ${resolved}. Pendientes: ${left}. Solicitudes de API: ${summary.apiRequests}.`);
  return summary;
}

if (isMain(import.meta.url)) await resolvePending();
