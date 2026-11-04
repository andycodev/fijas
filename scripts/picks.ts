// Genera los picks (proyección y probabilidad por línea) de los partidos por jugar.
// Uso: npx tsx --env-file=.env scripts/picks.ts
// El valor y el semáforo NO se calculan aquí: dependen de la cuota que escribe cada usuario
// (se calculan en la app). Por eso picks.value y picks.signal quedan vacíos.
import { createServiceClient, isMain, type Db } from './db.ts';
import { loadGames, type Game } from './history.ts';
import {
  DEFAULT_PARAMS, MODEL_VERSION, fitDispersion, minOdds, probOver, projectTotal, type TeamGame,
} from './model.ts';

export const LINES = [6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5];
const MIN_GAMES = 8; // partidos con córners que se exigen a cada equipo
const HOURS_AHEAD = 72;

function teamHistory(games: Game[]): Map<number, TeamGame[]> {
  const hist = new Map<number, TeamGame[]>();
  for (const g of games) {
    (hist.get(g.home) ?? hist.set(g.home, []).get(g.home)!).push({ corners_for: g.hc, corners_against: g.ac });
    (hist.get(g.away) ?? hist.set(g.away, []).get(g.away)!).push({ corners_for: g.ac, corners_against: g.hc });
  }
  return hist;
}

// Dispersión estimada con predicciones históricas de las dos últimas temporadas (sin mirar el futuro).
function historicalDispersion(games: Game[]): number {
  const lastSeason = games[games.length - 1]?.season ?? 0;
  const hist = new Map<number, TeamGame[]>();
  const pairs: { mean: number; actual: number }[] = [];
  let sumH = 0, sumA = 0, n = 0;
  for (const g of games) {
    const hh = hist.get(g.home) ?? [], ah = hist.get(g.away) ?? [];
    if (n >= 300 && hh.length >= MIN_GAMES && ah.length >= MIN_GAMES && g.season >= lastSeason - 1) {
      pairs.push({ mean: projectTotal(hh, ah, { homeMean: sumH / n, awayMean: sumA / n }).total, actual: g.hc + g.ac });
    }
    hist.set(g.home, [...hh, { corners_for: g.hc, corners_against: g.ac }]);
    hist.set(g.away, [...ah, { corners_for: g.ac, corners_against: g.hc }]);
    sumH += g.hc; sumA += g.ac; n++;
  }
  return fitDispersion(pairs);
}

export async function generatePicks(db: Db, log: (s: string) => void = console.log) {
  const games = await loadGames(db);
  if (games.length < 500) throw new Error('Hay muy pocos partidos con córners para generar picks.');

  const hist = teamHistory(games);
  const ref = {
    homeMean: games.reduce((s, g) => s + g.hc, 0) / games.length,
    awayMean: games.reduce((s, g) => s + g.ac, 0) / games.length,
  };
  const r = historicalDispersion(games);
  log(`Referencia: local ${ref.homeMean.toFixed(2)} · visitante ${ref.awayMean.toFixed(2)} · dispersión r=${Number.isFinite(r) ? r.toFixed(1) : '∞'}`);

  const now = new Date();
  const until = new Date(now.getTime() + HOURS_AHEAD * 3600_000);
  const { data: upcoming, error } = await db
    .from('matches')
    .select('id, home_team_id, away_team_id, kickoff_at')
    .eq('status', 'scheduled')
    .gte('kickoff_at', new Date(now.getTime() - 3 * 3600_000).toISOString())
    .lte('kickoff_at', until.toISOString());
  if (error) throw new Error(error.message);

  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const m of upcoming ?? []) {
    const hh = hist.get(m.home_team_id) ?? [], ah = hist.get(m.away_team_id) ?? [];
    if (hh.length < MIN_GAMES || ah.length < MIN_GAMES) { skipped++; continue; }
    const proj = projectTotal(hh, ah, ref, DEFAULT_PARAMS);
    for (const line of LINES) {
      const p = probOver(line, proj.total, r);
      rows.push({
        match_id: m.id, market: 'corners_total', line,
        projection: Math.round(proj.total * 100) / 100,
        probability: Math.round(p * 10000) / 10000,
        min_odds: Math.round(minOdds(p) * 100) / 100,
        model_version: MODEL_VERSION,
        generated_at: now.toISOString(),
      });
    }
  }
  if (rows.length) {
    const { error: e } = await db.from('picks').upsert(rows, { onConflict: 'match_id,market,line,model_version' });
    if (e) throw new Error(e.message);
  }
  log(`Picks: ${rows.length / LINES.length} partidos con proyección · ${skipped} sin historial suficiente`);
  return { matches: rows.length / LINES.length, skipped };
}

if (isMain(import.meta.url)) await generatePicks(createServiceClient());

// Rellena el resultado real de los picks de partidos ya terminados.
// hit = true cuando "más de" la línea acertó (córners reales > línea); false en caso contrario.
export async function settlePicks(db: Db, log: (s: string) => void = console.log) {
  const { data, error } = await db
    .from('picks')
    .select('match_id, matches!inner(status, match_stats!inner(home_corners_total, away_corners_total))')
    .is('actual_result', null)
    .eq('matches.status', 'finished')
    .not('matches.match_stats.home_corners_total', 'is', null)
    .not('matches.match_stats.away_corners_total', 'is', null);
  if (error) throw new Error(error.message);

  const totals = new Map<number, number>();
  for (const p of data as any[]) {
    const s = Array.isArray(p.matches.match_stats) ? p.matches.match_stats[0] : p.matches.match_stats;
    totals.set(p.match_id, s.home_corners_total + s.away_corners_total);
  }
  for (const [matchId, total] of totals) {
    const base = db.from('picks').update({ actual_result: total }).eq('match_id', matchId).is('actual_result', null);
    const { error: e1 } = await base;
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await db.from('picks').update({ hit: true }).eq('match_id', matchId).lt('line', total);
    if (e2) throw new Error(e2.message);
    const { error: e3 } = await db.from('picks').update({ hit: false }).eq('match_id', matchId).gt('line', total);
    if (e3) throw new Error(e3.message);
  }
  log(`Picks cerrados con resultado real: ${totals.size} partidos`);
  return { settled: totals.size };
}
