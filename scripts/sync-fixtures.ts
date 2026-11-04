// Trae los partidos de hoy y de los próximos días (1 solicitud por día) de las 4 ligas y de las
// competiciones europeas, y los guarda en matches. Solo servidor.
// Uso: npx tsx --env-file=.env scripts/sync-fixtures.ts [díasHaciaAdelante=1]
import { createServiceClient, isMain, type Db } from './db.ts';
import { apiGet, requestsUsedToday } from './api-football.ts';
import { matchTeam, type DbTeam } from './team-match.ts';

// El plan gratis solo permite fechas desde ayer hasta mañana: más de 1 día adelante lo rechaza (y cuenta como solicitud).

// Competiciones que interesan. Se amplía aquí (p. ej. copas nacionales) sin tocar el resto.
const DOMESTIC = [39, 140, 135, 78];
const EUROPEAN = [
  { api_football_id: 2, name: 'UEFA Champions League' },
  { api_football_id: 3, name: 'UEFA Europa League' },
  { api_football_id: 848, name: 'UEFA Conference League' },
];
const WANTED = new Set([...DOMESTIC, ...EUROPEAN.map((c) => c.api_football_id)]);
const MIN_HISTORY = 8; // partidos con córners que se exigen para poder dar un pick

const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

function statusOf(short: string): 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled' {
  if (['NS', 'TBD'].includes(short)) return 'scheduled';
  if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(short)) return 'live';
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished';
  if (['PST', 'SUSP', 'INT'].includes(short)) return 'postponed';
  return 'cancelled';
}

export async function syncFixtures(db: Db, DAYS_AHEAD = 1, log: (s: string) => void = console.log) {
// 1) Competiciones europeas en leagues (idempotente)
must(
  await db
    .from('leagues')
    .upsert(EUROPEAN.map((c) => ({ ...c, country: 'Europe', active: true })), { onConflict: 'api_football_id' }),
);
const leagues = must(await db.from('leagues').select('id, name, api_football_id')) as { id: number; name: string; api_football_id: number }[];
const leagueByApi = new Map(leagues.map((l) => [l.api_football_id, l]));

// 2) Equipos conocidos
const teams = must(
  await db.from('teams').select('id, league_id, name, football_data_name, aliases, api_football_id'),
) as (DbTeam & { league_id: number })[];
const teamByApi = new Map(teams.filter((t) => t.api_football_id).map((t) => [t.api_football_id!, t]));
const unmatched = new Set<string>();

async function resolveTeam(api: { id: number; name: string }, league: { id: number; api_football_id: number }) {
  const known = teamByApi.get(api.id);
  if (known) return known;

  const isDomestic = DOMESTIC.includes(league.api_football_id);
  // Liga nacional: se une solo con equipos de esa liga aún sin id (ascendidos). Europea: solo coincidencia exacta.
  const pool = teams.filter((t) => !t.api_football_id && (isDomestic ? t.league_id === league.id : true));
  const found = matchTeam(api.name, pool, { exactOnly: !isDomestic });
  if (found) {
    must(await db.from('teams').update({ api_football_id: api.id, aliases: [...new Set([...found.aliases, api.name])] }).eq('id', found.id));
    found.api_football_id = api.id;
    teamByApi.set(api.id, found as DbTeam & { league_id: number });
    return found;
  }
  if (isDomestic) {
    unmatched.add(`${api.name} (api ${api.id}, ${leagueByApi.get(league.api_football_id)?.name})`);
    return null; // nunca se crea un duplicado de un equipo de las 4 ligas
  }
  // Club de fuera de las 4 ligas: se crea sin historial.
  const created = must(
    await db
      .from('teams')
      .insert({ league_id: league.id, name: api.name, api_football_id: api.id })
      .select('id, league_id, name, football_data_name, aliases, api_football_id')
      .single(),
  ) as DbTeam & { league_id: number };
  teams.push(created);
  teamByApi.set(api.id, created);
  return created;
}

// 3) Partidos de hoy y próximos días
interface Row { when: string; comp: string; home: DbTeam; away: DbTeam; matchId: number }
const rows: Row[] = [];
const dates = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10));

