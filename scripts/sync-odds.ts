// Trae las cuotas de Betano (casa id 32 en API-Football) de goles y córners totales del partido completo
// para los partidos que tienen picks. 1 solicitud por partido (caché de 1 hora).
// Solo guarda líneas x.5 (las que modela el sistema) y solo de Betano: nunca mezcla casas.
// Uso: npx tsx --env-file=.env scripts/sync-odds.ts
import { createServiceClient, isMain, type Db } from './db.ts';
import { apiGet, requestsUsedToday } from './api-football.ts';
import { latestVersionPicks } from '../src/lib/opportunities.ts';

const BETANO_ID = 32;
const BETS = [
  { id: 5, market: 'goals_total' }, // "Goals Over/Under" (partido completo)
  { id: 45, market: 'corners_total' }, // "Corners Over Under" (partido completo)
] as const;
const MAX_FIXTURES = 40; // tope de solicitudes de cuotas por ejecución
const DAILY_RESERVE = 10; // solicitudes que se dejan sin usar en el día (para partidos nuevos y resultados)
const DEFAULT_CAP = 90;

export async function syncOdds(
  db: Db,
  log: (s: string) => void = console.log,
  opts: { activeLeagueIds?: number[]; minProbability?: number; dailyCap?: number } = {},
) {
  const now = new Date();
  let query = db
    .from('matches')
    .select('id, api_football_id, kickoff_at, league_id, picks!inner(id, market, probability, model_version, line)')
    .eq('status', 'scheduled')
    .not('api_football_id', 'is', null)
    .gt('kickoff_at', now.toISOString()) // un partido que ya empezó no necesita cuotas previas
    .lte('kickoff_at', new Date(now.getTime() + 72 * 3600_000).toISOString())
    .order('kickoff_at'); // los más cercanos primero: si el tope corta, se pierden los más lejanos
  if (opts.activeLeagueIds) query = query.in('league_id', opts.activeLeagueIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Solo se piden cuotas a partidos candidatos: con alguna línea que llegue a tu probabilidad mínima (más de o menos de).
  // Pedirlas para un partido sin ninguna línea probable gasta una solicitud sin posibilidad de recomendación.
  const min = opts.minProbability ?? 0;
  const candidates = [...new Map((data as any[]).map((m) => [m.id, m])).values()].filter((m) =>
    latestVersionPicks(m.picks).some((p: { probability: number | string }) => Math.max(Number(p.probability), 1 - Number(p.probability)) >= min),
  );
  const skipped = new Map((data as any[]).map((m) => [m.id, 1])).size - candidates.length;
  // Las ligas prioritarias (las que elegiste) primero; dentro de cada grupo, el partido más cercano.
  const priority = new Set(opts.activeLeagueIds ?? []);
  candidates.sort((a, b) => Number(priority.has(b.league_id)) - Number(priority.has(a.league_id)) || Date.parse(a.kickoff_at) - Date.parse(b.kickoff_at));
  // Presupuesto del día: lo que queda del tope, menos una reserva.
  const budget = Math.max(0, (opts.dailyCap ?? DEFAULT_CAP) - requestsUsedToday() - DAILY_RESERVE);
  const matches = candidates.slice(0, Math.min(MAX_FIXTURES, budget));
  if (skipped) log(`Cuotas: ${skipped} partido(s) sin ninguna línea con ${Math.round(min * 100)}% o más: no se piden sus cuotas.`);
  if (candidates.length > matches.length) log(`Cuotas: ${candidates.length - matches.length} candidato(s) quedan para otro análisis (presupuesto de API del día).`);
  let withOdds = 0, without = 0, rowsSaved = 0, stoppedByLimit = false;

  for (const m of matches) {
    let res;
    try {
      res = await apiGet('/odds', { fixture: m.api_football_id, bookmaker: BETANO_ID }, { maxAgeHours: 1 });
    } catch (e) {
      if (e instanceof Error && e.message.includes('Tope diario')) { stoppedByLimit = true; log(e.message); break; }
      throw e;
    }
    if (res.body.errors && Object.keys(res.body.errors).length) {
      log(`Cuotas: la API rechazó el partido ${m.api_football_id}: ${JSON.stringify(res.body.errors)}`);
      continue;
    }

    const entry = res.body.response?.[0];
    const betano = entry?.bookmakers?.find((b: any) => b.id === BETANO_ID);
    const capturedAt = entry?.update ?? new Date().toISOString();
    const rows: Record<string, unknown>[] = [];

    for (const bet of BETS) {
      const values: { value: string; odd: string }[] = betano?.bets?.find((b: any) => b.id === bet.id)?.values ?? [];
      const byLine = new Map<number, { over?: number; under?: number }>();
      for (const v of values) {
        const mt = v.value.match(/^(Over|Under) (\d+\.5)$/); // se ignoran líneas enteras y de cuarto
        if (!mt) continue;
        const line = Number(mt[2]);
        const slot = byLine.get(line) ?? {};
        slot[mt[1] === 'Over' ? 'over' : 'under'] = Number(v.odd);
        byLine.set(line, slot);
      }
      for (const [line, o] of byLine) {
        if (!(o.over && o.over > 1) && !(o.under && o.under > 1)) continue;
        rows.push({
          match_id: m.id, bookmaker: 'betano', market: bet.market, line,
          over_odds: o.over && o.over > 1 ? o.over : null,
          under_odds: o.under && o.under > 1 ? o.under : null,
          captured_at: capturedAt, origin: 'auto', user_id: null,
        });
      }
    }

    // Las cuotas anteriores de este partido se reemplazan: si Betano ya no las ofrece, desaparecen.
    const del = await db.from('odds').delete().eq('match_id', m.id).eq('origin', 'auto').eq('bookmaker', 'betano');
    if (del.error) throw new Error(del.error.message);
    if (rows.length) {
      const ins = await db.from('odds').insert(rows);
      if (ins.error) throw new Error(ins.error.message);
      withOdds++;
      rowsSaved += rows.length;
    } else {
      without++;
    }
  }

  log(`Cuotas de Betano: ${withOdds} partidos con cuotas (${rowsSaved} líneas), ${without} sin cuotas disponibles${stoppedByLimit ? ', detenido por el tope diario' : ''}. API-Football hoy: ${requestsUsedToday()}/90`);
  return { matches: matches.length, withOdds, without, rows: rowsSaved, apiRequestsToday: requestsUsedToday() };
}

if (isMain(import.meta.url)) await syncOdds(createServiceClient());
