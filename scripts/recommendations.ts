// Registra las recomendaciones que el análisis genera para un usuario, para poder evaluar al modelo después.
// Usa EXACTAMENTE la misma lógica que la pantalla de Picks (src/lib/opportunities.ts), así lo registrado coincide con lo mostrado.
import type { Db } from './db.ts';
import { analyze, latestVersionPicks, type Selection } from '../src/lib/opportunities.ts';
import { buildExplanation } from '../src/lib/explain.ts';
import { loadExplanationData } from '../src/lib/explainData.ts';
import type { OddsRow, UpcomingMatch } from '../src/types/db.ts';

export interface RecommendationOptions {
  userId: string;
  runId: number;
  activeLeagueIds?: number[];
  minProbability: number;
  valueThreshold: number;
}

// Justificación congelada: lo que el modelo sabía y calculó en el momento de recomendar.
async function rationaleOf(db: Db, s: Selection, o: RecommendationOptions) {
  const base = {
    model_version: null as string | null,
    projection: Math.round(s.projection * 100) / 100,
    fair_odds: Math.round(s.fairOdds * 100) / 100,
    games_home: s.gamesHome, games_away: s.gamesAway, latest_game_at: s.latestGameAt,
    min_probability: o.minProbability, value_threshold: o.valueThreshold,
    odds_captured_at: s.betano?.capturedAt ?? null,
    summary:
      `El modelo proyecta ${s.projection.toFixed(1)} en total y da ${(s.probability * 100).toFixed(1)}% a este lado (cuota justa ${s.fairOdds.toFixed(2)}). ` +
      `Betano pagaba ${s.betano!.odds.toFixed(2)}: valor esperado ${s.ev! >= 0 ? '+' : ''}${(s.ev! * 100).toFixed(1)}%.`,
    factors: [] as { title: string; detail: string; direction: string }[],
    unavailable: [] as string[],
  };
  try {
    const data = await loadExplanationData(db as never, s.market, s.match.home_team_id, s.match.away_team_id);
    const ex = buildExplanation({
      market: s.market, side: s.side, line: s.line, homeId: s.match.home_team_id, awayId: s.match.away_team_id,
      homeName: s.match.home?.name ?? 'Local', awayName: s.match.away?.name ?? 'Visitante', ...data,
    });
    base.factors = ex.factors.map((f) => ({ title: f.title, detail: f.detail, direction: f.direction }));
    base.unavailable = ex.unavailable;
  } catch { /* sin detalle de factores: se conservan las cifras del modelo */ }
  return base;
}

export async function logRecommendations(db: Db, o: RecommendationOptions): Promise<{ logged: number; total: number; lowValueLogged: number; lowValueTotal: number }> {
  const now = Date.now();
  let q = db
    .from('matches')
    .select(
      'id, league_id, home_team_id, away_team_id, kickoff_at, league:leagues(name), home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name), picks(id, line, projection, probability, min_odds, model_version, market, home_games_used, away_games_used, latest_game_at)',
    )
    .eq('status', 'scheduled')
    .gte('kickoff_at', new Date(now - 3 * 3600_000).toISOString())
    .lte('kickoff_at', new Date(now + 72 * 3600_000).toISOString());
  if (o.activeLeagueIds?.length) q = q.in('league_id', o.activeLeagueIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const matches = (data as unknown as UpcomingMatch[])
    .map((m) => ({ ...m, picks: latestVersionPicks(m.picks) }))
    .filter((m) => m.picks.length > 0);
  if (!matches.length) return { logged: 0, total: 0, lowValueLogged: 0, lowValueTotal: 0 };

  // Cuotas de Betano: las del proveedor (sin usuario) y las que escribió este usuario.
  const { data: odds, error: oerr } = await db
    .from('odds')
    .select('id, match_id, market, line, over_odds, under_odds, origin, captured_at')
    .eq('bookmaker', 'betano')
    .in('match_id', matches.map((m) => m.id))
    .or(`user_id.is.null,user_id.eq.${o.userId}`);
  if (oerr) throw new Error(oerr.message);

  const modelVersions = new Map(matches.flatMap((m) => m.picks.map((p) => [p.id, p.model_version] as const)));
  const { recommended, lowValue } = analyze(matches, odds as OddsRow[], { minProbability: o.minProbability, valueThreshold: o.valueThreshold });

  const build = (list: Selection[], category: 'main' | 'low_value') => Promise.all(list.map(async (s) => ({
    category,
    user_id: o.userId,
    run_id: o.runId,
    pick_id: s.pickId,
    match_id: s.matchId,
    market: s.market,
    line: s.line,
    side: s.side,
    model_probability: Math.round(s.probability * 10000) / 10000,
    odds: s.betano!.odds,
    ev: Math.round(s.ev! * 10000) / 10000,
    odds_origin: s.betano!.origin,
    league_id: s.match.league_id,
    kickoff_at: s.match.kickoff_at,
    rationale: { ...(await rationaleOf(db, s, o)), model_version: modelVersions.get(s.pickId) ?? null },
  })));
  const main = await build(recommended, 'main');
  // Valor entre 0 y el umbral: se guarda aparte («de estudio») y no se muestra como recomendación principal.
  const study = await build(lowValue, 'low_value');
  const rows = [...main, ...study];
  let inserted: { category?: string }[] = [];
  if (rows.length) {
    // Se conserva la primera vez que se recomendó (no se reescribe en cada análisis); solo se cuentan las nuevas.
    const up = await db.from('recommendations').upsert(rows, { onConflict: 'user_id,pick_id,side', ignoreDuplicates: true }).select('id, category');
    if (up.error && /category/.test(up.error.message)) {
      // La migración de categorías aún no se aplicó: se siguen guardando las principales y se avisa.
      const legacy = main.map(({ category: _c, ...r }) => r);
      const up2 = legacy.length ? await db.from('recommendations').upsert(legacy, { onConflict: 'user_id,pick_id,side', ignoreDuplicates: true }).select('id') : { data: [], error: null };
      if (up2.error) throw new Error(up2.error.message);
      inserted = (up2.data ?? []).map(() => ({ category: 'main' }));
      console.warn('Falta aplicar la migración 20261107000001_recommendation_category.sql: no se registraron las selecciones de estudio.');
    } else if (up.error) {
      throw new Error(up.error.message);
    } else {
      inserted = up.data ?? [];
    }
  }
  return {
    logged: inserted.filter((r) => r.category !== 'low_value').length,
    total: recommended.length,
    lowValueLogged: inserted.filter((r) => r.category === 'low_value').length,
    lowValueTotal: lowValue.length,
  };
}

// Cierra las recomendaciones cuyos partidos ya terminaron.
export async function settleRecommendations(db: Db): Promise<number> {
  const { data, error } = await db.rpc('settle_recommendations');
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
