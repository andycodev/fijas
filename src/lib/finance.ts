import { formatMoney } from './format';

// Subconjunto de campos de una apuesta que usan los cálculos de capital.
export interface FinBet {
  status: 'open' | 'closed' | 'confirmed' | 'void';
  stake: number | string;
  profit_loss: number | string | null;
  result: 'won' | 'lost' | 'void' | null;
  placed_at: string;
  closed_at: string | null;
  accepted_odds: number | string;
  model_probability: number | string | null;
}

export interface FinMovement {
  type: 'deposit' | 'withdrawal';
  amount: number | string;
  occurred_on: string; // YYYY-MM-DD
}

const num = (v: number | string | null | undefined): number => Number(v ?? 0);
const round2 = (x: number): number => Math.round(x * 100) / 100;
const isSettled = (b: FinBet): boolean => b.status === 'closed' || b.status === 'confirmed';

// ───────── Totales ─────────
export function betTotals(bets: FinBet[]) {
  const placed = bets.filter((b) => b.status !== 'void');
  const settled = bets.filter(isSettled);
  const gains = settled.reduce((s, b) => s + Math.max(num(b.profit_loss), 0), 0);
  const losses = settled.reduce((s, b) => s + Math.max(-num(b.profit_loss), 0), 0);
  const settledStake = settled.reduce((s, b) => s + num(b.stake), 0);
  const open = bets.filter((b) => b.status === 'open');
  return {
    totalStaked: round2(placed.reduce((s, b) => s + num(b.stake), 0)),
    gains: round2(gains),
    losses: round2(losses),
    net: round2(gains - losses),
    roiPct: settledStake > 0 ? round2(((gains - losses) / settledStake) * 100) : null,
    openCount: open.length,
    openStake: round2(open.reduce((s, b) => s + num(b.stake), 0)),
    settledCount: settled.length,
  };
}

// Estado frente al capital protegido (el capital inicial).
export function capitalStatus(initial: number, balance: number) {
  const diff = round2(balance - initial);
  return { protectedCapital: initial, diff, state: diff > 0 ? ('above' as const) : diff < 0 ? ('below' as const) : ('equal' as const) };
}

// ───────── Fechas locales ─────────
const localDayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const monthKeyOf = (d: Date): string => localDayKey(d).slice(0, 7);

// ───────── Resumen mensual ─────────
export interface MonthSummary {
  key: string; // YYYY-MM
  start: number; // capital con el que empezó el mes
  flows: number; // depósitos − retiros del mes
  gains: number;
  losses: number;
  net: number; // ganancias − pérdidas del mes
  final: number; // saldo final (sin contar apuestas aún abiertas)
  returnPct: number | null; // net / start
  vsPreviousMonth: number | null; // final − final del mes anterior
}

export function monthlySummaries(initial: number, movements: FinMovement[], bets: FinBet[], now: Date = new Date()): MonthSummary[] {
  const gains = new Map<string, number>();
  const losses = new Map<string, number>();
  const flows = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  for (const mv of movements) add(flows, mv.occurred_on.slice(0, 7), mv.type === 'deposit' ? num(mv.amount) : -num(mv.amount));
  for (const b of bets) {
    if (!isSettled(b)) continue;
    const k = monthKeyOf(new Date(b.closed_at ?? b.placed_at));
    const p = num(b.profit_loss);
    if (p >= 0) add(gains, k, p);
    else add(losses, k, -p);
  }

  const keys = [...new Set([...gains.keys(), ...losses.keys(), ...flows.keys(), monthKeyOf(now)])].sort();
  // Meses continuos desde el primero con actividad hasta el actual.
  const all: string[] = [];
  let [y, m] = keys[0]!.split('-').map(Number) as [number, number];
  const last = monthKeyOf(now) > keys[keys.length - 1]! ? monthKeyOf(now) : keys[keys.length - 1]!;
  for (;;) {
    const k = `${y}-${String(m).padStart(2, '0')}`;
    all.push(k);
    if (k >= last) break;
    m++;
    if (m > 12) { m = 1; y++; }
  }

  const out: MonthSummary[] = [];
  let running = initial;
  for (const k of all) {
    const g = gains.get(k) ?? 0, l = losses.get(k) ?? 0, f = flows.get(k) ?? 0;
    const final = round2(running + f + g - l);
    out.push({
      key: k, start: round2(running), flows: round2(f), gains: round2(g), losses: round2(l), net: round2(g - l), final,
      returnPct: running > 0 ? round2(((g - l) / running) * 100) : null,
      vsPreviousMonth: out.length ? round2(final - out[out.length - 1]!.final) : null,
    });
    running = final;
  }
  return out;
}

