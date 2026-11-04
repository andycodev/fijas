import type { Market } from '../types/db';

// Un partido terminado con sus estadísticas. h/a = valor del mercado (goles o córners) de local y visitante.
export interface HistGame {
  t: number;
  home: number;
  away: number;
  h: number;
  a: number;
  hShots: number | null;
  aShots: number | null;
  hSot: number | null;
  aSot: number | null;
  hXg: number | null;
  aXg: number | null;
}

export type Direction = 'for' | 'against' | 'neutral' | 'info' | 'unavailable';

export interface Factor {
  id: string;
  title: string;
  detail: string;
  direction: Direction;
}

export interface Explanation {
  factors: Factor[];
  unavailable: string[]; // datos que no tenemos (se dicen, no se inventan)
  gamesHome: number;
  gamesAway: number;
}

export interface ExplainInput {
  market: Market;
  side: 'over' | 'under';
  line: number;
  homeId: number;
  awayId: number;
  homeName: string;
  awayName: string;
  homeGames: HistGame[]; // más recientes primero
  awayGames: HistGame[];
  h2h: HistGame[];
}

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const f1 = (n: number): string => n.toFixed(1);
const total = (g: HistGame): number => g.h + g.a;
const forTeam = (g: HistGame, id: number) => (g.home === id ? g.h : g.a);
const againstTeam = (g: HistGame, id: number) => (g.home === id ? g.a : g.h);

// Qué lado favorece un valor medio frente a la línea (con una zona neutra para diferencias mínimas).
function leanFromValue(value: number, line: number, margin: number): 'over' | 'under' | 'neutral' {
  if (value > line + margin) return 'over';
  if (value < line - margin) return 'under';
  return 'neutral';
}
// Qué lado favorece una frecuencia de superar la línea.
function leanFromFrequency(freq: number): 'over' | 'under' | 'neutral' {
  if (freq >= 0.55) return 'over';
  if (freq <= 0.45) return 'under';
  return 'neutral';
}
const directionFor = (lean: 'over' | 'under' | 'neutral', side: 'over' | 'under'): Direction =>
  lean === 'neutral' ? 'neutral' : lean === side ? 'for' : 'against';

