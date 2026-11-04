import type { Market } from '../types/db';

export const MARKET_LABEL: Record<Market, string> = {
  corners_total: 'Córners',
  goals_total: 'Goles',
};

// Texto de una selección: "Más de 2.5 goles"
export const selectionLabel = (market: Market, side: 'over' | 'under', line: number): string =>
  `${side === 'over' ? 'Más de' : 'Menos de'} ${line} ${MARKET_LABEL[market].toLowerCase()}`;
