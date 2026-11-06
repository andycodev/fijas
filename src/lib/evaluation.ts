// Evaluación del modelo con sus recomendaciones congeladas. Todo es teórico: una unidad fija por recomendación,
// sin dinero real. Función pura: recibe las filas y devuelve cifras.

export type RecResult = 'pending' | 'won' | 'lost' | 'void';

export interface EvalRow {
  market: string;
  league: string | null;
  model_probability: number;
  odds: number;
  ev: number;
  result: RecResult;
  kickoff_at: string | null;
  category?: 'main' | 'low_value'; // principal (valor ≥ umbral) o de estudio (valor entre 0 y el umbral)
}

export interface Group {
  key: string;
  total: number;
  resolved: number; // ganadas + perdidas
  won: number;
  lost: number;
  void: number;
  pending: number;
  hitRate: number | null; // 0-100
  avgProbability: number | null; // 0-100, de las resueltas
  avgOdds: number | null;
  roi: number | null; // % sobre lo apostado teóricamente
  profitUnits: number; // ganancia teórica en unidades
}

const num = (x: unknown) => Number(x);
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function group(key: string, rows: EvalRow[]): Group {
  const won = rows.filter((r) => r.result === 'won');
  const lost = rows.filter((r) => r.result === 'lost');
  const done = [...won, ...lost];
  const profit = won.reduce((s, r) => s + (num(r.odds) - 1), 0) - lost.length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgP = mean(done.map((r) => num(r.model_probability)));
  const avgO = mean(done.map((r) => num(r.odds)));
  return {
    key,
    total: rows.length,
    resolved: done.length,
    won: won.length,
    lost: lost.length,
    void: rows.filter((r) => r.result === 'void').length,
    pending: rows.filter((r) => r.result === 'pending').length,
    hitRate: done.length ? round((won.length / done.length) * 100) : null,
    avgProbability: avgP === null ? null : round(avgP * 100),
    avgOdds: avgO === null ? null : round(avgO, 2),
    roi: done.length ? round((profit / done.length) * 100) : null,
    profitUnits: round(profit, 2),
  };
}

// Probabilidad acumulada de la normal estándar (aproximación de Abramowitz-Stegun).
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// Rachas por orden de fecha del partido. «current» es positiva si son aciertos seguidos y negativa si son fallos.
export function streaks(rows: Pick<EvalRow, 'result' | 'kickoff_at'>[]) {
  const done = rows
    .filter((r) => r.result === 'won' || r.result === 'lost')
    .sort((a, b) => Date.parse(a.kickoff_at ?? '') - Date.parse(b.kickoff_at ?? ''));
  let bestWon = 0;
  let bestLost = 0;
  let run = 0;
  for (const r of done) {
    const dir = r.result === 'won' ? 1 : -1;
    run = Math.sign(run) === dir ? run + dir : dir;
    if (run > bestWon) bestWon = run;
    if (-run > bestLost) bestLost = -run;
  }
  return { current: run, bestWon, bestLost };
}

export const MIN_FOR_CONCLUSION = 100; // con menos, el azar domina cualquier ROI

export const CONFIDENCE_BANDS = [
  { key: 'Menos de 65%', from: 0, to: 0.65 },
  { key: '65% – 74%', from: 0.65, to: 0.75 },
  { key: '75% – 84%', from: 0.75, to: 0.85 },
  { key: '85% o más', from: 0.85, to: 1.01 },
];

export type Verdict = 'none' | 'insufficient' | 'edge' | 'no_edge' | 'inconclusive';

