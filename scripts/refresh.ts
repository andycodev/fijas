// Actualización completa: resultados nuevos (Football-Data) → partidos por jugar (API-Football) → picks.
// La llama el botón de la app (vía el servidor de desarrollo) y también se puede correr a mano:
//   npx tsx --env-file=.env scripts/refresh.ts
import { createServiceClient, isMain } from './db.ts';
import { loadFootballData } from './load-football-data.ts';
import { syncFixtures } from './sync-fixtures.ts';
import { generatePicks, settlePicks } from './picks.ts';
import { syncOdds } from './sync-odds.ts';

const currentSeason = () => {
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1; // temporada empieza en julio/agosto
};

export async function refreshAll(log: (s: string) => void = console.log) {
  const db = createServiceClient();
  log('1/5 Resultados recientes (Football-Data)…');
  await loadFootballData(db, [currentSeason()], log);
  log('\n2/5 Resultado real de picks anteriores…');
  await settlePicks(db, log);
  log('\n3/5 Partidos de hoy y mañana (API-Football)…');
  const fixtures = await syncFixtures(db, 1, log);
  log('\n4/5 Picks…');
  const picks = await generatePicks(db, log);
  log('\n5/5 Cuotas de Betano…');
  const odds = await syncOdds(db, log);
  return { fixtures, picks, odds };
}

if (isMain(import.meta.url)) await refreshAll();
