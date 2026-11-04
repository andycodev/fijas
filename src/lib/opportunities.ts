import { edge } from './value';
import { bandOf, type Band } from './probability';
import type { Market, OddsRow, UpcomingMatch } from '../types/db';

export type Side = 'over' | 'under';

export interface ResolvedOdds {
  odds: number;
  origin: 'auto' | 'manual'; // manual = la escribió el usuario (confirmada); auto = Betano vía proveedor, sin verificar
  capturedAt: string;
}

// Cuota de Betano para una selección. Si el usuario escribió la suya, manda sobre la del proveedor.
export function resolveOdds(rows: OddsRow[], matchId: number, market: Market, line: number, side: Side): ResolvedOdds | null {
  const field = side === 'over' ? 'over_odds' : 'under_odds';
  const candidates = rows.filter(
    (r) => r.match_id === matchId && r.market === market && Number(r.line) === line && Number(r[field]) > 1,
  );
  const best = candidates.find((r) => r.origin === 'manual') ?? candidates.find((r) => r.origin === 'auto');
  return best ? { odds: Number(best[field]), origin: best.origin, capturedAt: best.captured_at } : null;
}

// ───────── Selecciones evaluadas ─────────
export interface Selection {
  key: string;
  matchId: number;
  match: UpcomingMatch;
  market: Market;
  line: number;
  side: Side;
  pickId: number;
  projection: number;
  probability: number; // del modelo
  fairOdds: number; // 1 / probabilidad
  band: Band;
  betano: ResolvedOdds | null;
  ev: number | null; // valor esperado con la cuota de Betano
  gamesHome: number | null;
  gamesAway: number | null;
  latestGameAt: string | null;
}

export function listSelections(matches: UpcomingMatch[], rows: OddsRow[]): Selection[] {
  const out: Selection[] = [];
  for (const match of matches) {
    for (const pick of match.picks) {
      for (const side of ['over', 'under'] as const) {
        const probability = side === 'over' ? Number(pick.probability) : 1 - Number(pick.probability);
        if (probability <= 0 || probability >= 1) continue;
        const line = Number(pick.line);
        const betano = resolveOdds(rows, match.id, pick.market, line, side);
        out.push({
          key: `${match.id}-${pick.market}-${line}-${side}`,
          matchId: match.id, match, market: pick.market, line, side, pickId: pick.id,
          projection: Number(pick.projection), probability, fairOdds: 1 / probability, band: bandOf(probability),
          betano, ev: betano ? edge(probability, betano.odds) : null,
          gamesHome: pick.home_games_used ?? null, gamesAway: pick.away_games_used ?? null, latestGameAt: pick.latest_game_at ?? null,
        });
      }
    }
  }
  return out;
}

export interface Analysis {
  matchesAnalyzed: number; // partidos con proyección
  marketsEvaluated: number; // pares partido × mercado
  selectionsEvaluated: number; // líneas × lado
  meetMinimum: Selection[]; // probabilidad ≥ mínimo
  withOdds: Selection[]; // de ésas, con cuota de Betano
  recommended: Selection[]; // de ésas, con valor ≥ umbral (ordenadas por valor)
  highProbabilityNoValue: Selection[]; // cumplen la probabilidad pero la cuota no tiene valor
  highProbabilityNoOdds: Selection[]; // cumplen la probabilidad pero no hay cuota de Betano
}

// Embudo: probabilidad mínima → cuota de Betano disponible → valor esperado.
// Solo se recomienda lo que cumple todos los filtros.
export function analyze(
  matches: UpcomingMatch[],
  rows: OddsRow[],
  opts: { minProbability: number; valueThreshold: number },
): Analysis {
  const all = listSelections(matches, rows);
  const meetMinimum = all.filter((s) => s.probability >= opts.minProbability);
  const withOdds = meetMinimum.filter((s) => s.ev !== null);
  const recommended = withOdds.filter((s) => s.ev! >= opts.valueThreshold).sort((a, b) => b.ev! - a.ev!);
  return {
    matchesAnalyzed: new Set(all.map((s) => s.matchId)).size,
    marketsEvaluated: new Set(all.map((s) => `${s.matchId}-${s.market}`)).size,
    selectionsEvaluated: all.length,
    meetMinimum,
    withOdds,
    recommended,
    highProbabilityNoValue: withOdds.filter((s) => s.ev! < opts.valueThreshold).sort((a, b) => b.ev! - a.ev!),
    highProbabilityNoOdds: meetMinimum.filter((s) => s.ev === null),
  };
}

// ───────── Confianza estadística ─────────
export type Confidence = 'high' | 'medium' | 'low';

export interface CalibrationBucket {
  label: string;
  from: number;
  to: number;
  n: number;
  predicted: number | null; // % medio previsto
  actual: number | null; // % real de aciertos
}

export interface ConfidenceReport {
  level: Confidence;
  reasons: { label: string; level: Confidence }[];
}

const LEVEL: Confidence[] = ['low', 'medium', 'high'];

// La confianza es la más baja de tres evidencias: tamaño de la muestra, antigüedad de los datos y
// si, en el backtest, las probabilidades de ese tramo se cumplieron.
export function confidenceFor(
  s: Pick<Selection, 'probability' | 'gamesHome' | 'gamesAway' | 'latestGameAt'>,
  buckets: CalibrationBucket[] | undefined,
  now: Date = new Date(),
): ConfidenceReport {
  const reasons: ConfidenceReport['reasons'] = [];

  const games = Math.min(s.gamesHome ?? 0, s.gamesAway ?? 0);
  reasons.push({
    label: s.gamesHome === null ? 'Partidos usados: no registrado' : `Partidos usados: ${s.gamesHome} del local y ${s.gamesAway} del visitante`,
    level: games >= 10 ? 'high' : games >= 8 ? 'medium' : 'low',
  });

  const days = s.latestGameAt ? Math.floor((now.getTime() - Date.parse(s.latestGameAt)) / 86_400_000) : null;
  reasons.push({
    label: days === null ? 'Antigüedad de los datos: no registrada' : `Último partido usado hace ${days} día${days === 1 ? '' : 's'}`,
    level: days === null ? 'low' : days <= 35 ? 'high' : days <= 70 ? 'medium' : 'low',
  });

  const b = buckets?.find((x) => s.probability >= x.from && s.probability < (x.to >= 1 ? 1.0001 : x.to));
  if (b && b.n > 0 && b.predicted !== null && b.actual !== null) {
    const gap = Math.abs(b.predicted - b.actual);
    reasons.push({
      label: `Histórico del tramo ${b.label}: previsto ${b.predicted}%, real ${b.actual}% (${b.n} casos)`,
      level: b.n >= 300 && gap <= 3 ? 'high' : b.n >= 100 && gap <= 6 ? 'medium' : 'low',
    });
  } else {
    reasons.push({ label: 'Histórico de este tramo: sin evidencia suficiente', level: 'low' });
  }

  const min = Math.min(...reasons.map((r) => LEVEL.indexOf(r.level)));
  return { level: LEVEL[min]!, reasons };
}
