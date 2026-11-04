import { describe, expect, it } from 'vitest';
import { edge, fitDispersion, minOdds, probOver, projectTotal, signalFor } from './model.ts';

const ref = { homeMean: 5.5, awayMean: 4.5 };

describe('probOver', () => {
  it('Poisson: coincide con un valor conocido', () => {
    // Poisson(10): P(X <= 9) = 0.4579 -> P(X > 9.5) = 0.5421
    expect(probOver(9.5, 10)).toBeCloseTo(0.5421, 3);
  });
  it('baja al subir la línea y sube con la media', () => {
    expect(probOver(10.5, 10)).toBeLessThan(probOver(9.5, 10));
    expect(probOver(9.5, 12)).toBeGreaterThan(probOver(9.5, 10));
  });
  it('la binomial negativa con r grande se parece a Poisson', () => {
    expect(probOver(9.5, 10, 1e6)).toBeCloseTo(probOver(9.5, 10), 3);
  });
  it('con sobredispersión hay más cola en los extremos', () => {
    expect(probOver(15.5, 10, 8)).toBeGreaterThan(probOver(15.5, 10));
  });
});

describe('projectTotal', () => {
  const avgTeam = Array.from({ length: 10 }, () => ({ corners_for: 5, corners_against: 5 }));
  it('equipos promedio dan aproximadamente la media de la liga', () => {
    const p = projectTotal(avgTeam, avgTeam, ref);
    expect(p.total).toBeCloseTo(10, 0);
  });
  it('un local que genera muchos córners sube el total', () => {
    const strong = Array.from({ length: 10 }, () => ({ corners_for: 8, corners_against: 4 }));
    expect(projectTotal(strong, avgTeam, ref).total).toBeGreaterThan(projectTotal(avgTeam, avgTeam, ref).total);
  });
  it('sin historial vuelve a la media de la liga (encogimiento total)', () => {
    expect(projectTotal([], [], ref).total).toBeCloseTo(10, 5);
  });
});

describe('fitDispersion', () => {
  it('sin suficientes datos o sin exceso de varianza devuelve Infinity', () => {
    expect(fitDispersion([])).toBe(Infinity);
    const exact = Array.from({ length: 50 }, () => ({ mean: 10, actual: 10 }));
    expect(fitDispersion(exact)).toBe(Infinity);
  });
});

describe('valor y semáforo', () => {
  it('cuota mínima y valor', () => {
    expect(minOdds(0.5)).toBe(2);
    expect(edge(0.55, 2)).toBeCloseTo(0.1, 10);
  });
  it('semáforo según umbral', () => {
    expect(signalFor(0.08, 0.05)).toBe('green');
    expect(signalFor(0.02, 0.05)).toBe('yellow');
    expect(signalFor(-0.01, 0.05)).toBe('red');
  });
});
