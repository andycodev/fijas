import { describe, expect, it } from 'vitest';
import { calculatedBalance } from './balance';

describe('calculatedBalance', () => {
  it('suma bankroll, depósitos y apuestas cerradas; resta retiros y apuestas abiertas', () => {
    const result = calculatedBalance(
      100,
      [
        { type: 'deposit', amount: 50 },
        { type: 'withdrawal', amount: 30 },
      ],
      [
        { status: 'closed', stake: 10, profit_loss: 8.5 },
        { status: 'confirmed', stake: 10, profit_loss: -10 },
        { status: 'open', stake: 5, profit_loss: null },
        { status: 'void', stake: 7, profit_loss: 0 },
      ],
    );
    expect(result).toBe(113.5);
  });

  it('sin movimientos devuelve el bankroll inicial', () => {
    expect(calculatedBalance(200, [], [])).toBe(200);
  });
});
