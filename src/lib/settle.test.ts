import { describe, expect, it } from 'vitest';
import { settleBet, suggestedStake } from './settle';

describe('settleBet', () => {
  it('más de: gana si los córners superan la línea', () => {
    expect(settleBet({ side: 'over', line: 9.5, odds: 1.9, stake: 10, corners: 11 })).toEqual({ result: 'won', profit: 9 });
  });
  it('más de: pierde el monto si no la superan', () => {
    expect(settleBet({ side: 'over', line: 9.5, odds: 1.9, stake: 10, corners: 9 })).toEqual({ result: 'lost', profit: -10 });
  });
  it('menos de: gana si los córners quedan por debajo', () => {
    expect(settleBet({ side: 'under', line: 10.5, odds: 2.05, stake: 20, corners: 8 })).toEqual({ result: 'won', profit: 21 });
  });
  it('menos de: pierde si los córners superan la línea', () => {
    expect(settleBet({ side: 'under', line: 10.5, odds: 2.05, stake: 20, corners: 12 })).toEqual({ result: 'lost', profit: -20 });
  });
  it('línea entera con resultado igual devuelve el monto', () => {
    expect(settleBet({ side: 'over', line: 10, odds: 1.9, stake: 10, corners: 10 })).toEqual({ result: 'void', profit: 0 });
  });
  it('redondea a 2 decimales', () => {
    expect(settleBet({ side: 'over', line: 8.5, odds: 1.87, stake: 3.33, corners: 12 }).profit).toBe(2.9);
  });
});

describe('suggestedStake', () => {
  it('porcentaje del bankroll', () => {
    expect(suggestedStake('percent', 2, 250)).toBe(5);
  });
  it('monto fijo', () => {
    expect(suggestedStake('fixed', 7.5, 1000)).toBe(7.5);
  });
});
