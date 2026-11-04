import { describe, expect, it } from 'vitest';
import { edge, impliedProbability, riskFor, signalFor } from './value';

describe('value', () => {
  it('probabilidad implícita de una cuota', () => {
    expect(impliedProbability(2)).toBe(0.5);
    expect(impliedProbability(1.25)).toBeCloseTo(0.8, 10);
  });
  it('riesgo según la probabilidad del modelo', () => {
    expect(riskFor(0.86)).toBe('low');
    expect(riskFor(0.6)).toBe('medium');
    expect(riskFor(0.4)).toBe('high');
  });
  it('un 86.1% con cuota justa 1.16 no tiene valor frente a una cuota de 1.10', () => {
    expect(edge(0.861, 1.1)).toBeLessThan(0);
    expect(signalFor(edge(0.861, 1.1), 0.05)).toBe('red');
  });
});
