// Búsqueda y orden de ligas (puro, para la app y las pruebas).

export interface CatalogItem {
  id: number;
  name: string;
  country: string;
  type: string;
  hasHistory: boolean;
}

// Minúsculas y sin tildes: «bundesliga», «Perú» y «peru» se encuentran entre sí.
export const normalizeText = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function matchesQuery(item: { name: string; country: string }, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const haystack = normalizeText(`${item.name} ${item.country}`);
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

// Catálogo de la API que aún no está agregado, filtrado por la búsqueda.
export function searchCatalog(catalog: CatalogItem[], query: string, alreadyAdded: Set<number>, limit = 40): CatalogItem[] {
  return catalog
    .filter((c) => !alreadyAdded.has(c.id) && matchesQuery(c, query))
    .sort((a, b) => Number(b.hasHistory) - Number(a.hasHistory) || a.country.localeCompare(b.country) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// Favoritas primero, luego activas, luego por nombre.
export function sortLeagues<T extends { id: number; name: string }>(leagues: T[], favorites: Set<number>, active: Set<number>): T[] {
  return [...leagues].sort(
    (a, b) =>
      Number(favorites.has(b.id)) - Number(favorites.has(a.id)) ||
      Number(active.has(b.id)) - Number(active.has(a.id)) ||
      a.name.localeCompare(b.name),
  );
}

export function toggleIds(current: number[], ids: number[], on: boolean): number[] {
  const set = new Set(current);
  for (const id of ids) (on ? set.add(id) : set.delete(id));
  return [...set];
}