export function buildExplanation(input: ExplainInput): Explanation {
  const { market, side, line, homeId, awayId, homeName, awayName } = input;
  const unit = market === 'goals_total' ? 'goles' : 'córners';
  const margin = market === 'goals_total' ? 0.25 : 0.5;
  const homeGames = input.homeGames;
  const awayGames = input.awayGames;
  const factors: Factor[] = [];
  const unavailable: string[] = [];

  if (!homeGames.length || !awayGames.length) {
    return { factors: [], unavailable: ['No hay partidos suficientes de uno de los equipos para explicar esta probabilidad.'], gamesHome: homeGames.length, gamesAway: awayGames.length };
  }

  // 1) Promedio de a favor y en contra (y lo que implica para el total)
  const hFor = avg(homeGames.map((g) => forTeam(g, homeId)))!;
  const hAgainst = avg(homeGames.map((g) => againstTeam(g, homeId)))!;
  const aFor = avg(awayGames.map((g) => forTeam(g, awayId)))!;
  const aAgainst = avg(awayGames.map((g) => againstTeam(g, awayId)))!;
  const crossed = (hFor + aAgainst) / 2 + (aFor + hAgainst) / 2;
  factors.push({
    id: 'for-against',
    title: `${unit[0]!.toUpperCase()}${unit.slice(1)} a favor y en contra`,
    detail:
      `${homeName}: ${f1(hFor)} a favor y ${f1(hAgainst)} en contra por partido (últimos ${homeGames.length}). ` +
      `${awayName}: ${f1(aFor)} a favor y ${f1(aAgainst)} en contra (últimos ${awayGames.length}). ` +
      `Cruzando ataque con defensa, se esperan unos ${f1(crossed)} ${unit}; la línea es ${line}.`,
    direction: directionFor(leanFromValue(crossed, line, margin), side),
  });

  // 2) Total por partido
  const hTotal = avg(homeGames.map(total))!;
  const aTotal = avg(awayGames.map(total))!;
  factors.push({
    id: 'totals',
    title: `${unit[0]!.toUpperCase()}${unit.slice(1)} totales por partido`,
    detail: `Los partidos de ${homeName} promedian ${f1(hTotal)} ${unit} en total y los de ${awayName}, ${f1(aTotal)}.`,
    direction: directionFor(leanFromValue((hTotal + aTotal) / 2, line, margin), side),
  });

  // 3) Local en casa y visitante fuera
  const hHome = homeGames.filter((g) => g.home === homeId);
  const aAway = awayGames.filter((g) => g.away === awayId);
  if (hHome.length >= 3 && aAway.length >= 3) {
    const v = (avg(hHome.map(total))! + avg(aAway.map(total))!) / 2;
    factors.push({
      id: 'venue',
      title: 'Rendimiento como local y visitante',
      detail:
        `${homeName} en casa (${hHome.length} partidos): ${f1(avg(hHome.map(total))!)} ${unit} por partido. ` +
        `${awayName} fuera (${aAway.length} partidos): ${f1(avg(aAway.map(total))!)}.`,
      direction: directionFor(leanFromValue(v, line, margin), side),
    });
  } else {
    factors.push({
      id: 'venue',
      title: 'Rendimiento como local y visitante',
      detail: `Hay menos de 3 partidos como local de ${homeName} o como visitante de ${awayName} entre los últimos usados: no se puede separar con fiabilidad.`,
      direction: 'unavailable',
    });
  }

  // 4) Frecuencia de superar la línea
  const overRate = (gs: HistGame[]) => gs.filter((g) => total(g) > line).length / gs.length;
  const hRate = overRate(homeGames), aRate = overRate(awayGames);
  const pctOver = (r: number) => `${Math.round(r * 100)}%`;
  factors.push({
    id: 'frequency',
    title: `Frecuencia de superar ${line} ${unit}`,
    detail:
      `En ${homeName}, ${homeGames.filter((g) => total(g) > line).length} de ${homeGames.length} partidos superaron la línea (${pctOver(hRate)}); ` +
      `en ${awayName}, ${awayGames.filter((g) => total(g) > line).length} de ${awayGames.length} (${pctOver(aRate)}). ` +
      `${side === 'over' ? 'Más de' : 'Menos de'} favorece lo que ocurre ${side === 'over' ? 'más' : 'menos'} de la mitad de las veces.`,
    direction: directionFor(leanFromFrequency((hRate + aRate) / 2), side),
  });

  // 5) Tendencia reciente: últimos 5 frente a los últimos usados
  if (homeGames.length >= 6 && awayGames.length >= 6) {
    const last5 = (avg(homeGames.slice(0, 5).map(total))! + avg(awayGames.slice(0, 5).map(total))!) / 2;
    const all = (hTotal + aTotal) / 2;
    factors.push({
      id: 'recent',
      title: 'Tendencia reciente',
      detail: `En los últimos 5 partidos de cada uno el total promedia ${f1(last5)} ${unit}, frente a ${f1(all)} en los últimos ${homeGames.length} y ${awayGames.length}.`,
      direction: directionFor(leanFromValue(last5, line, margin), side),
    });
  }

  // 6) Enfrentamientos directos
  if (input.h2h.length) {
    const h2hAvg = avg(input.h2h.map(total))!;
    const over = input.h2h.filter((g) => total(g) > line).length;
    factors.push({
      id: 'h2h',
      title: 'Historial de enfrentamientos directos',
      detail: `${input.h2h.length} enfrentamiento${input.h2h.length === 1 ? '' : 's'} en la base: promedio ${f1(h2hAvg)} ${unit}; ${over} superaron la línea. Es una muestra pequeña.`,
      direction: input.h2h.length < 3 ? 'info' : directionFor(leanFromValue(h2hAvg, line, margin), side),
    });
  } else {
    factors.push({
      id: 'h2h',
      title: 'Historial de enfrentamientos directos',
      detail: 'Estos equipos no se han enfrentado en los partidos que tenemos (2022-23 en adelante).',
      direction: 'unavailable',
    });
  }

  // 7) Específicos de goles: remates, remates a puerta, efectividad y xG
  if (market === 'goals_total') {
    const withShots = (gs: HistGame[], id: number) => gs.filter((g) => (g.home === id ? g.hShots : g.aShots) !== null);
    const shotsOf = (gs: HistGame[], id: number) => withShots(gs, id).map((g) => (g.home === id ? g.hShots! : g.aShots!));
    const sotOf = (gs: HistGame[], id: number) => gs.filter((g) => (g.home === id ? g.hSot : g.aSot) !== null).map((g) => (g.home === id ? g.hSot! : g.aSot!));
    const hs = shotsOf(homeGames, homeId), as = shotsOf(awayGames, awayId);
    const hSot = sotOf(homeGames, homeId), aSot = sotOf(awayGames, awayId);
    if (hs.length >= 3 && as.length >= 3) {
      factors.push({
        id: 'shots',
        title: 'Remates totales y a puerta',
        detail:
          `${homeName}: ${f1(avg(hs)!)} remates por partido, ${hSot.length ? f1(avg(hSot)!) : '—'} a puerta. ` +
          `${awayName}: ${f1(avg(as)!)} remates, ${aSot.length ? f1(avg(aSot)!) : '—'} a puerta.`,
        direction: 'info',
      });
      const conv = (gs: HistGame[], id: number) => {
        const sot = sotOf(gs, id).reduce((s, x) => s + x, 0);
        const goals = gs.filter((g) => (g.home === id ? g.hSot : g.aSot) !== null).reduce((s, g) => s + forTeam(g, id), 0);
        return sot ? goals / sot : null;
      };
      const hc = conv(homeGames, homeId), ac = conv(awayGames, awayId);
      if (hc !== null && ac !== null) {
        factors.push({
          id: 'conversion',
          title: 'Efectividad ofensiva',
          detail: `Goles por remate a puerta: ${homeName} ${(hc * 100).toFixed(0)}% y ${awayName} ${(ac * 100).toFixed(0)}%.`,
          direction: 'info',
        });
      }
    } else {
      unavailable.push('Remates totales y a puerta: faltan datos de estos equipos.');
    }

    const xgOf = (gs: HistGame[], id: number) => gs.filter((g) => (g.home === id ? g.hXg : g.aXg) !== null);
    const hx = xgOf(homeGames, homeId), ax = xgOf(awayGames, awayId);
    if (hx.length >= 3 && ax.length >= 3) {
      const xgFor = (gs: HistGame[], id: number) => avg(gs.map((g) => (g.home === id ? g.hXg! : g.aXg!)))!;
      const xgAgainst = (gs: HistGame[], id: number) => avg(gs.map((g) => (g.home === id ? g.aXg! : g.hXg!)))!;
      const expected = (xgFor(hx, homeId) + xgAgainst(ax, awayId)) / 2 + (xgFor(ax, awayId) + xgAgainst(hx, homeId)) / 2;
      factors.push({
        id: 'xg',
        title: 'Goles esperados (xG)',
        detail:
          `Con el xG de la temporada actual (${hx.length} y ${ax.length} partidos), el cruce de ataque y defensa da ${f1(expected)} goles esperados; la línea es ${line}. ` +
          `Hay pocos partidos con xG, así que es una referencia débil.`,
        direction: directionFor(leanFromValue(expected, line, margin), side),
      });
    } else {
      unavailable.push('Goles esperados (xG): la fuente solo lo publica en la temporada actual y estos equipos tienen menos de 3 partidos con ese dato.');
    }
    unavailable.push('Bajas y ausencias relevantes: no hay una fuente gratuita conectada. Revísalas antes de apostar.');
  }

  // 8) Específicos de córners
  if (market === 'corners_total') {
    unavailable.push('Ataques y llegadas por bandas, centros y remates bloqueados: no están en nuestras fuentes de datos.');
  }

  return { factors, unavailable, gamesHome: homeGames.length, gamesAway: awayGames.length };
}

export function summarize(factors: Factor[]) {
  return {
    favor: factors.filter((f) => f.direction === 'for'),
    against: factors.filter((f) => f.direction === 'against'),
    neutral: factors.filter((f) => f.direction === 'neutral' || f.direction === 'info'),
    unavailable: factors.filter((f) => f.direction === 'unavailable'),
  };
}
