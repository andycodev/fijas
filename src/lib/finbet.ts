import type { FinBet } from './finance';
import type { Ticket } from '../types/db';

// Un boleto visto como lo necesitan los cálculos de riesgo y los resúmenes mensuales.
export const toFinBet = (t: Ticket): FinBet => ({
  status: t.status,
  stake: t.stake,
  profit_loss: t.profit_loss,
  result: t.result,
  placed_at: t.placed_at,
  closed_at: t.closed_at,
  accepted_odds: t.accepted_odds,
  model_probability: null, // la probabilidad vive en cada selección, no en el boleto
});
