// Registro de las ejecuciones automáticas, para mostrarlas en la app. Es «mejor esfuerzo»: si la tabla aún no existe
// (migración sin aplicar) o falla el guardado, la ejecución sigue como si nada.
import type { Db } from './db.ts';

export interface AutomationEntry {
  kind: 'analyze' | 'resolve';
  source: 'github' | 'local' | 'app';
  userId?: string | null;
  status: 'succeeded' | 'failed';
  startedAt: Date;
  summary?: Record<string, unknown>;
  error?: string;
}

const KEEP_DAYS = 14;

export async function recordAutomation(db: Db, e: AutomationEntry, log: (s: string) => void = console.log): Promise<void> {
  try {
    const { error } = await db.from('automation_runs').insert({
      kind: e.kind,
      source: e.source,
      user_id: e.userId ?? null,
      status: e.status,
      started_at: e.startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      summary: e.summary ?? null,
      error: e.error ? e.error.slice(0, 500) : null,
    });
    if (error) throw new Error(error.message);
    // Se conservan solo las últimas semanas: la revisión horaria genera muchas filas.
    await db.from('automation_runs').delete().lt('started_at', new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString());
  } catch (err) {
    log(`No se pudo guardar el registro de la ejecución automática: ${(err as Error).message}`);
  }
}
