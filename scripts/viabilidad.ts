// Paso 1: ¿devuelve API-Football córners por tiempo?
// Uso: node --env-file=.env --experimental-strip-types scripts/viabilidad.ts [temporadaActual] [temporadaPasada]
import { writeFileSync, mkdirSync } from 'node:fs';
import { apiGet, requestsUsedToday } from './api-football.ts';

const LEAGUES = [
  { id: 39, label: 'Premier League' },
  { id: 140, label: 'LaLiga' },
  { id: 135, label: 'Serie A' },
  { id: 78, label: 'Bundesliga' },
];

const currentSeason = Number(process.argv[2] ?? 2025);
const previousSeason = Number(process.argv[3] ?? currentSeason - 1);

// Busca recursivamente entradas { type: 'Corner Kicks', value } y devuelve las rutas halladas.
// deno-lint-ignore no-explicit-any
function findCorners(node: any, path = '$'): { path: string; value: unknown }[] {
  const found: { path: string; value: unknown }[] = [];
  if (Array.isArray(node)) {
    node.forEach((n, i) => found.push(...findCorners(n, `${path}[${i}]`)));
  } else if (node && typeof node === 'object') {
    if (node.type === 'Corner Kicks') found.push({ path, value: node.value });
    for (const [k, v] of Object.entries(node)) found.push(...findCorners(v, `${path}.${k}`));
  }
  return found;
}

interface Row {
  league: string;
  season: number;
  match: string;
  fixtureId: number | null;
  leagueNameFromApi: string;
  total: string;
  firstHalf: string;
  secondHalf: string;
  requests: number;
  notes: string;
}

async function probe(leagueId: number, label: string, season: number): Promise<Row> {
  let requests = 0;
  const row: Row = {
    league: label, season, match: '-', fixtureId: null, leagueNameFromApi: '-',
    total: 'n/d', firstHalf: 'n/d', secondHalf: 'n/d', requests: 0, notes: '',
  };
  const count = (r: { fromCache: boolean }) => { if (!r.fromCache) requests++; };

  console.log(`\n== ${label} · temporada ${season}`);
  const fx = await apiGet('/fixtures', { league: leagueId, season, status: 'FT', from: `${season + 1}-05-01`, to: `${season + 1}-05-15` });
  count(fx);
  const err = fx.body.errors && Object.keys(fx.body.errors).length ? JSON.stringify(fx.body.errors) : '';
  const fixture = fx.body.response?.[0];
  if (!fixture) {
    row.notes = err ? `fixtures: ${err}` : 'fixtures: sin resultados';
    row.requests = requests;
    return row;
  }
  row.fixtureId = fixture.fixture.id;
  row.leagueNameFromApi = fixture.league?.name ?? '-';
  row.match = `${fixture.teams.home.name} vs ${fixture.teams.away.name} (${fixture.fixture.date.slice(0, 10)})`;

  const plain = await apiGet('/fixtures/statistics', { fixture: row.fixtureId! });
  count(plain);
  const half = await apiGet('/fixtures/statistics', { fixture: row.fixtureId!, half: true });
  count(half);

  const plainCorners = findCorners(plain.body.response);
  const halfCorners = findCorners(half.body.response);
  row.total = plainCorners.length ? 'sí' : 'no';
  row.notes = [
    plain.body.errors && Object.keys(plain.body.errors).length ? `stats: ${JSON.stringify(plain.body.errors)}` : '',
    half.body.errors && Object.keys(half.body.errors).length ? `stats half: ${JSON.stringify(half.body.errors)}` : '',
    `rutas córners con half=true: ${halfCorners.map((c) => c.path).join(', ') || 'ninguna'}`,
  ].filter(Boolean).join(' | ');
  // El veredicto por tiempo se fija tras revisar la forma real de la respuesta (ver cache).
  row.firstHalf = 'revisar';
  row.secondHalf = 'revisar';
  row.requests = requests;
  return row;
}

const rows: Row[] = [];
for (const l of LEAGUES) rows.push(await probe(l.id, l.label, currentSeason));
rows.push(await probe(LEAGUES[0].id, LEAGUES[0].label, previousSeason));

mkdirSync(new URL('./.cache/', import.meta.url), { recursive: true });
writeFileSync(new URL('./.cache/viabilidad-rows.json', import.meta.url), JSON.stringify(rows, null, 2));
console.log(`\nSolicitudes usadas hoy: ${requestsUsedToday()}`);
console.table(rows.map(({ league, season, match, leagueNameFromApi, total, requests, notes }) => ({ league, season, match, leagueNameFromApi, total, requests, notes })));
