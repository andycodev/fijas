import { describe, expect, it } from 'vitest';
import { analyze, confidenceFor, resolveOdds, type CalibrationBucket } from './opportunities';
import { bandOf } from './probability';
import type { OddsRow, UpcomingMatch } from '../types/db';

const pick = (line: number, probability: number, market: 'goals_total' | 'corners_total' = 'goals_total') => ({
  id: line * 10, market, line, projection: 3, probability, min_odds: 1 / probability, model_version: 'x',
  home_games_used: 10, away_games_used: 10, latest_game_at: '2026-10-30T12:00:00Z',
});

const match: UpcomingMatch = {
  id: 1, home_team_id: 1, away_team_id: 2, kickoff_at: '2026-11-05T20:00:00Z',
  league: { name: 'Liga' }, home: { name: 'A' }, away: { name: 'B' },
  // Over 0.5: 95 %  ·  Over 1.5: 82 %  ·  Over 2.5: 56 %
  picks: [pick(0.5, 0.95), pick(1.5, 0.82), pick(2.5, 0.56)],
};

const row = (o: Partial<OddsRow>): OddsRow => ({
  id: 1, match_id: 1, market: 'goals_total', line: 1.5, over_odds: 1.3, under_odds: 3.6,
  origin: 'auto', captured_at: '2026-11-04T08:00:00Z', ...o,
});

describe('bandOf', () => {
  it('respeta los tramos pedidos', () => {
    expect(bandOf(0.59)).toBe('discard');
    expect(bandOf(0.6)).toBe('moderate');
    expect(bandOf(0.699)).toBe('moderate');
    expect(bandOf(0.7)).toBe('watch');
    expect(bandOf(0.75)).toBe('high');
    expect(bandOf(0.8)).toBe('very_high');
    expect(bandOf(0.9)).toBe('very_high');
  });
});

describe('resolveOdds', () => {
  it('la cuota manual manda sobre la del proveedor', () => {
    const r = resolveOdds([row({ origin: 'auto', over_odds: 1.3 }), row({ id: 2, origin: 'manual', over_odds: 1.25 })], 1, 'goals_total', 1.5, 'over');
    expect(r).toMatchObject({ odds: 1.25, origin: 'manual' });
  });
  it('no mezcla mercados ni líneas', () => {
    expect(resolveOdds([row({ market: 'corners_total' })], 1, 'goals_total', 1.5, 'over')).toBeNull();
    expect(resolveOdds([row({ line: 2.5 })], 1, 'goals_total', 1.5, 'over')).toBeNull();
  });
});

describe('analyze (embudo)', () => {
  const opts = { minProbability: 0.75, valueThreshold: 0.03 };

  it('cuenta lo evaluado y solo deja pasar lo que cumple la probabilidad mínima', () => {
    const a = analyze([match], [], opts);
    expect(a).toMatchObject({ matchesAnalyzed: 1, marketsEvaluated: 1, selectionsEvaluated: 6 });
    // 95 % (más de 0.5), 82 % (más de 1.5), 94.9 %… menos de 2.5 = 44 % no cumple; menos de 1.5 = 18 % no cumple
    expect(a.meetMinimum.map((s) => `${s.side}${s.line}`)).toEqual(['over0.5', 'over1.5']);
    expect(a.recommended).toEqual([]); // sin cuotas no se recomienda nada
    expect(a.highProbabilityNoOdds).toHaveLength(2);
  });

  it('una selección del 82 % con cuota sin valor se muestra aparte, no como recomendación', () => {
    // 0.82 × 1.20 − 1 = −1.6 %
    const a = analyze([match], [row({ over_odds: 1.2 })], opts);
    expect(a.recommended).toEqual([]);
    expect(a.highProbabilityNoValue.map((s) => s.line)).toEqual([1.5]);
  });

  it('con cuota que da valor entra en recomendadas', () => {
    // 0.82 × 1.35 − 1 = +10.7 %
    const a = analyze([match], [row({ over_odds: 1.35 })], opts);
    expect(a.recommended).toHaveLength(1);
    expect(a.recommended[0]).toMatchObject({ line: 1.5, side: 'over' });
    expect(a.recommended[0]!.ev).toBeCloseTo(0.107, 3);
  });

  it('una probabilidad baja nunca se recomienda aunque la cuota sea enorme', () => {
    const a = analyze([match], [row({ line: 2.5, over_odds: 3.0 })], opts); // 56 % × 3.0 = +68 %
    expect(a.recommended).toEqual([]);
  });

  it('bajar el mínimo deja entrar más selecciones', () => {
    const a = analyze([match], [row({ line: 2.5, over_odds: 3.0 })], { minProbability: 0.5, valueThreshold: 0.03 });
    expect(a.recommended.map((s) => s.line)).toContain(2.5);
  });
});

describe('confidenceFor', () => {
  const buckets: CalibrationBucket[] = [
    { label: '75–79%', from: 0.75, to: 0.8, n: 3000, predicted: 77.5, actual: 76.5 },
    { label: '85% o más', from: 0.85, to: 1, n: 80, predicted: 90, actual: 82 },
  ];
  const now = new Date('2026-11-04T12:00:00Z');
  const base = { gamesHome: 10, gamesAway: 10, latestGameAt: '2026-11-01T12:00:00Z' };

  it('alta cuando muestra, frescura y calibración son buenas', () => {
    expect(confidenceFor({ ...base, probability: 0.77 }, buckets, now).level).toBe('high');
  });
  it('baja si el histórico del tramo no cumplió o es escaso', () => {
    expect(confidenceFor({ ...base, probability: 0.9 }, buckets, now).level).toBe('low');
  });
  it('baja si los datos están viejos', () => {
    expect(confidenceFor({ ...base, probability: 0.77, latestGameAt: '2026-08-01T12:00:00Z' }, buckets, now).level).toBe('low');
  });
  it('sin evidencia del tramo no inventa confianza', () => {
    expect(confidenceFor({ ...base, probability: 0.77 }, undefined, now).level).toBe('low');
  });
});
