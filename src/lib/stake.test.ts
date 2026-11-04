import { describe, expect, it } from 'vitest';
import { evIfModelOff, recommendedStake, stakePlan } from './stake';
import type { FinBet } from './finance';

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

const bet = (stake: number, placed_at: string): FinBet => ({
  status: 'open', stake, profit_loss: null, result: null, placed_at, closed_at: null, accepted_odds: 1.9, model_probability: null,
});
const settings = { initial_bankroll: 200, stake_mode: 'percent' as const, stake_value: 2, daily_exposure_pct: 10 };
const NOW = new Date('2026-11-04T15:00:00');

describe('recommendedStake', () => {
  it('2 % del capital inicial (S/4), sin importar si el saldo subió', () => {
    expect(recommendedStake({ settings, balance: 500, bets: [], now: NOW })).toMatchObject({ amount: 4, base: 4, limitedBy: 'none' });
  });
  it('se limita a lo que queda de la exposición diaria (S/20)', () => {
    const r = recommendedStake({ settings, balance: 200, bets: [bet(18, '2026-11-04T09:00:00')], now: NOW });
    expect(r).toMatchObject({ amount: 2, exposureLeft: 2, limitedBy: 'exposure' });
  });
  it('si ya llegaste al límite del día, recomienda 0', () => {
    expect(recommendedStake({ settings, balance: 200, bets: [bet(20, '2026-11-04T09:00:00')], now: NOW }).amount).toBe(0);
  });
  it('no pasa de tu saldo', () => {
    expect(recommendedStake({ settings, balance: 3, bets: [], now: NOW })).toMatchObject({ amount: 3, limitedBy: 'balance' });
  });
});
