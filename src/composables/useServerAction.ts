import { supabase } from '../services/supabase';

// Llama a una acción del servidor local (solo existe con `pnpm dev`). Las claves de servidor nunca pasan por el navegador.
export async function callAction<T>(action: string, payload: Record<string, unknown> = {}): Promise<{ summary: T; log: string[] }> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`/api/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(payload),
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('No hay servidor de análisis disponible. Usa pnpm dev en tu computador o el servicio publicado con servidor (pnpm start).');
  }
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? 'No se pudo completar la acción.');
  return { summary: body.summary as T, log: body.log as string[] };
}
