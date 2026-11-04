import { describe, expect, it } from 'vitest';
import { evIfModelOff, stakePlan } from './stake';

describe('stakePlan', () => {
  it('S/10 a cuota 1.70 con 65 %: cobras 17, ganas 7, pierdes 10 y el promedio es +1.05', () => {
    expect(stakePlan(10, 1.7, 0.65)).toEqual({ payout: 17, profitIfWin: 7, lossIfLose: 10, expectedProfit: 1.05 });
  });
  it('sin valor el promedio es negativo', () => {
    expect(stakePlan(10, 1.1, 0.9).expectedProfit).toBe(-0.1); // 10 × (0.9 × 1.10 − 1)
    expect(stakePlan(10, 1.05, 0.9).expectedProfit).toBe(-0.55);
  });
});

describe('evIfModelOff', () => {
  it('si el modelo se equivocara 5 puntos, el valor del ejemplo baja de +10.5 % a +2.0 %', () => {
    expect(evIfModelOff(0.65, 1.7)).toBeCloseTo(0.02, 3);
  });
  it('nunca usa una probabilidad negativa', () => {
    expect(evIfModelOff(0.02, 3)).toBe(-1);
  });
});
