import { describe, expect, it } from 'vitest';
import {
  betTotals, capitalStatus, currentLosingStreak, monthlySummaries, riskAlerts, stakedToday, type FinBet,
} from './finance';

const bet = (o: Partial<FinBet>): FinBet => ({
  status: 'closed', stake: 10, profit_loss: 0, result: 'won', placed_at: '2026-11-03T12:00:00', closed_at: '2026-11-03T20:00:00',
  accepted_odds: 1.9, model_probability: null, ...o,
});
const NOW = new Date('2026-11-04T15:00:00');

describe('betTotals', () => {
  it('suma apostado, ganancias, pérdidas y neto', () => {
    const t = betTotals([
      bet({ stake: 10, profit_loss: 9 }),
      bet({ stake: 10, profit_loss: -10, result: 'lost' }),
      bet({ stake: 5, status: 'open', profit_loss: null, result: null }),
      bet({ stake: 7, status: 'void', profit_loss: 0, result: 'void' }),
    ]);
    expect(t).toMatchObject({ totalStaked: 25, gains: 9, losses: 10, net: -1, openCount: 1, openStake: 5 });
    expect(t.roiPct).toBeCloseTo(-5, 1); // -1 / 20
  });
});

describe('capitalStatus', () => {
  it('S/230 sobre S/200: S/30 de ganancia acumulada', () => {
    expect(capitalStatus(200, 230)).toEqual({ protectedCapital: 200, diff: 30, state: 'above' });
  });
  it('S/180: está S/20 por debajo', () => {
    expect(capitalStatus(200, 180)).toEqual({ protectedCapital: 200, diff: -20, state: 'below' });
  });
});

describe('monthlySummaries', () => {
  it('encadena los meses y compara con el anterior', () => {
    const months = monthlySummaries(
      200,
      [{ type: 'deposit', amount: 20, occurred_on: '2026-11-02' }],
      [
        bet({ profit_loss: 40, closed_at: '2026-10-10T12:00:00' }),
        bet({ profit_loss: -10, result: 'lost', closed_at: '2026-10-12T12:00:00' }),
        bet({ profit_loss: 10, closed_at: '2026-11-03T12:00:00' }),
      ],
      NOW,
    );
    expect(months.map((m) => m.key)).toEqual(['2026-10', '2026-11']);
    expect(months[0]).toMatchObject({ start: 200, gains: 40, losses: 10, net: 30, final: 230, returnPct: 15, vsPreviousMonth: null });
    expect(months[1]).toMatchObject({ start: 230, flows: 20, gains: 10, final: 260, vsPreviousMonth: 30 });
  });
  it('sin actividad devuelve solo el mes actual con el capital inicial', () => {
    expect(monthlySummaries(200, [], [], NOW)).toMatchObject([{ key: '2026-11', start: 200, final: 200, net: 0 }]);
  });
  it('un mes con pérdidas termina por debajo del capital', () => {
    const [m] = monthlySummaries(200, [], [bet({ profit_loss: -20, result: 'lost', closed_at: '2026-11-01T12:00:00' })], NOW);
    expect(m!.final).toBe(180);
    expect(m!.returnPct).toBe(-10);
  });
});

describe('rachas y exposición', () => {
  it('cuenta las derrotas seguidas más recientes', () => {
    const bets = [
      bet({ result: 'won', closed_at: '2026-11-01T10:00:00' }),
      bet({ result: 'lost', profit_loss: -10, closed_at: '2026-11-02T10:00:00' }),
      bet({ result: 'lost', profit_loss: -10, closed_at: '2026-11-03T10:00:00' }),
    ];
    expect(currentLosingStreak(bets)).toBe(2);
  });
  it('lo apostado hoy ignora anuladas y otros días', () => {
    const bets = [
      bet({ stake: 6, placed_at: '2026-11-04T09:00:00' }),
      bet({ stake: 4, placed_at: '2026-11-04T11:00:00', status: 'open', profit_loss: null, result: null }),
      bet({ stake: 9, placed_at: '2026-11-04T12:00:00', status: 'void' }),
      bet({ stake: 8, placed_at: '2026-11-03T12:00:00' }),
    ];
    expect(stakedToday(bets, NOW)).toEqual({ amount: 10, count: 2 });
  });
});

describe('riskAlerts', () => {
  const settings = { initial_bankroll: 200, daily_exposure_pct: 10, monthly_loss_limit_pct: 20, losing_streak_alert: 3, daily_bet_limit: 3 };

  it('sin apuestas y con el capital intacto no hay alertas', () => {
    expect(riskAlerts({ settings, balance: 200, bets: [], now: NOW })).toEqual([]);
  });
  it('un monto que supera la exposición diaria (S/20) pide confirmación', () => {
    const a = riskAlerts({ settings, balance: 200, bets: [bet({ stake: 15, placed_at: '2026-11-04T09:00:00' })], now: NOW, extraStake: 10 });
    expect(a.find((x) => x.id === 'exposure')?.level).toBe('stop');
  });
  it('alcanzar la pérdida mensual (S/40) es una alerta de parada', () => {
    const bets = [bet({ profit_loss: -40, result: 'lost', closed_at: '2026-11-02T10:00:00' })];
    expect(riskAlerts({ settings, balance: 160, bets, now: NOW }).find((x) => x.id === 'loss')?.level).toBe('stop');
  });
  it('avisa de la racha negativa y de estar bajo el capital inicial', () => {
    const bets = [1, 2, 3].map((d) => bet({ profit_loss: -5, result: 'lost', closed_at: `2026-11-0${d}T10:00:00` }));
    const ids = riskAlerts({ settings, balance: 185, bets, now: NOW }).map((x) => x.id);
    expect(ids).toContain('streak');
    expect(ids).toContain('below');
  });
});
