const round2 = (n: number): number => Math.round(n * 100) / 100;

// Lo que pasa con un monto concreto: cuánto cobras, cuánto ganas o pierdes y la ganancia esperada promedio.
// Se usa para el ejemplo ilustrativo de la explicación del valor esperado.
export function stakePlan(stake: number, odds: number, probability: number) {
  return {
    payout: round2(stake * odds), // lo que cobras si aciertas (incluye tu monto)
    profitIfWin: round2(stake * (odds - 1)), // ganancia neta si aciertas
    lossIfLose: round2(stake), // lo que pierdes si fallas
    expectedProfit: round2(stake * (probability * odds - 1)), // promedio por apuesta si repitieras esto muchas veces
  };
}

// Valor esperado si el modelo se equivocara en `points` de probabilidad (0.05 = 5 puntos). Sirve para ver qué tan frágil es.
export const evIfModelOff = (probability: number, odds: number, points = 0.05): number =>
  Math.max(probability - points, 0) * odds - 1;

export const HIGH_EV = 0.15; // por encima de este valor esperado se pide verificar la cuota
