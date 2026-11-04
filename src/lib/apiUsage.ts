// Lógica del consumo de la API (pura, para la app y las pruebas).

export interface UsageSnapshot {
  daily_limit: number | null;
  requests_used: number | null;
  remaining: number | null;
  last_request_at: string | null;
  last_status: string | null;
  reset_observed_at: string | null;
  plan_name: string | null;
  plan_end: string | null;
  day: string;
}

export type UsageLevel = 'ok' | 'watch' | 'high' | 'critical' | 'exhausted';

// Umbrales de alerta pedidos: 70 %, 85 % y 95 %.
export function usageLevel(used: number, limit: number): UsageLevel {
  if (limit <= 0) return 'ok';
  if (used >= limit) return 'exhausted';
  const pct = (used / limit) * 100;
  if (pct >= 95) return 'critical';
  if (pct >= 85) return 'high';
  if (pct >= 70) return 'watch';
  return 'ok';
}

export const LEVEL_MESSAGE: Record<UsageLevel, string | null> = {
  ok: null,
  watch: 'Has usado el 70% o más de tus solicitudes de hoy.',
  high: 'Has usado el 85% o más de tus solicitudes de hoy.',
  critical: 'Has usado el 95% o más de tus solicitudes de hoy: quedan muy pocas.',
  exhausted: 'Se agotaron las solicitudes de hoy. Las consultas automáticas están detenidas hasta que se renueve el límite.',
};

export function usagePercent(used: number, limit: number): number {
  return limit > 0 ? Math.min(100, Math.round((used / limit) * 1000) / 10) : 0;
}

// Próximo reinicio ESTIMADO: la API no informa a qué hora se renueva el contador, así que se usa la hora (UTC)
// que configura el usuario.
export function nextResetEstimate(now: Date, resetHourUtc: number): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHourUtc, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

// Un reinicio se nota cuando las restantes aumentan respecto a la lectura anterior.
export function detectReset(previousRemaining: number | null, currentRemaining: number | null): boolean {
  return previousRemaining !== null && currentRemaining !== null && currentRemaining > previousRemaining;
}

// Estado del servicio a partir de la última respuesta registrada.
export function serviceState(lastStatus: string | null): { label: string; ok: boolean } {
  switch (lastStatus) {
    case 'ok': return { label: 'Operativo', ok: true };
    case 'rate_limited': return { label: 'Límite alcanzado o demasiadas solicitudes por minuto', ok: false };
    case 'unreachable': return { label: 'Sin conexión con el proveedor', ok: false };
    case 'error': return { label: 'El proveedor devolvió un error', ok: false };
    default: return { label: 'Sin datos todavía', ok: true };
  }
}

// ¿Se permite actualizar ya? Respeta la frecuencia configurada.
export function refreshAllowedAt(lastRefreshAt: string | null, intervalMinutes: number): Date | null {
  if (!lastRefreshAt) return null;
  return new Date(Date.parse(lastRefreshAt) + intervalMinutes * 60_000);
}
