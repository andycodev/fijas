import { describe, expect, it } from 'vitest';
import { cumulativeSeries, evaluate, liveLabel, normalCdf, phaseOf, streaks, type EvalRow } from './evaluation';

const row = (result: EvalRow['result'], odds = 2, p = 0.6, market = 'goals_total', league = 'A', day = 1): EvalRow => ({
  market, league, model_probability: p, odds, ev: p * odds - 1, result, kickoff_at: `2026-11-0${day}T20:00:00Z`,
});

describe('evaluación del modelo', () => {
  it('cuenta ganadas, perdidas, canceladas y pendientes; las canceladas y pendientes no entran en el acierto', () => {
    const e = evaluate([row('won'), row('won'), row('lost'), row('void'), row('pending')], 10);
    expect(e.all).toMatchObject({ total: 5, resolved: 3, won: 2, lost: 1, void: 1, pending: 1, hitRate: 66.7 });
  });
  it('ROI teórico con una unidad por recomendación: ganar paga cuota−1, perder resta 1', () => {
    // 2 ganadas a 2.0 (+1 cada una) y 1 perdida (−1) → +1 unidad sobre 3 = +33.3 %
    const e = evaluate([row('won'), row('won'), row('lost')], 10);
    expect(e.all.roi).toBe(33.3);
    expect(e.profit).toBe(10); // 1 unidad × S/ 10
  });
  it('EV acumulado = suma del valor esperado de lo ya resuelto, por la unidad', () => {
    const e = evaluate([row('won', 2, 0.6), row('lost', 2, 0.6), row('pending', 2, 0.6)], 10);
    expect(e.expectedProfit).toBe(4); // (0.2 + 0.2) × 10
  });
  it('separa por mercado, liga y tramo de probabilidad', () => {
    const e = evaluate([row('won', 2, 0.8, 'corners_total', 'B'), row('lost', 2, 0.7, 'goals_total', 'A')], 10);
    expect(e.byMarket.find((g) => g.key === 'corners_total')!.won).toBe(1);
    expect(e.byLeague.map((g) => g.key).sort()).toEqual(['A', 'B']);
    expect(e.byConfidence.find((g) => g.key === '75% – 84%')!.total).toBe(1);
    expect(e.byConfidence.find((g) => g.key === '65% – 74%')!.total).toBe(1);
  });
  it('con pocas recomendaciones no se concluye nada', () => {
    expect(evaluate(Array.from({ length: 10 }, () => row('won')), 10).evidence.verdict).toBe('insufficient');
    expect(evaluate([], 10).evidence.verdict).toBe('none');
  });
  it('con muestra suficiente y aciertos muy por encima del azar, se reconoce ventaja', () => {
    const rows = [...Array.from({ length: 80 }, () => row('won', 1.8, 0.7)), ...Array.from({ length: 30 }, () => row('lost', 1.8, 0.7))];
    const e = evaluate(rows, 10);
    expect(e.evidence.enough).toBe(true);
    expect(e.evidence.verdict).toBe('edge');
    expect(e.evidence.pValue!).toBeLessThan(0.05);
  });
  it('con muestra suficiente y ROI negativo, no hay ventaja', () => {
    const rows = [...Array.from({ length: 40 }, () => row('won', 1.5, 0.7)), ...Array.from({ length: 70 }, () => row('lost', 1.5, 0.7))];
    expect(evaluate(rows, 10).evidence.verdict).toBe('no_edge');
  });
});

describe('rachas y probabilidad normal', () => {
  it('racha actual y mejores rachas, ordenadas por fecha del partido', () => {
    const rows = [row('won', 2, 0.6, 'goals_total', 'A', 1), row('won', 2, 0.6, 'goals_total', 'A', 2), row('lost', 2, 0.6, 'goals_total', 'A', 3), row('lost', 2, 0.6, 'goals_total', 'A', 4), row('lost', 2, 0.6, 'goals_total', 'A', 5)];
    expect(streaks(rows)).toEqual({ current: -3, bestWon: 2, bestLost: 3 });
  });
  it('la cdf normal es correcta en puntos conocidos', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    expect(normalCdf(1.645)).toBeCloseTo(0.95, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe('fases de una recomendación', () => {
  const now = Date.parse('2026-11-05T20:00:00Z');
  const at = (h: number) => new Date(now + h * 3600_000).toISOString();
  it('pendiente si el partido no empezó; en curso si empezó sin resultado; finalizada si ya tiene estado', () => {
    expect(phaseOf({ result: 'pending', kickoff_at: at(2) }, now)).toBe('upcoming');
    expect(phaseOf({ result: 'pending', kickoff_at: at(-1) }, now)).toBe('live');
    expect(phaseOf({ result: 'pending', kickoff_at: at(-30) }, now)).toBe('live');
    for (const result of ['won', 'lost', 'void'] as const) expect(phaseOf({ result, kickoff_at: at(2) }, now)).toBe('done');
  });
  it('en curso distingue partido en juego, esperando resultado y aplazado', () => {
    expect(liveLabel({ kickoff_at: at(-1) }, 'finished', now)).toBe('En juego');
    expect(liveLabel({ kickoff_at: at(-3) }, 'finished', now)).toBe('Esperando resultado');
    expect(liveLabel({ kickoff_at: at(-3) }, 'postponed', now)).toBe('Aplazado');
  });
});

describe('ganancia acumulada', () => {
  it('suma cuota−1 al ganar y resta 1 al perder, en orden de fecha, y acumula el EV esperado', () => {
    const rows = [row('lost', 2, 0.6, 'goals_total', 'A', 2), row('won', 2, 0.6, 'goals_total', 'A', 1), row('pending', 2, 0.6, 'goals_total', 'A', 3), row('void', 2, 0.6, 'goals_total', 'A', 4)];
    const s = cumulativeSeries(rows, 10);
    expect(s.map((p) => [p.n, p.real, p.expected])).toEqual([[1, 10, 2], [2, 0, 4]]); // gana +1 y luego pierde −1 (× S/ 10)
  });
  it('sin resueltas no hay serie', () => {
    expect(cumulativeSeries([row('pending')], 10)).toEqual([]);
  });
});

describe('categorías', () => {
  it('las recomendaciones de estudio se miden aparte de las principales; sin categoría cuentan como principales', () => {
    const rows: EvalRow[] = [{ ...row('won') }, { ...row('lost'), category: 'low_value' }, { ...row('lost'), category: 'low_value' }];
    const e = evaluate(rows, 10);
    expect(e.byCategory.find((g) => g.key === 'main')).toMatchObject({ total: 1, won: 1 });
    expect(e.byCategory.find((g) => g.key === 'low_value')).toMatchObject({ total: 2, lost: 2 });
  });
});
