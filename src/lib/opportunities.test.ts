import { describe, expect, it } from 'vitest';
import { confidenceFor, findOpportunities, resolveOdds } from './opportunities';
import type { OddsRow, UpcomingMatch } from '../types/db';

const match: UpcomingMatch = {
  id: 1,
  kickoff_at: '2026-11-05T20:00:00Z',
  league: { name: 'Liga' },
  home: { name: 'A' },
  away: { name: 'B' },
  picks: [{ id: 10, market: 'corners_total', line: 8.5, projection: 10, probability: 0.65, min_odds: 1.54, model_version: 'x' }],
};

const row = (over: Partial<OddsRow>): OddsRow => ({
  id: 1, match_id: 1, market: 'corners_total', line: 8.5, over_odds: 1.7, under_odds: 2.2,
  origin: 'auto', captured_at: '2026-11-04T08:00:00Z', ...over,
});

describe('resolveOdds', () => {
  it('la cuota manual manda sobre la del proveedor', () => {
    const r = resolveOdds([row({ origin: 'auto', over_odds: 1.7 }), row({ id: 2, origin: 'manual', over_odds: 1.65 })], 1, 'corners_total', 8.5, 'over');
    expect(r).toMatchObject({ odds: 1.65, origin: 'manual' });
  });
  it('devuelve null si no hay cuota para esa selección', () => {
    expect(resolveOdds([row({ under_odds: null })], 1, 'corners_total', 8.5, 'under')).toBeNull();
    expect(resolveOdds([], 1, 'corners_total', 8.5, 'over')).toBeNull();
  });
  it('no mezcla mercados ni líneas', () => {
    expect(resolveOdds([row({ market: 'goals_total' })], 1, 'corners_total', 8.5, 'over')).toBeNull();
    expect(resolveOdds([row({ line: 9.5 })], 1, 'corners_total', 8.5, 'over')).toBeNull();
  });
});

describe('findOpportunities', () => {
  it('ejemplo del enunciado: 65% con cuota 1.70 da EV +10.5%', () => {
    const [op] = findOpportunities([match], [row({})], 0.05);
    expect(op!.side).toBe('over');
    expect(op!.ev).toBeCloseTo(0.105, 3);
    expect(op!.fairOdds).toBeCloseTo(1.538, 2);
    expect(op!.origin).toBe('auto');
  });
  it('no inventa oportunidades: sin cuotas no hay resultados', () => {
    expect(findOpportunities([match], [], 0.05)).toEqual([]);
  });
  it('descarta lo que queda bajo el umbral y ordena por EV', () => {
    const ops = findOpportunities([match], [row({ over_odds: 1.5, under_odds: 3.2 })], 0.05);
    expect(ops.map((o) => o.side)).toEqual(['under']); // under: 0.35 × 3.2 − 1 = +12 %
  });
});

describe('confidenceFor', () => {
  it('baja en las colas', () => {
    expect(confidenceFor(0.5)).toBe('high');
    expect(confidenceFor(0.8)).toBe('medium');
    expect(confidenceFor(0.95)).toBe('low');
  });
});
