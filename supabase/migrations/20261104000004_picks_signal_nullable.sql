-- Fijas · el semáforo de un pick depende de la cuota, que escribe cada usuario a mano.
-- Hasta que existan cuotas automáticas, los picks generados por el servidor no llevan semáforo ni valor.
alter table public.picks alter column signal drop not null;
