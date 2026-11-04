// Carga el histórico de Football-Data.co.uk (córners totales HC/AC) en Supabase.
// Solo servidor: usa la service role key. No se importa desde la app.
// Uso: npx tsx --env-file=.env scripts/load-football-data.ts [temporadas separadas por coma, p. ej. 2022,2023,2024,2025,2026]
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://football-data.co.uk/mmz4281';
const seasons = (process.argv[2] ?? '2022,2023,2024,2025,2026').split(',').map(Number);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env');
// Node 20 no trae WebSocket nativo y estos scripts no usan tiempo real: transporte vacío para que createClient no falle.
const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: class {} as never } });

// CSV simple (Football-Data no usa comillas con comas internas en estas columnas).
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

// Fecha dd/mm/yyyy o dd/mm/yy + hora opcional. La hora del CSV es local del país; aquí se guarda
// tal cual como UTC (aproximación suficiente para ordenar partidos; no se usa para decidir apuestas).
function kickoff(date: string, time: string): string | null {
  const m = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const [hh, mm] = /^\d{1,2}:\d{2}$/.test(time) ? time.split(':') : ['12', '00'];
  return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1]), Number(hh), Number(mm))).toISOString();
}

const toInt = (v: string): number | null => (/^\d+$/.test(v) ? Number(v) : null);

const { data: leagues, error: lerr } = await db.from('leagues').select('id, name, football_data_code').not('football_data_code', 'is', null);
if (lerr) throw lerr;
if (!leagues?.length) throw new Error('No hay ligas en la tabla leagues. ¿Ejecutaste las migraciones?');

for (const season of seasons) {
  const code = `${String(season).slice(2)}${String(season + 1).slice(2)}`;
  for (const league of leagues) {
    const res = await fetch(`${BASE}/${code}/${league.football_data_code}.csv`);
    if (!res.ok) { console.log(`${league.name} ${season}: HTTP ${res.status}, omitido`); continue; }
    const rows = parseCsv(await res.text()).filter((r) => r.HomeTeam && r.AwayTeam);

    // Equipos
    const names = [...new Set(rows.flatMap((r) => [r.HomeTeam, r.AwayTeam]))];
    const { error: terr } = await db.from('teams').upsert(
      names.map((name) => ({ league_id: league.id, name, football_data_name: name })),
      { onConflict: 'league_id,name', ignoreDuplicates: true },
    );
    if (terr) throw terr;
    const { data: teams, error: t2 } = await db.from('teams').select('id, name').eq('league_id', league.id);
    if (t2) throw t2;
    const teamId = new Map(teams!.map((t) => [t.name, t.id as number]));

    // Partidos
    const matchRows = rows.flatMap((r) => {
      const ko = kickoff(r.Date, r.Time);
      if (!ko) return [];
      return [{
        league_id: league.id, season, kickoff_at: ko,
        home_team_id: teamId.get(r.HomeTeam)!, away_team_id: teamId.get(r.AwayTeam)!,
        status: r.FTHG !== '' ? 'finished' : 'scheduled',
      }];
    });
    const { error: merr } = await db.from('matches').upsert(matchRows, { onConflict: 'league_id,season,home_team_id,away_team_id' });
    if (merr) throw merr;

    const { data: matches, error: m2 } = await db.from('matches')
      .select('id, home_team_id, away_team_id').eq('league_id', league.id).eq('season', season);
    if (m2) throw m2;
    const matchId = new Map(matches!.map((m) => [`${m.home_team_id}-${m.away_team_id}`, m.id as number]));

    // Córners totales (HC/AC) y goles totales (FTHG/FTAG).
    // Lo que el CSV no trae queda en null: no se inventa nada. Sin ningún dato, no hay fila.
    const stats = rows.flatMap((r) => {
      const id = matchId.get(`${teamId.get(r.HomeTeam)}-${teamId.get(r.AwayTeam)}`);
      const row = {
        match_id: id,
        home_corners_total: toInt(r.HC), away_corners_total: toInt(r.AC),
        home_goals_total: toInt(r.FTHG), away_goals_total: toInt(r.FTAG),
        source: 'football_data',
      };
      const hasData = [row.home_corners_total, row.home_goals_total].some((v) => v !== null);
      return id && hasData ? [row] : [];
    });
    // ignoreDuplicates: no pisa filas ya completadas con detalle por tiempo desde API-Football.
    const { error: serr } = await db.from('match_stats').upsert(stats, { onConflict: 'match_id', ignoreDuplicates: true });
    if (serr) throw serr;

    console.log(`${league.name} ${season}: ${rows.length} filas CSV, ${matchRows.length} partidos, ${stats.length} con estadísticas (${rows.length - stats.length} sin datos)`);
    await new Promise((r) => setTimeout(r, 1000)); // cortesía con el servidor
  }
}
