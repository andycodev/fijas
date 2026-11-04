import type { BetMoney, CashMovement } from '../types/db';

// Saldo calculado = bankroll inicial + depósitos − retiros
//                   + ganancias/pérdidas de apuestas cerradas o confirmadas
//                   − monto de las apuestas todavía abiertas (la casa ya lo retiene).
export function calculatedBalance(
  initialBankroll: number,
  movements: Pick<CashMovement, 'type' | 'amount'>[],
  bets: BetMoney[],
): number {
  const cash = movements.reduce((sum, m) => sum + (m.type === 'deposit' ? m.amount : -m.amount), 0);
  const settled = bets
    .filter((b) => b.status === 'closed' || b.status === 'confirmed')
    .reduce((sum, b) => sum + (b.profit_loss ?? 0), 0);
  const open = bets.filter((b) => b.status === 'open').reduce((sum, b) => sum + b.stake, 0);
  return Math.round((initialBankroll + cash + settled - open) * 100) / 100;
}
