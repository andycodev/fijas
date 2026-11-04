-- Fijas · gestión de capital
-- Límites de riesgo en el perfil (valores iniciales sugeridos; el usuario los cambia en Ajustes)
alter table public.profiles
  add column daily_exposure_pct     numeric(5,2) not null default 10 check (daily_exposure_pct > 0),   -- máx. apostado por día, % del capital base
  add column monthly_loss_limit_pct numeric(5,2) not null default 20 check (monthly_loss_limit_pct > 0), -- pérdida mensual máxima, % del capital base
  add column losing_streak_alert    smallint     not null default 3 check (losing_streak_alert > 0);    -- derrotas seguidas que disparan una alerta

-- Probabilidad que daba el modelo al registrar la apuesta (para medir su precisión con el tiempo).
-- La cuota recomendada (justa) se obtiene como 1 / model_probability.
alter table public.bets
  add column model_probability numeric(5,4) check (model_probability > 0 and model_probability < 1);
