# Backtest del modelo de córners (v1)

Generado con `npx tsx --env-file=.env scripts/backtest.ts` el 2026-11-04. Cada partido se predice usando solo los partidos anteriores a su fecha (2024-25 en adelante; 2022-23 y 2023-24 sirven de arranque del historial).

- logloss y brier: menor es mejor.
- MAE: error medio en córners por partido.
- "base" = predecir siempre la media de la liga, sin mirar a los equipos.

```
Partidos con córners: 6154

K = peso de la media de la liga (en partidos) · N = 10 · líneas 8.5, 9.5, 10.5, 11.5
N=10 K= 0  n=3114  r=23.9  modelo logloss=0.6881 brier=0.2430 MAE=2.892  | base (sin equipos) logloss=0.6561 brier=0.2319 MAE=2.755
N=10 K= 5  n=3114  r=39.0  modelo logloss=0.6613 brier=0.2336 MAE=2.759  | base (sin equipos) logloss=0.6561 brier=0.2319 MAE=2.755
N=10 K=20  n=3114  r=53.6  modelo logloss=0.6492 brier=0.2287 MAE=2.713  | base (sin equipos) logloss=0.6561 brier=0.2319 MAE=2.755
N=10 K=40  n=3114  r=54.9  modelo logloss=0.6496 brier=0.2289 MAE=2.722  | base (sin equipos) logloss=0.6561 brier=0.2319 MAE=2.755
N=20 K=20  n=3114  r=52.6  modelo logloss=0.6496 brier=0.2289 MAE=2.714  | base (sin equipos) logloss=0.6561 brier=0.2319 MAE=2.755
N=20 K=40  n=3114  r=55.7  modelo logloss=0.6484 brier=0.2284 MAE=2.713  | base (sin equipos) logloss=0.6561 brier=0.2319 MAE=2.755
N=20 K=80  n=3114  r=55.3  modelo logloss=0.6498 brier=0.2290 MAE=2.724  | base (sin equipos) logloss=0.6561 brier=0.2319 MAE=2.755
N=30 K=40  n=3114  r=56.1  modelo logloss=0.6476 brier=0.2280 MAE=2.708  | base (sin equipos) logloss=0.6561 brier=0.2319 MAE=2.755
N=30 K=80  n=3114  r=56.4  modelo logloss=0.6485 brier=0.2284 MAE=2.716  | base (sin equipos) logloss=0.6561 brier=0.2319 MAE=2.755

Mejor combinación por logloss: N=30 K=40
  temporada 2024: n=1390 modelo logloss=0.6442 vs base 0.6553
  temporada 2025: n=1407 modelo logloss=0.6465 vs base 0.6542
  temporada 2026: n=317 modelo logloss=0.6673 vs base 0.6677

Calibración, línea 9.5 (probabilidad prevista de "más de 9.5" vs frecuencia real):
  [0–0.3) n=   5  previsto=29.1%  real=0.0%
  [0.3–0.4) n= 254  previsto=37.2%  real=35.8%
  [0.4–0.5) n=1386  previsto=45.7%  real=45.4%
  [0.5–0.6) n=1266  previsto=54.0%  real=55.2%
  [0.6–0.7) n= 180  previsto=63.3%  real=61.1%
  [0.7–1) n=  23  previsto=71.6%  real=73.9%
```

Parámetros elegidos: últimos 10 partidos por equipo y encogimiento K=20 (la diferencia con las mejores combinaciones es mínima).
