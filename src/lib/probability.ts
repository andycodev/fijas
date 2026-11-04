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

// La probabilidad es una predicción, no un veredicto: se pinta con la familia azul (el verde queda para resultados).
export const BAND_CLASS: Record<Band, string> = {
  discard: 'bg-sunken text-ink/60',
  moderate: 'bg-sunken text-ink/70',
  watch: 'bg-marginal/10 text-marginal',
  high: 'bg-primary/10 text-brand',
  very_high: 'bg-primary/15 text-brand',
};
