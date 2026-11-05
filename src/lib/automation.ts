// Actividad automática: textos y horarios para mostrar qué hizo el robot (GitHub Actions) y cuándo vuelve a correr.

export interface AutomationRun {
  id: number;
  kind: 'analyze' | 'resolve';
  source: 'github' | 'local' | 'app';
  status: 'succeeded' | 'failed';
  started_at: string;
  finished_at: string;
  summary: Record<string, unknown> | null;
  error: string | null;
}

// Horas UTC de los análisis programados. Deben coincidir con el cron de .github/workflows/automatico.yml
// (12, 16 y 19 UTC = 07:00, 11:00 y 14:00 en Lima). La revisión de resultados corre cada hora, en el minuto 20.
export const ANALYSIS_UTC_HOURS = [12, 16, 19];
export const RESOLVE_UTC_MINUTE = 20;

// Próxima ejecución programada de cada tipo, a partir de ahora (se muestra en la hora local de quien mira).
export function nextAnalysis(now: Date = new Date()): Date {
  for (let d = 0; d < 2; d++) {
    for (const h of ANALYSIS_UTC_HOURS) {
      const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d, h, 0, 0));
      if (t.getTime() > now.getTime()) return t;
    }
  }
  return now;
}
export function nextResolve(now: Date = new Date()): Date {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), RESOLVE_UTC_MINUTE, 0));
  return t.getTime() > now.getTime() ? t : new Date(t.getTime() + 3_600_000);
}

export const KIND_LABEL: Record<AutomationRun['kind'], string> = { analyze: 'Análisis', resolve: 'Revisión de resultados' };
export const SOURCE_LABEL: Record<AutomationRun['source'], string> = { github: 'Robot de GitHub', local: 'Terminal', app: 'App' };

const n = (v: unknown): number => Number(v ?? 0) || 0;
const plural = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;

// Una frase corta de lo que pasó en esa ejecución.
export function describeRun(r: Pick<AutomationRun, 'kind' | 'status' | 'summary' | 'error'>): string {
  if (r.status === 'failed') return `Falló: ${r.error ?? 'error desconocido'}`;
  const s = r.summary ?? {};
  if (r.kind === 'resolve') {
    const resolved = n(s.resolved);
    const parts: string[] = [];
    if (n(s.pending) === 0) parts.push('No había recomendaciones pendientes');
    else if (n(s.due) === 0 && resolved === 0) parts.push(`${plural(n(s.pending), 'recomendación pendiente', 'recomendaciones pendientes')}, ninguna con partido terminado todavía`);
    else parts.push(resolved ? `${plural(resolved, 'recomendación cerrada', 'recomendaciones cerradas')}` : 'Revisó resultados, sin cambios');
    if (n(s.apiRequests)) parts.push(plural(n(s.apiRequests), 'solicitud de API', 'solicitudes de API'));
    if (s.apiStopped) parts.push('tope de API alcanzado');
    return parts.join(' · ');
  }
  if (s.skipped === 'fresh') return 'Datos vigentes: no se repitió el análisis';
  if (s.skipped === 'running') return 'Ya había un análisis en curso';
  const parts = [`${plural(n(s.recommendations), 'recomendación', 'recomendaciones')} (${n(s.newRecommendations)} nuevas)`];
  if (n(s.lowValue)) parts.push(`${n(s.lowValue)} de estudio`);
  if (s.apiStopped) parts.push('tope de API alcanzado');
  return parts.join(' · ');
}

// Hace cuánto fue, en palabras («hoy 07:02», «ayer 14:00», «3 nov 11:00»).
export function whenLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(d);
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key(d) === key(now)) return `hoy ${time}`;
  if (key(d) === key(yesterday)) return `ayer ${time}`;
  return `${new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' }).format(d)} ${time}`;
}

// Alerta si el robot dejó de funcionar: el último análisis exitoso tiene más de 14 h, o el último intento falló.
export function automationHealth(runs: AutomationRun[], now: Date = new Date()): { ok: boolean; reason: string | null } {
  const last = (k: AutomationRun['kind']) => runs.filter((r) => r.kind === k).sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  const lastAnalysis = last('analyze')[0];
  const lastResolve = last('resolve')[0];
  if (lastAnalysis?.status === 'failed') return { ok: false, reason: 'El último análisis automático falló.' };
  if (lastResolve?.status === 'failed') return { ok: false, reason: 'La última revisión automática de resultados falló.' };
  const lastGood = last('analyze').find((r) => r.status === 'succeeded');
  if (lastGood && now.getTime() - Date.parse(lastGood.started_at) > 14 * 3_600_000) {
    return { ok: false, reason: 'No hay un análisis automático exitoso en las últimas 14 horas.' };
  }
  return { ok: true, reason: null };
}
