import { describe, expect, it } from 'vitest';
import { automationHealth, describeRun, nextAnalysis, nextResolve, whenLabel, type AutomationRun } from './automation';

const run = (o: Partial<AutomationRun>): AutomationRun => ({
  id: 1, kind: 'resolve', source: 'github', status: 'succeeded', started_at: '2026-11-05T13:20:00Z', finished_at: '2026-11-05T13:20:20Z', summary: {}, error: null, ...o,
});

describe('próximas ejecuciones programadas', () => {
  it('el siguiente análisis es la próxima de 12, 16 y 19 UTC; pasada la última, la de 12 UTC de mañana', () => {
    expect(nextAnalysis(new Date('2026-11-05T11:00:00Z')).toISOString()).toBe('2026-11-05T12:00:00.000Z');
    expect(nextAnalysis(new Date('2026-11-05T12:00:00Z')).toISOString()).toBe('2026-11-05T16:00:00.000Z');
    expect(nextAnalysis(new Date('2026-11-05T17:30:00Z')).toISOString()).toBe('2026-11-05T19:00:00.000Z');
    expect(nextAnalysis(new Date('2026-11-05T20:00:00Z')).toISOString()).toBe('2026-11-06T12:00:00.000Z');
  });
  it('la revisión de resultados es en el minuto 20 de cada hora', () => {
    expect(nextResolve(new Date('2026-11-05T13:05:00Z')).toISOString()).toBe('2026-11-05T13:20:00.000Z');
    expect(nextResolve(new Date('2026-11-05T13:20:00Z')).toISOString()).toBe('2026-11-05T14:20:00.000Z');
  });
});

describe('textos de la actividad', () => {
  it('revisión sin nada pendiente, con partidos sin terminar y con cierres', () => {
    expect(describeRun(run({ summary: { pending: 0, due: 0, resolved: 0 } }))).toBe('No había recomendaciones pendientes');
    expect(describeRun(run({ summary: { pending: 3, due: 0, resolved: 0 } }))).toContain('ninguna con partido terminado');
    expect(describeRun(run({ summary: { pending: 3, due: 2, resolved: 2, apiRequests: 3 } }))).toBe('2 recomendaciones cerradas · 3 solicitudes de API');
  });
  it('análisis completado, omitido por vigencia y fallido', () => {
    expect(describeRun(run({ kind: 'analyze', summary: { recommendations: 4, newRecommendations: 2, lowValue: 3 } }))).toBe('4 recomendaciones (2 nuevas) · 3 de estudio');
    expect(describeRun(run({ kind: 'analyze', summary: { skipped: 'fresh' } }))).toContain('vigentes');
    expect(describeRun(run({ kind: 'analyze', status: 'failed', error: 'Tope diario' }))).toBe('Falló: Tope diario');
  });
  it('«hoy», «ayer» y fecha', () => {
    const now = new Date(2026, 10, 5, 15, 0);
    expect(whenLabel(new Date(2026, 10, 5, 7, 2).toISOString(), now)).toMatch(/^hoy /);
    expect(whenLabel(new Date(2026, 10, 4, 14, 0).toISOString(), now)).toMatch(/^ayer /);
    expect(whenLabel(new Date(2026, 10, 1, 14, 0).toISOString(), now)).not.toMatch(/^(hoy|ayer)/);
  });
});

describe('salud del robot', () => {
  const now = new Date('2026-11-05T20:00:00Z');
  it('todo bien si el último análisis es reciente y nada falló', () => {
    expect(automationHealth([run({ kind: 'analyze', started_at: '2026-11-05T16:00:00Z' }), run({})], now).ok).toBe(true);
  });
  it('avisa si el último intento falló o si pasaron más de 14 h sin análisis exitoso', () => {
    expect(automationHealth([run({ kind: 'analyze', status: 'failed', started_at: '2026-11-05T19:00:00Z' })], now).ok).toBe(false);
    expect(automationHealth([run({ kind: 'analyze', started_at: '2026-11-05T01:00:00Z' })], now).reason).toContain('14 horas');
  });
  it('sin ejecuciones todavía no se da por caído', () => {
    expect(automationHealth([], now).ok).toBe(true);
  });
});
