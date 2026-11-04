// Tramos de probabilidad de acierto según el modelo.

export type Band = 'discard' | 'moderate' | 'watch' | 'high' | 'very_high';

export const DEFAULT_MIN_PROBABILITY = 0.75;

export function bandOf(probability: number): Band {
  if (probability < 0.6) return 'discard';
  if (probability < 0.7) return 'moderate';
  if (probability < 0.75) return 'watch';
  if (probability < 0.8) return 'high';
  return 'very_high';
}

export const BAND_LABEL: Record<Band, string> = {
  discard: 'Descartada (menos de 60%)',
  moderate: 'Probabilidad moderada',
  watch: 'En observación',
  high: 'Probabilidad alta',
  very_high: 'Probabilidad muy alta',
};

export const BAND_CLASS: Record<Band, string> = {
  discard: 'bg-line text-ink/60',
  moderate: 'bg-line text-ink/70',
  watch: 'bg-marginal/10 text-marginal',
  high: 'bg-value/10 text-value',
  very_high: 'bg-value/10 text-value',
};
