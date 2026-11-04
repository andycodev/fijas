// Genera los picks (proyección y probabilidad por línea) de los partidos por jugar, para
// córners totales y goles totales (partido completo).
// Uso: npx tsx --env-file=.env scripts/picks.ts
// El valor y el semáforo NO se calculan aquí: dependen de la cuota que escribe cada usuario
// (se calculan en la app). Por eso picks.value y picks.signal quedan vacíos.
import { createServiceClient, isMain, type Db } from './db.ts';
import { STAT_COLUMNS, loadGames, type CountMarket, type Game } from './history.ts';
import {
  DEFAULT_PARAMS, MODEL_VERSION, fitDispersion, minOdds, probOver, projectTotal, type ModelParams, type TeamGame,
} from './model.ts';

interface MarketConfig {
  market: CountMarket;
  version: string;
  lines: number[]; // líneas "más de" x.5; el "menos de" es el complemento
  params: ModelParams;
}

// Parámetros elegidos con scripts/backtest.ts para cada mercado.
export const MARKETS: MarketConfig[] = [
  { market: 'corners_total', version: MODEL_VERSION, lines: [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5], params: DEFAULT_PARAMS },
  { market: 'goals_total', version: 'g1-nb-n10-k20', lines: [0.5, 1.5, 2.5, 3.5, 4.5], params: { lastN: 10, shrinkK: 20 } },
];

const MIN_GAMES = 8; // partidos con dato que se exigen a cada equipo
const HOURS_AHEAD = 72;

function teamHistory(games: Game[]): Map<number, TeamGame[]> {
  const hist = new Map<number, TeamGame[]>();
  for (const g of games) {
    (hist.get(g.home) ?? hist.set(g.home, []).get(g.home)!).push({ corners_for: g.h, corners_against: g.a });
    (hist.get(g.away) ?? hist.set(g.away, []).get(g.away)!).push({ corners_for: g.a, corners_against: g.h });
  }
  return hist;
}

// Dispersión estimada con predicciones históricas de las dos últimas temporadas (sin mirar el futuro).
function historicalDispersion(games: Game[], params: ModelParams): number {
  const lastSeason = games[games.length - 1]?.season ?? 0;
  const hist = new Map<number, TeamGame[]>();
  const pairs: { mean: number; actual: number }[] = [];
  let sumH = 0, sumA = 0, n = 0;
  for (const g of games) {
    const hh = hist.get(g.home) ?? [], ah = hist.get(g.away) ?? [];
    if (n >= 300 && hh.length >= MIN_GAMES && ah.length >= MIN_GAMES && g.season >= lastSeason - 1) {
      pairs.push({ mean: projectTotal(hh, ah, { homeMean: sumH / n, awayMean: sumA / n }, params).total, actual: g.h + g.a });
    }
    hist.set(g.home, [...hh, { corners_for: g.h, corners_against: g.a }]);
    hist.set(g.away, [...ah, { corners_for: g.a, corners_against: g.h }]);
    sumH += g.h; sumA += g.a; n++;
  }
  return fitDispersion(pairs);
}

export async function generatePicks(db: Db, log: (s: string) => void = console.log) {
  const now = new Date();
  const until = new Date(now.getTime() + HOURS_AHEAD * 3600_000);
  const { data: upcoming, error } = await db
    .from('matches')
    .select('id, home_team_id, away_team_id, kickoff_at')
    .eq('status', 'scheduled')
    .gte('kickoff_at', new Date(now.getTime() - 3 * 3600_000).toISOString())
    .lte('kickoff_at', until.toISOString());
  if (error) throw new Error(error.message);

  const withPicks = new Set<number>();
  const byMarket: Record<string, number> = {};
  let skipped = 0;

  for (const cfg of MARKETS) {
    const games = await loadGames(db, cfg.market);
    if (games.length < 500) throw new Error(`Hay muy pocos partidos con datos de ${cfg.market} para generar picks.`);
    const hist = teamHistory(games);
    const ref = {
      homeMean: games.reduce((s, g) => s + g.h, 0) / games.length,
      awayMean: games.reduce((s, g) => s + g.a, 0) / games.length,
    };
    const r = historicalDispersion(games, cfg.params);
    log(`${cfg.market}: local ${ref.homeMean.toFixed(2)} · visitante ${ref.awayMean.toFixed(2)} · dispersión ${Number.isFinite(r) ? `r=${r.toFixed(1)}` : 'Poisson'}`);

    const rows: Record<string, unknown>[] = [];
    let count = 0;
    for (const m of upcoming ?? []) {
      const hh = hist.get(m.home_team_id) ?? [], ah = hist.get(m.away_team_id) ?? [];
      if (hh.length < MIN_GAMES || ah.length < MIN_GAMES) { if (cfg.market === 'corners_total') skipped++; continue; }
      const proj = projectTotal(hh, ah, ref, cfg.params);
      count++;
      withPicks.add(m.id);
      for (const line of cfg.lines) {
        const p = probOver(line, proj.total, r);
        rows.push({
          match_id: m.id, market: cfg.market, line,
          projection: Math.round(proj.total * 100) / 100,
          probability: Math.round(p * 10000) / 10000,
          min_odds: Math.round(minOdds(Math.max(p, 0.0001)) * 100) / 100,
          model_version: cfg.version,
          generated_at: now.toISOString(),
        });
      }
    }
    if (rows.length) {
      const { error: e } = await db.from('picks').upsert(rows, { onConflict: 'match_id,market,line,model_version' });
      if (e) throw new Error(e.message);
    }
    byMarket[cfg.market] = count;
    log(`  ${cfg.market}: ${count} partidos con proyección`);
  }
  log(`Picks: ${withPicks.size} partidos con proyección · ${skipped} sin historial suficiente`);
  return { matches: withPicks.size, skipped, byMarket };
}

// Rellena el resultado real de los picks de partidos ya terminados.
// hit = true cuando "más de" la línea acertó (valor real > línea); false en caso contrario.
export async function settlePicks(db: Db, log: (s: string) => void = console.log) {
  let settled = 0;
  for (const cfg of MARKETS) {
    const cols = STAT_COLUMNS[cfg.market];
    const { data, error } = await db
      .from('picks')
      .select(`match_id, matches!inner(status, match_stats!inner(${cols.home}, ${cols.away}))`)
      .eq('market', cfg.market)
      .is('actual_result', null)
      .eq('matches.status', 'finished')
      .not(`matches.match_stats.${cols.home}`, 'is', null)
      .not(`matches.match_stats.${cols.away}`, 'is', null);
    if (error) throw new Error(error.message);

    const totals = new Map<number, number>();
    for (const p of data as any[]) {
      const s = Array.isArray(p.matches.match_stats) ? p.matches.match_stats[0] : p.matches.match_stats;
      totals.set(p.match_id, s[cols.home] + s[cols.away]);
    }
    for (const [matchId, total] of totals) {
      const { error: e1 } = await db.from('picks').update({ actual_result: total })
        .eq('match_id', matchId).eq('market', cfg.market).is('actual_result', null);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await db.from('picks').update({ hit: true })
        .eq('match_id', matchId).eq('market', cfg.market).lt('line', total);
      if (e2) throw new Error(e2.message);
      const { error: e3 } = await db.from('picks').update({ hit: false })
        .eq('match_id', matchId).eq('market', cfg.market).gt('line', total);
      if (e3) throw new Error(e3.message);
    }
    settled += totals.size;
  }
  log(`Picks cerrados con resultado real: ${settled} partidos`);
  return { settled };
}

if (isMain(import.meta.url)) await generatePicks(createServiceClient());
