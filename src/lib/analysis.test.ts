import { describe, expect, it } from 'vitest';
import { describeAnalysis } from './analysis';
import type { AnalysisRun } from '../types/db';

const run = (o: Partial<AnalysisRun>): AnalysisRun => ({
  id: 1, status: 'succeeded', trigger: 'manual', started_at: '2026-11-05T15:00:00', finished_at: '2026-11-05T15:02:00',
  api_used_before: 10, api_used_after: 14, error: null, ...o,
});
const NOW = new Date('2026-11-05T15:30:00');

describe('describeAnalysis', () => {
  it('sin ejecuciones no hay análisis ni vigencia', () => {
    expect(describeAnalysis([], 60, NOW)).toMatchObject({ state: 'none', fresh: false, analyzedToday: false, lastSuccessAt: null });
  });
  it('un análisis completado hace 28 min con frecuencia de 60 sigue vigente y cuenta como «hoy»', () => {
    const s = describeAnalysis([run({})], 60, NOW);
    expect(s).toMatchObject({ state: 'succeeded', fresh: true, analyzedToday: true });
    expect(new Date(s.validUntil!).getHours()).toBe(16);
  });
  it('pasada la frecuencia, ya no está vigente pero sigue siendo «de hoy»', () => {
    expect(describeAnalysis([run({})], 20, NOW)).toMatchObject({ fresh: false, analyzedToday: true });
  });
  it('uno de ayer no cuenta como analizado hoy', () => {
    const r = run({ started_at: '2026-11-04T21:00:00', finished_at: '2026-11-04T21:02:00' });
    expect(describeAnalysis([r], 60, NOW)).toMatchObject({ analyzedToday: false, fresh: false });
  });
  it('un análisis en curso NO reemplaza al último completado ni lo hace vigente', () => {
    const running = run({ id: 2, status: 'running', finished_at: null, started_at: '2026-11-05T15:29:00' });
    const s = describeAnalysis([running, run({ finished_at: '2026-11-05T10:00:00' })], 60, NOW);
    expect(s.state).toBe('running');
    expect(s.lastSuccessAt).toBe('2026-11-05T10:00:00');
    expect(s.fresh).toBe(false);
  });
  it('un intento fallido se informa, pero el último completado se conserva', () => {
    const failed = run({ id: 3, status: 'failed', finished_at: '2026-11-05T15:20:00', error: 'Tope diario alcanzado' });
    const s = describeAnalysis([failed, run({})], 60, NOW);
    expect(s).toMatchObject({ state: 'failed', error: 'Tope diario alcanzado', fresh: true });
  });
});
