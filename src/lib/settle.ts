export type Side = 'over' | 'under';

export interface Settlement {
  result: 'won' | 'lost' | 'void';
  profit: number; // ganancia (+) o pérdida (−) respecto al monto apostado
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Liquida una apuesta de córners totales. Con línea entera y resultado igual a la línea es "push":
// se devuelve el monto (anulada, ganancia 0).
export function settleBet(bet: { side: Side; line: number; odds: number; stake: number; corners: number }): Settlement {
  const { side, line, odds, stake, corners } = bet;
  if (corners === line) return { result: 'void', profit: 0 };
  const won = side === 'over' ? corners > line : corners < line;
  return won ? { result: 'won', profit: round2(stake * (odds - 1)) } : { result: 'lost', profit: -round2(stake) };
}

// Monto sugerido según los ajustes del perfil.
export function suggestedStake(
  mode: 'percent' | 'fixed',
  value: number,
  bankroll: number,
): number {
  const raw = mode === 'percent' ? (bankroll * value) / 100 : value;
  return Math.max(0, round2(raw));
}
