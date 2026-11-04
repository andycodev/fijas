// Backtest del modelo de córners: predice cada partido con la información anterior a su fecha.
// Uso: npx tsx --env-file=.env scripts/backtest.ts
import { createServiceClient } from './db.ts';
import { loadGames, type CountMarket } from './history.ts';
import { fitDispersion, probOver, projectTotal, type ModelParams, type TeamGame } from './model.ts';

// Uso: npx tsx --env-file=.env scripts/backtest.ts [corners_total|goals_total]
const MARKET = (process.argv[2] ?? 'corners_total') as CountMarket;
const games = await loadGames(createServiceClient(), MARKET);
console.log(`Partidos con dato: ${games.length}`);

const LINES = MARKET === 'goals_total' ? [0.5, 1.5, 2.5, 3.5] : [8.5, 9.5, 10.5, 11.5];
const CALIB_LINE = MARKET === 'goals_total' ? 2.5 : 9.5;
const FIRST_EVAL_SEASON = 2024; // 2022 y 2023 sirven de arranque del historial
const MIN_GAMES = 8;

interface Pred { season: number; mean: number; baseMean: number; actual: number }

function run(params: ModelParams): Pred[] {
  const hist = new Map<number, TeamGame[]>();
  let sumH = 0, sumA = 0, n = 0;
  const out: Pred[] = [];
  for (const g of games) {
    const hh = hist.get(g.home) ?? [], ah = hist.get(g.away) ?? [];
    if (n >= 300 && hh.length >= MIN_GAMES && ah.length >= MIN_GAMES && g.season >= FIRST_EVAL_SEASON) {
      const ref = { homeMean: sumH / n, awayMean: sumA / n };
      out.push({ season: g.season, mean: projectTotal(hh, ah, ref, params).total, baseMean: ref.homeMean + ref.awayMean, actual: g.h + g.a });
    }
    hist.set(g.home, [...hh, { corners_for: g.h, corners_against: g.a }]);
    hist.set(g.away, [...ah, { corners_for: g.a, corners_against: g.h }]);
    sumH += g.h; sumA += g.a; n++;
  }
  return out;
}

function score(preds: Pred[], pick: 'mean' | 'baseMean', r: number) {
  let ll = 0, brier = 0, cnt = 0, ae = 0;
  for (const p of preds) {
    ae += Math.abs(p[pick] - p.actual);
    for (const line of LINES) {
      const pr = Math.min(0.999, Math.max(0.001, probOver(line, p[pick], r)));
      const y = p.actual > line ? 1 : 0;
      ll += -(y * Math.log(pr) + (1 - y) * Math.log(1 - pr));
      brier += (pr - y) ** 2;
      cnt++;
    }
  }
  return { logloss: ll / cnt, brier: brier / cnt, mae: ae / preds.length };
}

const f = (x: number) => x.toFixed(4);
let best: { k: number; ll: number; preds: Pred[]; r: number } | null = null;

console.log('\nK = peso de la media de la liga (en partidos) · N = 10 · líneas', LINES.join(', '));
const GRID = (process.env.GRID ?? '10:0,10:5,10:20,10:40,20:20,20:40,20:80,30:40,30:80').split(',').map((x) => x.split(':').map(Number) as [number, number]);
for (const [lastN, k] of GRID) {
  const preds = run({ lastN, shrinkK: k });
  const r = fitDispersion(preds.map((p) => ({ mean: p.mean, actual: p.actual })));
  const rb = fitDispersion(preds.map((p) => ({ mean: p.baseMean, actual: p.actual })));
  const m = score(preds, 'mean', r), b = score(preds, 'baseMean', rb);
  console.log(`N=${lastN} K=${String(k).padStart(2)}  n=${preds.length}  r=${Number.isFinite(r) ? r.toFixed(1) : '∞'}  modelo logloss=${f(m.logloss)} brier=${f(m.brier)} MAE=${m.mae.toFixed(3)}  | base (sin equipos) logloss=${f(b.logloss)} brier=${f(b.brier)} MAE=${b.mae.toFixed(3)}`);
  if (!best || m.logloss < best.ll) best = { k: lastN * 1000 + k, ll: m.logloss, preds, r };
}

console.log(`\nMejor combinación por logloss: N=${Math.floor(best!.k / 1000)} K=${best!.k % 1000}`);
for (const season of [...new Set(best!.preds.map((p) => p.season))].sort()) {
  const sub = best!.preds.filter((p) => p.season === season);
  const m = score(sub, 'mean', best!.r);
  const b = score(sub, 'baseMean', fitDispersion(sub.map((p) => ({ mean: p.baseMean, actual: p.actual }))));
  console.log(`  temporada ${season}: n=${sub.length} modelo logloss=${f(m.logloss)} vs base ${f(b.logloss)}`);
}

console.log(`\nCalibración, línea ${CALIB_LINE} (probabilidad prevista de "más de ${CALIB_LINE}" vs frecuencia real):`);
const buckets = [0, 0.3, 0.4, 0.5, 0.6, 0.7, 1.01];
for (let i = 0; i < buckets.length - 1; i++) {
  const sel = best!.preds.filter((p) => {
    const pr = probOver(CALIB_LINE, p.mean, best!.r);
    return pr >= buckets[i]! && pr < buckets[i + 1]!;
  });
  if (!sel.length) continue;
  const predAvg = sel.reduce((s, p) => s + probOver(CALIB_LINE, p.mean, best!.r), 0) / sel.length;
  const real = sel.filter((p) => p.actual > CALIB_LINE).length / sel.length;
  console.log(`  [${buckets[i]}–${Math.min(buckets[i + 1]!, 1)}) n=${String(sel.length).padStart(4)}  previsto=${(predAvg * 100).toFixed(1)}%  real=${(real * 100).toFixed(1)}%`);
}