export function evaluate(rows: EvalRow[], unit: number) {
  const all = group('Total', rows);
  const done = rows.filter((r) => r.result === 'won' || r.result === 'lost');

  // ¿Acierta más de lo que corresponde por azar? Con la cuota de Betano, acertar «de casualidad» equivale a 1/cuota.
  // Se compara lo acertado con ese umbral de equilibrio (z de una suma de Bernoulli) y con lo que el modelo prevé.
  const be = done.map((r) => 1 / num(r.odds));
  const hits = done.filter((r) => r.result === 'won').length;
  const beExpected = be.reduce((a, b) => a + b, 0);
  const beVar = be.reduce((s, q) => s + q * (1 - q), 0);
  const zBreakEven = beVar > 0 ? (hits - beExpected) / Math.sqrt(beVar) : null;
  const modelExpected = done.reduce((s, r) => s + num(r.model_probability), 0);
  const modelVar = done.reduce((s, r) => s + num(r.model_probability) * (1 - num(r.model_probability)), 0);
  const zModel = modelVar > 0 ? (hits - modelExpected) / Math.sqrt(modelVar) : null;

  const evUnits = done.reduce((s, r) => s + num(r.ev), 0);
  const enough = all.resolved >= MIN_FOR_CONCLUSION;
  const pValue = zBreakEven === null ? null : round(1 - normalCdf(zBreakEven), 4);

  let verdict: Verdict = 'none';
  if (all.resolved > 0) {
    verdict = !enough ? 'insufficient' : all.roi! > 0 && pValue !== null && pValue < 0.05 ? 'edge' : all.roi! <= 0 ? 'no_edge' : 'inconclusive';
  }

  const byLeague = new Map<string, EvalRow[]>();
  for (const r of rows) {
    const k = r.league ?? 'Sin liga';
    byLeague.set(k, [...(byLeague.get(k) ?? []), r]);
  }

  return {
    all,
    unit,
    profit: round(all.profitUnits * unit, 2), // ganancia teórica en dinero
    expectedProfit: round(evUnits * unit, 2), // «EV acumulado»: lo que el modelo esperaba ganar con lo ya resuelto
    byCategory: (['main', 'low_value'] as const).map((c) => group(c, rows.filter((r) => (r.category ?? 'main') === c))),
    byMarket: ['goals_total', 'corners_total'].map((m) => group(m, rows.filter((r) => r.market === m))),
    byLeague: [...byLeague.entries()].map(([k, v]) => group(k, v)).sort((a, b) => b.total - a.total),
    byConfidence: CONFIDENCE_BANDS.map((b) => group(b.key, rows.filter((r) => num(r.model_probability) >= b.from && num(r.model_probability) < b.to))),
    streaks: streaks(rows),
    evidence: {
      verdict,
      enough,
      resolved: all.resolved,
      hits,
      expectedHitsBreakEven: round(beExpected, 1),
      expectedHitsModel: round(modelExpected, 1),
      zBreakEven: zBreakEven === null ? null : round(zBreakEven, 2),
      zModel: zModel === null ? null : round(zModel, 2),
      pValue, // probabilidad de acertar tanto o más solo por suerte
      breakEvenRate: done.length ? round((beExpected / done.length) * 100) : null,
    },
  };
}

// Fase de una recomendación, para no mezclar lo que aún no empieza, lo que espera resultado y lo ya evaluado.
//  · upcoming: el partido aún no empieza.
//  · live: ya empezó y todavía no hay resultado (en juego, o terminado y esperando que se registre / aplazado).
//  · done: ganada, perdida o cancelada.
export type Phase = 'upcoming' | 'live' | 'done';
export const MATCH_MINUTES = 135; // 90' + descanso + descuento

export function phaseOf(r: { result: RecResult; kickoff_at: string | null }, now: number = Date.now()): Phase {
  if (r.result !== 'pending') return 'done';
  const ko = r.kickoff_at ? Date.parse(r.kickoff_at) : NaN;
  return Number.isFinite(ko) && ko > now ? 'upcoming' : 'live';
}

// Texto corto para una recomendación en curso.
export function liveLabel(r: { kickoff_at: string | null }, matchStatus: string | null, now: number = Date.now()): string {
  if (matchStatus === 'postponed') return 'Aplazado';
  const ko = r.kickoff_at ? Date.parse(r.kickoff_at) : NaN;
  return Number.isFinite(ko) && now - ko < MATCH_MINUTES * 60_000 ? 'En juego' : 'Esperando resultado';
}

// Ganancia teórica acumulada, recomendación a recomendación (por fecha del partido), frente a la que el modelo esperaba (EV).
// Si el modelo tiene ventaja real, la línea «real» se mantiene por encima de cero y se parece a la «esperada».
export function cumulativeSeries<T extends EvalRow>(rows: T[], unit: number) {
  const done = rows
    .filter((r) => r.result === 'won' || r.result === 'lost')
    .sort((a, b) => Date.parse(a.kickoff_at ?? '') - Date.parse(b.kickoff_at ?? ''));
  let real = 0;
  let expected = 0;
  return done.map((row, i) => {
    real += row.result === 'won' ? num(row.odds) - 1 : -1;
    expected += num(row.ev);
    return { n: i + 1, row, real: round(real * unit, 2), expected: round(expected * unit, 2) };
  });
}
