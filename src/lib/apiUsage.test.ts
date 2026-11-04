import { describe, expect, it } from 'vitest';
import { detectReset, nextResetEstimate, refreshAllowedAt, serviceState, usageLevel, usagePercent } from './apiUsage';

describe('usageLevel', () => {
  it('umbrales de 70 %, 85 % y 95 % sobre 100 solicitudes', () => {
    expect(usageLevel(35, 100)).toBe('ok');
    expect(usageLevel(69, 100)).toBe('ok');
    expect(usageLevel(70, 100)).toBe('watch');
    expect(usageLevel(85, 100)).toBe('high');
    expect(usageLevel(95, 100)).toBe('critical');
    expect(usageLevel(99, 100)).toBe('critical');
    expect(usageLevel(100, 100)).toBe('exhausted');
  });
  it('ejemplo del enunciado: 35 de 100 es 35 %', () => {
    expect(usagePercent(35, 100)).toBe(35);
  });
  it('no divide por cero', () => {
    expect(usagePercent(5, 0)).toBe(0);
    expect(usageLevel(5, 0)).toBe('ok');
  });
});

describe('nextResetEstimate', () => {
  it('con reinicio a las 00:00 UTC, la próxima es la medianoche siguiente', () => {
    expect(nextResetEstimate(new Date('2026-11-04T18:15:00Z'), 0).toISOString()).toBe('2026-11-05T00:00:00.000Z');
  });
  it('si la hora configurada aún no llegó hoy, es hoy', () => {
    expect(nextResetEstimate(new Date('2026-11-04T02:00:00Z'), 5).toISOString()).toBe('2026-11-04T05:00:00.000Z');
  });
});

describe('detectReset', () => {
  it('detecta cuando las restantes suben', () => {
    expect(detectReset(3, 100)).toBe(true);
    expect(detectReset(68, 67)).toBe(false);
    expect(detectReset(null, 100)).toBe(false);
  });
});

describe('serviceState y frecuencia', () => {
  it('traduce el estado', () => {
    expect(serviceState('ok')).toEqual({ label: 'Operativo', ok: true });
    expect(serviceState('rate_limited').ok).toBe(false);
    expect(serviceState(null).label).toBe('Sin datos todavía');
  });
  it('próxima actualización permitida', () => {
    expect(refreshAllowedAt('2026-11-04T10:00:00Z', 60)?.toISOString()).toBe('2026-11-04T11:00:00.000Z');
    expect(refreshAllowedAt(null, 60)).toBeNull();
  });
});
