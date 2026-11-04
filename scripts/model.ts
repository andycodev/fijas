// Modelo de córners totales por partido (v1). Funciones puras, sin acceso a datos.
//
// Idea: cada equipo tiene córners a favor y en contra (promedio de sus últimos N partidos, con
// encogimiento hacia la media de la liga). El esperado del local combina su ataque con la defensa
// del visitante (y al revés), con las medias de local y visitante como base. El total de córners se
// modela con una binomial negativa (o Poisson si los datos no muestran sobredispersión).

export const MODEL_VERSION = 'v1-nb-n10-k20';

export interface TeamGame {
  corners_for: number;
  corners_against: number;
}

export interface Reference {
  homeMean: number; // media de córners del local en la muestra de referencia
  awayMean: number; // media de córners del visitante
}

export interface ModelParams {
  lastN: number; // partidos recientes por equipo
  shrinkK: number; // peso (en partidos) de la media de la liga al promediar un equipo
}

export const DEFAULT_PARAMS: ModelParams = { lastN: 10, shrinkK: 20 } // elegido con scripts/backtest.ts;

interface TeamRates {
  attack: number; // córners a favor por partido, encogido
  defense: number; // córners en contra por partido, encogido
  n: number;
}

function rates(games: TeamGame[], teamMean: number, p: ModelParams): TeamRates {
  const recent = games.slice(-p.lastN);
  const n = recent.length;
  const w = n / (n + p.shrinkK);
  const avg = (f: (g: TeamGame) => number) => (n ? recent.reduce((s, g) => s + f(g), 0) / n : teamMean);
  return {
    attack: w * avg((g) => g.corners_for) + (1 - w) * teamMean,
    defense: w * avg((g) => g.corners_against) + (1 - w) * teamMean,
    n,
  };
}

export interface Projection {
  homeMean: number;
  awayMean: number;
  total: number;
}

// homeGames / awayGames: partidos previos del local y del visitante, de más antiguo a más reciente.
export function projectTotal(
  homeGames: TeamGame[],
  awayGames: TeamGame[],
  ref: Reference,
  params: ModelParams = DEFAULT_PARAMS,
): Projection {
  const teamMean = (ref.homeMean + ref.awayMean) / 2;
  const h = rates(homeGames, teamMean, params);
  const a = rates(awayGames, teamMean, params);
  const homeMean = ref.homeMean * (h.attack / teamMean) * (a.defense / teamMean);
  const awayMean = ref.awayMean * (a.attack / teamMean) * (h.defense / teamMean);
  return { homeMean, awayMean, total: homeMean + awayMean };
}

// P(total > line) para una línea x.5. `r` es el parámetro de dispersión de la binomial negativa
// (r → ∞ equivale a Poisson). var = media + media² / r.
export function probOver(line: number, mean: number, r: number = Infinity): number {
  const kMax = Math.floor(line);
  let cdf = 0;
  if (!Number.isFinite(r)) {
    let pmf = Math.exp(-mean);
    for (let k = 0; k <= kMax; k++) {
      cdf += pmf;
      pmf *= mean / (k + 1);
    }
  } else {
    const p = r / (r + mean);
    let pmf = Math.pow(p, r);
    for (let k = 0; k <= kMax; k++) {
      cdf += pmf;
      pmf *= ((k + r) / (k + 1)) * (1 - p);
    }
  }
  return Math.min(1, Math.max(0, 1 - cdf));
}

// Ajusta r con pares (esperado, real) históricos: el exceso de varianza sobre Poisson.
// Devuelve Infinity si no hay sobredispersión.
export function fitDispersion(pairs: { mean: number; actual: number }[]): number {
  if (pairs.length < 30) return Infinity;
  const meanOfMeans = pairs.reduce((s, p) => s + p.mean, 0) / pairs.length;
  const mse = pairs.reduce((s, p) => s + (p.actual - p.mean) ** 2, 0) / pairs.length;
  const extra = mse - meanOfMeans;
  if (extra <= 0) return Infinity;
  return (meanOfMeans * meanOfMeans) / extra;
}

// Cuota mínima, valor y semáforo viven en src/lib/value.ts porque también los usa la app.
export { edge, minOdds, signalFor, type Signal } from '../src/lib/value.ts';
