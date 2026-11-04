import { edge } from './value';
import type { Market, OddsRow, UpcomingMatch } from '../types/db';

export type Side = 'over' | 'under';

export interface ResolvedOdds {
  odds: number;
  origin: 'auto' | 'manual'; // manual = la escribió el usuario (confirmada por él); auto = Betano vía proveedor, sin verificar
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

export type Confidence = 'high' | 'medium' | 'low';

// Confianza del análisis: en las colas (probabilidades muy altas o muy bajas) los supuestos del modelo
// pesan más y el backtest tiene menos casos, así que la confianza baja. Todos los picks ya exigen
// al menos 8 partidos de historial por equipo.
export function confidenceFor(probability: number): Confidence {
  if (probability >= 0.3 && probability <= 0.7) return 'high';
  if (probability >= 0.15 && probability <= 0.85) return 'medium';
  return 'low';
}

export interface Opportunity {
  matchId: number;
  match: UpcomingMatch;
  market: Market;
  line: number;
  side: Side;
  pickId: number;
  probability: number; // del modelo
  fairOdds: number; // 1 / probabilidad
  odds: number; // de Betano
  origin: 'auto' | 'manual';
  capturedAt: string;
  ev: number; // valor esperado por unidad apostada
  confidence: Confidence;
}

// Primero se buscan las cuotas de Betano; después se calcula dónde hay valor.
export function findOpportunities(matches: UpcomingMatch[], rows: OddsRow[], threshold: number): Opportunity[] {
  const out: Opportunity[] = [];
  for (const match of matches) {
    for (const pick of match.picks) {
      for (const side of ['over', 'under'] as const) {
        const probability = side === 'over' ? Number(pick.probability) : 1 - Number(pick.probability);
        if (probability <= 0 || probability >= 1) continue;
        const resolved = resolveOdds(rows, match.id, pick.market, Number(pick.line), side);
        if (!resolved) continue;
        const ev = edge(probability, resolved.odds);
        if (ev < threshold) continue;
        out.push({
          matchId: match.id, match, market: pick.market, line: Number(pick.line), side, pickId: pick.id,
          probability, fairOdds: 1 / probability, odds: resolved.odds, origin: resolved.origin,
          capturedAt: resolved.capturedAt, ev, confidence: confidenceFor(probability),
        });
      }
    }
  }
  return out.sort((a, b) => b.ev - a.ev);
}
