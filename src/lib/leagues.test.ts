import { describe, expect, it } from 'vitest';
import { matchesQuery, searchCatalog, sortLeagues, toggleIds, type CatalogItem } from './leagues';

const catalog: CatalogItem[] = [
  { id: 1, name: 'Eredivisie', country: 'Netherlands', type: 'League', hasHistory: true },
  { id: 2, name: 'Liga 1', country: 'Peru', type: 'League', hasHistory: false },
  { id: 3, name: 'Primera División', country: 'Argentina', type: 'League', hasHistory: false },
  { id: 4, name: 'Premier League', country: 'England', type: 'League', hasHistory: true },
];

describe('búsqueda', () => {
  it('encuentra por nombre o por país, sin importar tildes ni mayúsculas', () => {
    expect(matchesQuery(catalog[2]!, 'division')).toBe(true);
    expect(matchesQuery(catalog[1]!, 'PERU')).toBe(true);
    expect(matchesQuery(catalog[0]!, 'netherlands eredi')).toBe(true);
    expect(matchesQuery(catalog[0]!, 'peru')).toBe(false);
  });
  it('excluye lo ya agregado y pone primero lo que tiene histórico', () => {
    const r = searchCatalog(catalog, '', new Set([4]));
    expect(r.map((x) => x.id)).toEqual([1, 3, 2]);
  });
  it('respeta el límite de resultados', () => {
    expect(searchCatalog(catalog, '', new Set(), 2)).toHaveLength(2);
  });
});

describe('orden y selección múltiple', () => {
  const leagues = [{ id: 1, name: 'B' }, { id: 2, name: 'A' }, { id: 3, name: 'C' }];
  it('favoritas primero, luego activas, luego alfabético', () => {
    expect(sortLeagues(leagues, new Set([3]), new Set([1])).map((l) => l.id)).toEqual([3, 1, 2]);
  });
  it('activa y desactiva varias a la vez sin duplicar', () => {
    expect(toggleIds([1, 2], [2, 3], true).sort()).toEqual([1, 2, 3]);
    expect(toggleIds([1, 2, 3], [1, 3], false)).toEqual([2]);
  });
});
