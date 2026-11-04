// Une los equipos de la base (Football-Data) con los ids de API-Football.
// Uso: npx tsx --env-file=.env scripts/map-teams.ts [--write]
// Sin --write solo informa. Lee scripts/.cache/api-teams.json (generado con /teams de API-Football).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { matchTeam, type DbTeam } from './team-match.ts';

const write = process.argv.includes('--write');
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: class {} as never },
});

const apiTeams = JSON.parse(readFileSync(new URL('./.cache/api-teams.json', import.meta.url), 'utf8')) as Record<
  string,
  { id: number; name: string }[]
>;
const LEAGUE_BY_KEY: Record<string, number> = { PL: 39, LL: 140, SA: 135, BL: 78 };

const { data: leagues } = await db.from('leagues').select('id, api_football_id');
const { data: current } = await db.from('matches').select('home_team_id, away_team_id').eq('season', 2026);
const currentIds = new Set((current ?? []).flatMap((m) => [m.home_team_id, m.away_team_id]));

for (const [key, apiLeague] of Object.entries(LEAGUE_BY_KEY)) {
  const leagueId = leagues!.find((l) => l.api_football_id === apiLeague)!.id;
  const { data } = await db.from('teams').select('id, name, football_data_name, aliases, api_football_id').eq('league_id', leagueId);
  const teams = data as DbTeam[];
  const used = new Set<number>();
  const unmatchedApi: string[] = [];
  let linked = 0;

  for (const a of apiTeams[key] ?? []) {
    const t = matchTeam(a.name, teams.filter((x) => !used.has(x.id)));
    if (!t) { unmatchedApi.push(a.name); continue; }
    used.add(t.id);
    linked++;
    if (a.name !== t.name) console.log('   ' + key + ': ' + a.name + '  <->  ' + t.name);
    if (write && t.api_football_id !== a.id) {
      const { error } = await db.from('teams').update({ api_football_id: a.id, aliases: [...new Set([...t.aliases, a.name])] }).eq('id', t.id);
      if (error) throw error;
    }
  }
  const dbLeft = teams.filter((t) => !used.has(t.id) && currentIds.has(t.id)).map((t) => t.name);
  console.log(`${key}: ${linked} unidos${write ? ' y guardados' : ' (prueba)'} · sin unir en API: [${unmatchedApi.join(', ')}] · equipos 2026 sin id API: [${dbLeft.join(', ')}]`);
}