for (const date of dates) {
  const res = await apiGet('/fixtures', { date }, { maxAgeHours: 6 });
  if (res.body.errors && Object.keys(res.body.errors).length) throw new Error(`API: ${JSON.stringify(res.body.errors)}`);
  const wanted = (res.body.response as any[]).filter((f) => WANTED.has(f.league.id));
  log(`${date}: ${res.body.results} partidos en el mundo, ${wanted.length} de las competiciones elegidas`);

  for (const f of wanted) {
    const league = leagueByApi.get(f.league.id)!;
    const home = await resolveTeam(f.teams.home, league);
    const away = await resolveTeam(f.teams.away, league);
    if (!home || !away) continue;

    const record = {
      league_id: league.id,
      season: f.league.season,
      kickoff_at: f.fixture.date,
      home_team_id: home.id,
      away_team_id: away.id,
      status: statusOf(f.fixture.status.short),
      api_football_id: f.fixture.id,
    };
    let existing = must(await db.from('matches').select('id').eq('api_football_id', f.fixture.id).maybeSingle());
    existing ??= must(
      await db.from('matches').select('id').eq('league_id', league.id).eq('season', record.season)
        .eq('home_team_id', home.id).eq('away_team_id', away.id).maybeSingle(),
    );
    let matchId: number;
    if (existing) {
      matchId = (existing as { id: number }).id;
      must(await db.from('matches').update(record).eq('id', matchId));
    } else {
      matchId = (must(await db.from('matches').insert(record).select('id').single()) as { id: number }).id;
    }
    rows.push({ when: f.fixture.date, comp: league.name, home, away, matchId });
  }
}

// 4) Historial disponible por equipo (partidos terminados con córners)
const teamIds = [...new Set(rows.flatMap((r) => [r.home.id, r.away.id]))];
const history = new Map<number, number>();
if (teamIds.length) {
  for (const col of ['home_team_id', 'away_team_id'] as const) {
    for (let from = 0; ; from += 1000) {
      const page = must(
        await db.from('matches').select(`${col}, match_stats!inner(home_corners_total)`).in(col, teamIds)
          .eq('status', 'finished').not('match_stats.home_corners_total', 'is', null).range(from, from + 999),
      ) as Record<string, number>[];
      for (const m of page) history.set(m[col]!, (history.get(m[col]!) ?? 0) + 1);
      if (page.length < 1000) break;
    }
  }
}

log('\nPartidos guardados:');
for (const r of rows.sort((a, b) => a.when.localeCompare(b.when))) {
  const h = history.get(r.home.id) ?? 0, a = history.get(r.away.id) ?? 0;
  const ok = h >= MIN_HISTORY && a >= MIN_HISTORY;
  log(`  ${r.when.slice(0, 16).replace('T', ' ')}Z  ${r.comp.padEnd(24)} ${r.home.name} vs ${r.away.name}  historial ${h}/${a} ${ok ? '✓ con pick posible' : '✗ sin historial suficiente'}`);
}
if (unmatched.size) log('\nEquipos de ligas nacionales sin unir (revisar alias):\n  ' + [...unmatched].join('\n  '));
log(`\nSolicitudes a API-Football usadas hoy: ${requestsUsedToday()}`);
return {
  saved: rows.length,
  withHistory: rows.filter((r) => (history.get(r.home.id) ?? 0) >= MIN_HISTORY && (history.get(r.away.id) ?? 0) >= MIN_HISTORY).length,
  unmatched: [...unmatched],
  apiRequestsToday: requestsUsedToday(),
};
}

if (isMain(import.meta.url)) {
  // El plan gratis solo permite fechas desde ayer hasta mañana: más de 1 día adelante lo rechaza.
  await syncFixtures(createServiceClient(), Number(process.argv[2] ?? 1));
}
