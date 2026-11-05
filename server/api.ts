// Acciones que la app pide al servidor: analizar, revisar resultados, ligas y consumo de API.
// Lo usan tanto `pnpm dev` (plugin de Vite) como el servidor de producción (server/index.ts), así el botón «Analizar»
// funciona igual en local y publicado. Las claves de servidor (API-Football y service role) se leen aquí, en Node,
// y nunca llegan al navegador. Cada acción exige una sesión válida de Supabase.
import type { IncomingMessage, ServerResponse } from 'node:http';

interface DbModule {
  createServiceClient: () => { auth: { getUser: (token: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }> } };
}
interface ResultsModule {
  resolvePending: (db?: unknown, log?: (line: string) => void) => Promise<unknown>;
}
interface ActionsModule {
  refreshAll: (log: (line: string) => void, opts: { userId: string; force: boolean }) => Promise<unknown>;
  apiStatus: (db: unknown, userId: string) => Promise<unknown>;
  leaguesCatalog: (db: unknown, userId: string) => Promise<unknown>;
  addLeague: (db: unknown, userId: string, apiId: number, log: (line: string) => void) => Promise<unknown>;
}

export const ACTIONS = ['analyze', 'refresh', 'resolve', 'api-status', 'leagues-catalog', 'leagues-add'];
const running = new Set<string>(); // evita ejecutar dos veces a la vez la misma acción pesada

// load: carga un módulo del proyecto por su ruta (p. ej. '/scripts/db.ts'). En desarrollo lo hace Vite (con recarga en caliente).
export async function handleApi(req: IncomingMessage, res: ServerResponse, load: (path: string) => Promise<unknown>): Promise<void> {
  const send = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') return send(405, { error: 'Método no permitido' });

  const action = (req.url ?? '').split('?')[0]!.replace(/^\/+/, '');
  if (!ACTIONS.includes(action)) return send(404, { error: 'Acción desconocida' });

  let payload: Record<string, unknown> = {};
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return send(400, { error: 'Cuerpo inválido' });
  }

  try {
    const { createServiceClient } = (await load('/scripts/db.ts')) as DbModule;
    const db = createServiceClient();
    const token = (req.headers.authorization ?? '').replace(/^Bearer /i, '');
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return send(401, { error: 'Sesión no válida' });
    const userId = data.user.id;

    if (running.has(action)) return send(409, { error: 'Esa acción ya está en curso' });
    running.add(action);
    try {
      const log: string[] = [];
      const a = (await load('/scripts/actions.ts')) as ActionsModule;
      let result: unknown;
      if (action === 'resolve') result = await ((await load('/scripts/results.ts')) as ResultsModule).resolvePending(db, (l) => log.push(l));
      else if (action === 'analyze' || action === 'refresh') result = await a.refreshAll((l) => log.push(l), { userId, force: payload.force === true });
      else if (action === 'api-status') result = await a.apiStatus(db, userId);
      else if (action === 'leagues-catalog') result = await a.leaguesCatalog(db, userId);
      else result = await a.addLeague(db, userId, Number(payload.apiId), (l) => log.push(l));
      send(200, { ok: true, summary: result, log });
    } finally {
      running.delete(action);
    }
  } catch (e) {
    send(500, { error: e instanceof Error ? e.message : 'Error desconocido' });
  }
}
