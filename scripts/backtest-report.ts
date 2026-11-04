// Calibración histórica por tramo de probabilidad, para goles y córners, guardada en src/data/backtest.json
// (la app la muestra y la usa para calcular la confianza estadística).
// Cada partido se predice solo con información anterior a su fecha.
// Uso: npx tsx --env-file=.env scripts/backtest-report.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServiceClient } from './db.ts';
import { loadGames } from './history.ts';
import { MARKETS } from './picks.ts';
import { fitDispersion, probOver, projectTotal, type TeamGame } from './model.ts';

const FIRST_EVAL_SEASON = 2024; // 2022-23 y 2023-24 sirven de arranque del historial
const MIN_GAMES = 8;
const BUCKETS = [
  { label: '50–59%', from: 0.5, to: 0.6 },
  { label: '60–69%', from: 0.6, to: 0.7 },
  { label: '70–74%', from: 0.7, to: 0.75 },
  { label: '75–79%', from: 0.75, to: 0.8 },
  { label: '80–84%', from: 0.8, to: 0.85 },
  { label: '85% o más', from: 0.85, to: 1.01 },
];

const db = createServiceClient();
const out: Record<string, unknown> = {};

for (const cfg of MARKETS) {
  const games = await loadGames(db, cfg.market);
  const hist = new Map<number, TeamGame[]>();
  let sumH = 0, sumA = 0, n = 0;
  const preds: { mean: number; actual: number }[] = [];

  for (const g of games) {
    const hh = hist.get(g.home) ?? [], ah = hist.get(g.away) ?? [];
    if (n >= 300 && hh.length >= MIN_GAMES && ah.length >= MIN_GAMES && g.season >= FIRST_EVAL_SEASON) {
      preds.push({ mean: projectTotal(hh, ah, { homeMean: sumH / n, awayMean: sumA / n }, cfg.params).total, actual: g.h + g.a });
    }
    hist.set(g.home, [...hh, { corners_for: g.h, corners_against: g.a }]);
    hist.set(g.away, [...ah, { corners_for: g.a, corners_against: g.h }]);
    sumH += g.h; sumA += g.a; n++;
  }

  const r = fitDispersion(preds);
  const acc = BUCKETS.map((b) => ({ ...b, n: 0, predicted: 0, hits: 0 }));
  for (const p of preds) {
    for (const line of cfg.lines) {
      const over = probOver(line, p.mean, r);
      for (const side of ['over', 'under'] as const) {
        const prob = side === 'over' ? over : 1 - over;
        const won = side === 'over' ? p.actual > line : p.actual < line;
        const bucket = acc.find((b) => prob >= b.from && prob < b.to);
        if (!bucket) continue;
        bucket.n++;
        bucket.predicted += prob;
        bucket.hits += won ? 1 : 0;
      }
    }
  }

  out[cfg.market] = {
    version: cfg.version,
    evaluatedMatches: preds.length,
    period: `${FIRST_EVAL_SEASON}-${String((FIRST_EVAL_SEASON + 1) % 100).padStart(2, '0')} en adelante`,
    buckets: acc.map((b) => ({
      label: b.label, from: b.from, to: Math.min(b.to, 1), n: b.n,
      predicted: b.n ? Math.round((b.predicted / b.n) * 1000) / 10 : null, // % medio previsto
      actual: b.n ? Math.round((b.hits / b.n) * 1000) / 10 : null, // % real de aciertos
    })),
  };

  console.log(`\n${cfg.market} (${preds.length} partidos evaluados)`);
  for (const b of (out[cfg.market] as { buckets: { label: string; n: number; predicted: number | null; actual: number | null }[] }).buckets) {
    console.log(`  ${b.label.padEnd(10)} n=${String(b.n).padStart(5)}  previsto=${b.predicted ?? '—'}%  real=${b.actual ?? '—'}%`);
  }
}

mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../src/data/backtest.json', import.meta.url),
  JSON.stringify({ generatedAt: new Date().toISOString(), markets: out }, null, 2),
);
console.log('\nGuardado en src/data/backtest.json');