// ───────── Rachas y exposición ─────────
export function currentLosingStreak(bets: FinBet[]): number {
  const decided = bets
    .filter((b) => isSettled(b) && (b.result === 'won' || b.result === 'lost'))
    .sort((a, b) => Date.parse(b.closed_at ?? b.placed_at) - Date.parse(a.closed_at ?? a.placed_at));
  let streak = 0;
  for (const b of decided) {
    if (b.result !== 'lost') break;
    streak++;
  }
  return streak;
}

export function stakedToday(bets: FinBet[], now: Date = new Date()): { amount: number; count: number } {
  const today = localDayKey(now);
  const todays = bets.filter((b) => b.status !== 'void' && localDayKey(new Date(b.placed_at)) === today);
  return { amount: round2(todays.reduce((s, b) => s + num(b.stake), 0)), count: todays.length };
}

// ───────── Alertas de protección del capital ─────────
export interface RiskSettings {
  initial_bankroll: number | string;
  daily_exposure_pct: number | string;
  monthly_loss_limit_pct: number | string;
  losing_streak_alert: number | string;
  daily_bet_limit: number | string;
}

export interface RiskAlert {
  id: string;
  level: 'info' | 'warn' | 'stop'; // stop = se pide confirmación explícita antes de apostar
  message: string;
}

export function riskAlerts(args: { settings: RiskSettings; balance: number; bets: FinBet[]; now?: Date; extraStake?: number }): RiskAlert[] {
  const { settings, balance, bets, now = new Date(), extraStake = 0 } = args;
  const initial = num(settings.initial_bankroll);
  const alerts: RiskAlert[] = [];

  // Exposición diaria (sobre el capital base, no sobre el saldo: no crece al ganar)
  const exposureLimit = round2((initial * num(settings.daily_exposure_pct)) / 100);
  const today = stakedToday(bets, now);
  if (exposureLimit > 0) {
    if (today.amount + extraStake > exposureLimit) {
      alerts.push({
        id: 'exposure',
        level: 'stop',
        message: `Hoy llevarías ${formatMoney(today.amount + extraStake)} apostados; tu límite diario es ${formatMoney(exposureLimit)}.`,
      });
    } else if (today.amount + extraStake >= exposureLimit * 0.8) {
      alerts.push({ id: 'exposure', level: 'warn', message: `Te acercas a tu límite diario: ${formatMoney(today.amount + extraStake)} de ${formatMoney(exposureLimit)}.` });
    }
  }

  // Tope de apuestas por día
  const maxBets = num(settings.daily_bet_limit);
  if (maxBets > 0 && today.count + (extraStake > 0 ? 1 : 0) > maxBets) {
    alerts.push({ id: 'count', level: 'stop', message: `Superarías tu tope de ${maxBets} apuestas por día.` });
  }

  // Pérdida del mes en curso
  const lossLimit = round2((initial * num(settings.monthly_loss_limit_pct)) / 100);
  const month = monthlySummaries(initial, [], bets, now).find((m) => m.key === monthKeyOf(now));
  const monthLoss = month ? Math.max(-month.net, 0) : 0;
  if (lossLimit > 0) {
    if (monthLoss >= lossLimit) {
      alerts.push({ id: 'loss', level: 'stop', message: `Alcanzaste tu límite de pérdidas del mes: ${formatMoney(monthLoss)} de ${formatMoney(lossLimit)}.` });
    } else if (monthLoss >= lossLimit * 0.7) {
      alerts.push({ id: 'loss', level: 'warn', message: `Llevas ${formatMoney(monthLoss)} de pérdida neta este mes; tu límite es ${formatMoney(lossLimit)}.` });
    }
  }

  // Racha negativa
  const streak = currentLosingStreak(bets);
  if (streak >= num(settings.losing_streak_alert) && streak > 0) {
    alerts.push({ id: 'streak', level: 'warn', message: `Racha de ${streak} apuestas perdidas seguidas. Un descanso ayuda a no decidir por impulso.` });
  }

  // Capital por debajo del inicial
  if (balance < initial) {
    alerts.push({ id: 'below', level: 'info', message: `Estás ${formatMoney(initial - balance)} por debajo de tu capital inicial.` });
  }
  return alerts;
}
