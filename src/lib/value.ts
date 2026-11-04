// Cálculos de cuota y valor (sin dependencias; los usan la app y los scripts).

export type Signal = 'green' | 'yellow' | 'red';

// Cuota mínima para que una apuesta con esa probabilidad no tenga valor negativo.
export const minOdds = (probability: number): number => 1 / probability;

// Valor esperado por unidad apostada: probabilidad × cuota − 1.
export const edge = (probability: number, odds: number): number => probability * odds - 1;

// verde: valor ≥ umbral · amarillo (marginal): valor entre 0 y el umbral · rojo: valor negativo
export function signalFor(value: number, threshold: number): Signal {
  if (value >= threshold) return 'green';
  if (value >= 0) return 'yellow';
  return 'red';
}
