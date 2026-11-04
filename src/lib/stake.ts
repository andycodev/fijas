import { stakedToday, type FinBet } from './finance';
import { suggestedStake } from './settle';

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Lo que pasa con un monto concreto: cuánto cobras, cuánto ganas o pierdes y la ganancia esperada promedio.
export function stakePlan(stake: number, odds: number, probability: number) {
  return {
    payout: round2(stake * odds), // lo que cobras si aciertas (incluye tu monto)
    profitIfWin: round2(stake * (odds - 1)), // ganancia neta si aciertas
    lossIfLose: round2(stake), // lo que pierdes si fallas
    expectedProfit: round2(stake * (probability * odds - 1)), // promedio por apuesta si repitieras esto muchas veces
  };
}

// Valor esperado si el modelo se equivocara en `points` de probabilidad (0.05 = 5 puntos). Sirve para ver qué tan frágil es.
export const evIfModelOff = (probability: number, odds: number, points = 0.05): number =>
  Math.max(probability - points, 0) * odds - 1;

export const HIGH_EV = 0.15; // por encima de este valor esperado se pide verificar la cuota

export interface StakeSettings {
  initial_bankroll: number | string;
  stake_mode: 'percent' | 'fixed';
  stake_value: number | string;
  daily_exposure_pct: number | string;
}

// Monto recomendado: el de tus ajustes (sobre el capital inicial, no sube al ganar) sin pasar de lo que te queda de
// exposición diaria ni de tu saldo.
export function recommendedStake(args: { settings: StakeSettings; balance: number; bets: FinBet[]; now?: Date }) {
  const { settings, balance, bets, now = new Date() } = args;
  const initial = Number(settings.initial_bankroll);
  const base = suggestedStake(settings.stake_mode, Number(settings.stake_value), initial);
  const exposureLimit = round2((initial * Number(settings.daily_exposure_pct)) / 100);
  const exposureLeft = Math.max(round2(exposureLimit - stakedToday(bets, now).amount), 0);
  const balanceLeft = Math.max(balance, 0);
  const amount = round2(Math.min(base, exposureLeft, balanceLeft));
  const limitedBy: 'none' | 'exposure' | 'balance' = amount < base ? (exposureLeft <= balanceLeft ? 'exposure' : 'balance') : 'none';
  return { amount, base, exposureLeft, limitedBy };
}
