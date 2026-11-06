// Ejecución automática sin pantalla (la lanza GitHub Actions con horario; también sirve a mano):
//   npx tsx --env-file=.env scripts/auto.ts resolve   → revisa resultados de las recomendaciones pendientes
//   npx tsx --env-file=.env scripts/auto.ts analyze   → análisis completo (partidos, picks, cuotas, recomendaciones)
// Usa los mismos procesos que la app: respeta el tope diario de API, la vigencia de los datos y el bloqueo de ejecuciones simultáneas.
// Cada ejecución queda registrada en automation_runs para verla en la app (sección «Actividad automática»).
import { runAnalyze, runResolve } from './automation-run.ts';
import { createServiceClient } from './db.ts';

const mode = process.argv[2];
if (mode !== 'resolve' && mode !== 'analyze') {
  console.error('Uso: auto.ts resolve | analyze');
  process.exit(2);
}

const source = process.env.GITHUB_ACTIONS ? 'github' : 'local';
const db = createServiceClient();
const only = process.env.ANALYSIS_USER_ID; // opcional: limitar a un usuario

const ok = mode === 'resolve' ? await runResolve(db, source, console.log, only) : await runAnalyze(db, source, console.log, only);
if (!ok) process.exit(1); // GitHub marca la ejecución en rojo
