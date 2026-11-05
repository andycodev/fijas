export type DayFilter = 'today' | 'tomorrow' | 'all';

const localDayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// Filtra por la fecha REAL del partido en hora local (no por cuándo se obtuvieron los datos), excluye lo que ya empezó
// y ordena cronológicamente.
export function filterByDay<T extends { kickoff_at: string }>(items: T[], day: DayFilter, now: Date = new Date()): T[] {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const wanted = day === 'today' ? localDayKey(now) : day === 'tomorrow' ? localDayKey(tomorrow) : null;
  return items
    .filter((m) => Date.parse(m.kickoff_at) > now.getTime())
    .filter((m) => wanted === null || localDayKey(new Date(m.kickoff_at)) === wanted)
    .sort((a, b) => Date.parse(a.kickoff_at) - Date.parse(b.kickoff_at));
}

export const DAY_LABEL: Record<DayFilter, string> = { today: 'Hoy', tomorrow: 'Mañana', all: 'Todos' };
