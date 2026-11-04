import { describe, expect, it } from 'vitest';
import { buildExplanation, summarize, type HistGame } from './explain';

const HOME = 1, AWAY = 2, OTHER = 3;
let t = 0;
const game = (home: number, away: number, h: number, a: number, extra: Partial<HistGame> = {}): HistGame => ({
  t: ++t, home, away, h, a, hShots: null, aShots: null, hSot: null, aSot: null, hXg: null, aXg: null, ...extra,
});

// Equipos con muchos goles: el local siempre mete 3 y recibe 1; el visitante mete 2 y recibe 2.
const homeGames = Array.from({ length: 10 }, (_, i) => (i % 2 ? game(HOME, OTHER, 3, 1) : game(OTHER, HOME, 1, 3)));
const awayGames = Array.from({ length: 10 }, (_, i) => (i % 2 ? game(AWAY, OTHER, 2, 2) : game(OTHER, AWAY, 2, 2)));

const base = { homeId: HOME, awayId: AWAY, homeName: 'A', awayName: 'B', homeGames, awayGames, h2h: [] as HistGame[] };

describe('buildExplanation', () => {
  it('goles: con partidos de ~4.5 goles, "Más de 2.5" tiene factores a favor y ninguno en contra', () => {
    const e = buildExplanation({ ...base, market: 'goals_total', side: 'over', line: 2.5 });
    const s = summarize(e.factors);
    expect(s.favor.length).toBeGreaterThanOrEqual(3);
    expect(s.against).toHaveLength(0);
  });

  it('el mismo análisis invierte la lectura para "Menos de"', () => {
    const e = buildExplanation({ ...base, market: 'goals_total', side: 'under', line: 2.5 });
    const s = summarize(e.factors);
    expect(s.favor).toHaveLength(0);
    expect(s.against.length).toBeGreaterThanOrEqual(3);
  });

  it('sin enfrentamientos directos lo dice en lugar de inventarlo', () => {
    const e = buildExplanation({ ...base, market: 'goals_total', side: 'over', line: 2.5 });
    expect(e.factors.find((f) => f.id === 'h2h')?.direction).toBe('unavailable');
  });

  it('con pocos enfrentamientos directos solo los muestra como información', () => {
    const e = buildExplanation({ ...base, market: 'goals_total', side: 'over', line: 2.5, h2h: [game(HOME, AWAY, 2, 1)] });
    expect(e.factors.find((f) => f.id === 'h2h')?.direction).toBe('info');
  });

  it('remates y xG: sin datos quedan en "no disponible", con datos se usan', () => {
    const without = buildExplanation({ ...base, market: 'goals_total', side: 'over', line: 2.5 });
    expect(without.factors.find((f) => f.id === 'shots')).toBeUndefined();
    expect(without.unavailable.some((u) => u.includes('xG'))).toBe(true);

    const withShots = (gs: HistGame[], id: number) =>
      gs.map((g) => ({ ...g, hShots: 12, aShots: 10, hSot: 5, aSot: 4, hXg: g.home === id ? 2 : 1, aXg: g.away === id ? 2 : 1 }));
    const e = buildExplanation({ ...base, homeGames: withShots(homeGames, HOME), awayGames: withShots(awayGames, AWAY), market: 'goals_total', side: 'over', line: 2.5 });
    expect(e.factors.find((f) => f.id === 'shots')).toBeDefined();
    expect(e.factors.find((f) => f.id === 'xg')).toBeDefined();
  });

  it('córners: avisa de lo que no tenemos (bandas, centros, bloqueados)', () => {
    const e = buildExplanation({ ...base, market: 'corners_total', side: 'over', line: 9.5 });
    expect(e.unavailable.join(' ')).toMatch(/bandas/);
    expect(e.factors.find((f) => f.id === 'shots')).toBeUndefined();
  });

  it('sin historial de un equipo no explica nada', () => {
    const e = buildExplanation({ ...base, homeGames: [], market: 'goals_total', side: 'over', line: 2.5 });
    expect(e.factors).toEqual([]);
    expect(e.unavailable).toHaveLength(1);
  });
});
