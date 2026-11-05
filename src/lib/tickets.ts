import type { LegResult, Ticket } from '../types/db';

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ───────── Cuotas y retorno ─────────
// Cuota combinada = producto de las cuotas individuales (con dos decimales, como la muestra Betano).
export const combinedOdds = (odds: number[]): number => round2(odds.reduce((p, o) => p * o, 1));

// Retorno y ganancia potenciales. El importe es el del BOLETO, no el de cada selección.
export function ticketPlan(stake: number, totalOdds: number) {
  const potentialReturn = round2(stake * totalOdds);
  return { potentialReturn, potentialNet: round2(potentialReturn - stake) };
}

// ───────── Resultado de cada selección y del boleto ─────────
// Líneas con .5: no hay empate. Con una línea entera y valor igual se anula.
export function legResult(side: 'over' | 'under', line: number, actual: number): Exclude<LegResult, 'pending'> {
  if (actual === line) return 'void';
  return (side === 'over' ? actual > line : actual < line) ? 'won' : 'lost';
}

// Qué resultado le corresponde al boleto según sus selecciones (sugerencia: el real lo confirma Betano).
// Una selección perdida pierde el boleto aunque haya otras pendientes; las anuladas salen de la combinada.
export function suggestTicketOutcome(legs: { result: LegResult }[]): 'won' | 'lost' | 'void' | 'pending' {
  if (legs.some((l) => l.result === 'lost')) return 'lost';
  if (legs.some((l) => l.result === 'pending')) return 'pending';
  return legs.every((l) => l.result === 'void') ? 'void' : 'won';
}

// Si hay selecciones anuladas, Betano recalcula la cuota sin ellas: cuota total ÷ cuotas de las anuladas.
export function oddsWithoutVoids(totalOdds: number, legs: { odds: number; result: LegResult }[]): number {
  const voided = legs.filter((l) => l.result === 'void').reduce((p, l) => p * l.odds, 1);
  return round2(totalOdds / voided);
}

// ───────── Validación del boleto antes de registrarlo ─────────
export interface SlipLeg { matchId: number; market: string; line: number; side: 'over' | 'under'; odds: number }

export function slipIssues(args: { legs: SlipLeg[]; stake: number | null; totalOdds: number | null; available: number; minStake: number }) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { legs, stake, totalOdds, available, minStake } = args;
  if (!legs.length) errors.push('Añade al menos una selección.');
  if (legs.length > 12) errors.push('Un boleto admite como máximo 12 selecciones.');
  if (legs.some((l) => !(l.odds > 1))) errors.push('Todas las cuotas deben ser mayores que 1.');
  if (totalOdds !== null && !(totalOdds > 1)) errors.push('La cuota total debe ser mayor que 1.');
  if (stake === null || !(stake > 0)) errors.push('Indica el importe.');
  else if (stake < minStake) errors.push(`El importe mínimo es ${minStake.toFixed(2)}.`);
  else if (stake > available) errors.push(`El importe supera tu saldo disponible (${available.toFixed(2)}).`);

  const keys = legs.map((l) => `${l.matchId}|${l.market}|${l.line}|${l.side}`);
  if (new Set(keys).size !== keys.length) errors.push('Hay una selección repetida.');

  const matches = legs.map((l) => l.matchId);
  if (new Set(matches).size !== matches.length) {
    warnings.push('Hay selecciones del mismo partido: están relacionadas entre sí y Betano puede no aceptarlas en una combinada normal.');
  }
  return { errors, warnings, ok: errors.length === 0 };
}

// ───────── Rendimiento de MIS apuestas ─────────
const pct = (n: number) => Math.round(n * 100) / 100;

export function summarizeTickets(tickets: Pick<Ticket, 'kind' | 'status' | 'result' | 'stake' | 'payout' | 'profit_loss'>[]) {
  const group = (rows: typeof tickets) => {
    const settled = rows.filter((t) => t.status === 'closed' || t.status === 'confirmed');
    const stakedSettled = settled.reduce((s, t) => s + Number(t.stake), 0);
    const net = settled.reduce((s, t) => s + Number(t.profit_loss ?? 0), 0);
    return {
      tickets: rows.length,
      won: settled.filter((t) => t.result === 'won').length,
      lost: settled.filter((t) => t.result === 'lost').length,
      pending: rows.filter((t) => t.status === 'open').length,
      voided: rows.filter((t) => t.status === 'void').length,
      staked: pct(rows.filter((t) => t.status !== 'void').reduce((s, t) => s + Number(t.stake), 0)),
      returned: pct(settled.reduce((s, t) => s + Number(t.payout ?? 0), 0)),
      net: pct(net),
      roi: stakedSettled > 0 ? pct((net / stakedSettled) * 100) : null,
      hitRate: settled.length ? pct((settled.filter((t) => t.result === 'won').length / settled.length) * 100) : null,
    };
  };
  return {
    all: group(tickets),
    singles: group(tickets.filter((t) => t.kind === 'single')),
    combos: group(tickets.filter((t) => t.kind === 'combo')),
  };
}
