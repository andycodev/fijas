// Une los clubes que llegaron por las copas europeas (sin historial) con su equipo de liga nacional (con historial).
// Antes de ampliar el histórico no había dónde unirlos; ahora sí. Solo une por nombre exacto (con alias conocidos): nunca por parecido.
//   npx tsx --env-file=.env scripts/relink-teams.ts          → informa, no cambia nada
//   npx tsx --env-file=.env scripts/relink-teams.ts --write  → aplica las uniones
import { createServiceClient, isMain } from './db.ts';
import { matchTeam, type DbTeam } from './team-match.ts';

export async function relinkTeams(write: boolean, log: (s: string) => void = console.log) {
  const db = createServiceClient();
  const leagues = (await db.from('leagues').select('id, name, football_data_code')).data ?? [];
  const domestic = new Set(leagues.filter((l) => l.football_data_code).map((l) => l.id as number));
  const teams = ((await db.from('teams').select('id, league_id, name, football_data_name, aliases, api_football_id')).data ?? []) as (DbTeam & { league_id: number })[];

  // Equipos creados por las copas (sin liga nacional) y equipos nacionales aún sin id de la API.
  const orphans = teams.filter((t) => !domestic.has(t.league_id) && t.api_football_id);
  const pool = teams.filter((t) => domestic.has(t.league_id) && !t.api_football_id);
  const joined: string[] = [];
  const left: string[] = [];

  for (const t of orphans) {
    const d = matchTeam(t.name, pool, { exactOnly: true });
    if (!d) { left.push(t.name); continue; }
    joined.push(`${t.name} → ${d.name}`);
    if (!write) continue;
    // 1) liberar el id de la API del duplicado, 2) pasárselo al equipo con historial, 3) apuntar sus partidos, 4) borrar el duplicado
    const apiId = t.api_football_id!;
    const steps = [
      await db.from('teams').update({ api_football_id: null }).eq('id', t.id),
      await db.from('teams').update({ api_football_id: apiId, aliases: [...new Set([...d.aliases, t.name])] }).eq('id', d.id),
      await db.from('matches').update({ home_team_id: d.id }).eq('home_team_id', t.id),
      await db.from('matches').update({ away_team_id: d.id }).eq('away_team_id', t.id),
    ];
    const bad = steps.find((s) => s.error);
    if (bad?.error) throw new Error(`${t.name}: ${bad.error.message}`);
    const del = await db.from('teams').delete().eq('id', t.id);
    if (del.error) log(`  ${t.name}: unido pero no se pudo borrar el duplicado (${del.error.message})`);
    pool.splice(pool.findIndex((x) => x.id === d.id), 1);
  }
  log(`${write ? 'Unidos' : 'Se unirían'} ${joined.length} de ${orphans.length} clubes de copas europeas:\n  ${joined.join('\n  ') || '—'}`);
  log(`Sin unión clara (${left.length}), siguen sin historial:\n  ${left.join(', ') || '—'}`);
  return { joined: joined.length, left: left.length };
}

if (isMain(import.meta.url)) await relinkTeams(process.argv.includes('--write'));
