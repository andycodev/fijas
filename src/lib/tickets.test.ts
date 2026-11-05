import { describe, expect, it } from 'vitest';
import {
  combinedOdds, legResult, oddsWithoutVoids, slipIssues, suggestTicketOutcome, summarizeTickets, ticketPlan,
} from './tickets';

describe('cuota combinada y retorno', () => {
  it('ejemplo del enunciado: 1.80 × 1.90 = 3.42; S/ 10 → retorno 34.20 y ganancia 24.20', () => {
    expect(combinedOdds([1.8, 1.9])).toBe(3.42);
    expect(ticketPlan(10, 3.42)).toEqual({ potentialReturn: 34.2, potentialNet: 24.2 });
  });
  it('una selección es su propia cuota; con cuota editada se usa la real de Betano', () => {
    expect(combinedOdds([2.05])).toBe(2.05);
    expect(ticketPlan(10, 3.4)).toEqual({ potentialReturn: 34, potentialNet: 24 });
  });
  it('la cuota anulada sale de la combinada', () => {
    expect(oddsWithoutVoids(3.42, [{ odds: 1.8, result: 'void' }, { odds: 1.9, result: 'won' }])).toBe(1.9);
    expect(oddsWithoutVoids(3.42, [{ odds: 1.8, result: 'won' }, { odds: 1.9, result: 'won' }])).toBe(3.42);
  });
});

describe('resultado de cada selección y del boleto', () => {
  it('más de / menos de contra el valor real', () => {
    expect(legResult('over', 2.5, 3)).toBe('won');
    expect(legResult('over', 2.5, 2)).toBe('lost');
    expect(legResult('under', 9.5, 8)).toBe('won');
    expect(legResult('under', 9.5, 10)).toBe('lost');
    expect(legResult('over', 3, 3)).toBe('void');
  });
  it('una combinada pierde si falla una selección, aunque otras acierten o estén pendientes', () => {
    expect(suggestTicketOutcome([{ result: 'won' }, { result: 'lost' }])).toBe('lost');
    expect(suggestTicketOutcome([{ result: 'pending' }, { result: 'lost' }])).toBe('lost');
  });
  it('gana solo si todas las válidas aciertan; con alguna pendiente sigue pendiente', () => {
    expect(suggestTicketOutcome([{ result: 'won' }, { result: 'won' }])).toBe('won');
    expect(suggestTicketOutcome([{ result: 'won' }, { result: 'void' }])).toBe('won');
    expect(suggestTicketOutcome([{ result: 'won' }, { result: 'pending' }])).toBe('pending');
    expect(suggestTicketOutcome([{ result: 'void' }, { result: 'void' }])).toBe('void');
  });
});

describe('validación del boleto', () => {
  const leg = (o: Partial<{ matchId: number; line: number; side: 'over' | 'under'; odds: number }> = {}) =>
    ({ matchId: 1, market: 'goals_total', line: 2.5, side: 'over' as const, odds: 1.8, ...o });

  it('un boleto correcto no tiene errores', () => {
    expect(slipIssues({ legs: [leg()], stake: 10, totalOdds: 1.8, available: 300, minStake: 10 })).toMatchObject({ ok: true, errors: [] });
  });
  it('rechaza importe bajo el mínimo y sobre el saldo', () => {
    expect(slipIssues({ legs: [leg()], stake: 5, totalOdds: 1.8, available: 300, minStake: 10 }).errors[0]).toMatch(/mínimo/);
    expect(slipIssues({ legs: [leg()], stake: 400, totalOdds: 1.8, available: 300, minStake: 10 }).errors[0]).toMatch(/supera tu saldo/);
  });
  it('rechaza vacío, cuotas inválidas y selecciones repetidas', () => {
    expect(slipIssues({ legs: [], stake: 10, totalOdds: null, available: 300, minStake: 10 }).ok).toBe(false);
    expect(slipIssues({ legs: [leg({ odds: 1 })], stake: 10, totalOdds: null, available: 300, minStake: 10 }).ok).toBe(false);
    expect(slipIssues({ legs: [leg(), leg()], stake: 10, totalOdds: null, available: 300, minStake: 10 }).errors.join(' ')).toMatch(/repetida/);
  });
  it('avisa (sin bloquear) si hay selecciones del mismo partido', () => {
    const r = slipIssues({ legs: [leg(), leg({ line: 3.5 })], stake: 10, totalOdds: null, available: 300, minStake: 10 });
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toMatch(/mismo partido/);
  });
});

describe('rendimiento de mis apuestas', () => {
  const t = (o: object) => ({ kind: 'single' as const, status: 'closed' as const, result: 'won' as const, stake: 10, payout: 20, profit_loss: 10, ...o });
  it('separa apostado, retorno y ganancia neta; y simples de combinadas', () => {
    const s = summarizeTickets([
      t({}), // simple ganada: +10
      t({ result: 'lost', payout: 0, profit_loss: -10 }), // simple perdida
      t({ kind: 'combo', payout: 34.2, profit_loss: 24.2 }), // combinada ganada
      t({ status: 'open', result: null, payout: null, profit_loss: null }), // pendiente
      t({ status: 'void', result: 'void', payout: 10, profit_loss: 0 }), // anulada
    ]);
    expect(s.all).toMatchObject({ tickets: 5, won: 2, lost: 1, pending: 1, voided: 1, staked: 40, returned: 54.2, net: 24.2 });
    expect(s.all.roi).toBeCloseTo(80.67, 1); // 24.2 / 30
    expect(s.singles).toMatchObject({ tickets: 4, net: 0 });
    expect(s.combos).toMatchObject({ tickets: 1, won: 1, net: 24.2 });
  });
  it('sin boletos liquidados no inventa rentabilidad', () => {
    expect(summarizeTickets([]).all.roi).toBeNull();
  });
});
