import { describe, expect, it } from 'vitest';
import { filterByDay } from './dayFilter';

const NOW = new Date('2026-11-05T12:00:00');
const m = (iso: string) => ({ kickoff_at: new Date(iso).toISOString() });
const matches = [
  m('2026-11-06T20:00:00'), // mañana tarde
  m('2026-11-05T09:00:00'), // hoy, ya empezó
  m('2026-11-05T21:00:00'), // hoy noche
  m('2026-11-05T15:00:00'), // hoy tarde
  m('2026-11-07T18:00:00'), // pasado mañana
  m('2026-11-04T20:00:00'), // ayer
];
const hours = (rows: { kickoff_at: string }[]) => rows.map((r) => new Date(r.kickoff_at).toISOString());

describe('filterByDay', () => {
  it('«Hoy»: solo los de hoy que aún no empiezan, en orden cronológico', () => {
    expect(hours(filterByDay(matches, 'today', NOW))).toEqual([m('2026-11-05T15:00:00').kickoff_at, m('2026-11-05T21:00:00').kickoff_at]);
  });
  it('«Mañana»: solo los de mañana', () => {
    expect(filterByDay(matches, 'tomorrow', NOW)).toHaveLength(1);
  });
  it('«Todos»: todo lo que viene, sin los pasados, ordenado', () => {
    const all = filterByDay(matches, 'all', NOW);
    expect(all).toHaveLength(4);
    expect(hours(all)).toEqual([...hours(all)].sort());
  });
  it('un partido de ayer o que ya empezó nunca aparece como próximo', () => {
    for (const d of ['today', 'tomorrow', 'all'] as const) {
      expect(hours(filterByDay(matches, d, NOW))).not.toContain(m('2026-11-04T20:00:00').kickoff_at);
      expect(hours(filterByDay(matches, d, NOW))).not.toContain(m('2026-11-05T09:00:00').kickoff_at);
    }
  });
  it('sin resultados devuelve una lista vacía', () => {
    expect(filterByDay([], 'today', NOW)).toEqual([]);
  });
});
