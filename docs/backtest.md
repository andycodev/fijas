# Backtest de los modelos (partido completo)

Generado el 2026-11-04 con `npx tsx --env-file=.env scripts/backtest.ts [corners_total|goals_total]`. Cada partido se predice usando solo los partidos anteriores a su fecha (2024-25 en adelante; 2022-23 y 2023-24 sirven de arranque).

- logloss y brier: menor es mejor. MAE: error medio por partido.
- "base" = predecir siempre la media de la liga, sin mirar a los equipos.
- Parámetros elegidos en ambos mercados: últimos 10 partidos por equipo y encogimiento K=20 (las mejores combinaciones difieren muy poco).

## Córners totales

```
Partidos con dato: 6154

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

## Goles totales (distribución de Poisson: no hay sobredispersión)

```
Partidos con dato: 6155

K = peso de la media de la liga (en partidos) · N = 10 · líneas 0.5, 1.5, 2.5, 3.5
N=10 K= 0  n=3115  r=21.7  modelo logloss=0.5479 brier=0.1841 MAE=1.412  | base (sin equipos) logloss=0.5161 brier=0.1728 MAE=1.317
N=10 K= 5  n=3115  r=∞  modelo logloss=0.5211 brier=0.1744 MAE=1.330  | base (sin equipos) logloss=0.5161 brier=0.1728 MAE=1.317
N=10 K=10  n=3115  r=∞  modelo logloss=0.5133 brier=0.1715 MAE=1.310  | base (sin equipos) logloss=0.5161 brier=0.1728 MAE=1.317
N=10 K=20  n=3115  r=∞  modelo logloss=0.5100 brier=0.1703 MAE=1.303  | base (sin equipos) logloss=0.5161 brier=0.1728 MAE=1.317
N=10 K=40  n=3115  r=∞  modelo logloss=0.5104 brier=0.1705 MAE=1.302  | base (sin equipos) logloss=0.5161 brier=0.1728 MAE=1.317
N=20 K=20  n=3115  r=∞  modelo logloss=0.5095 brier=0.1700 MAE=1.301  | base (sin equipos) logloss=0.5161 brier=0.1728 MAE=1.317
N=20 K=40  n=3115  r=∞  modelo logloss=0.5086 brier=0.1697 MAE=1.299  | base (sin equipos) logloss=0.5161 brier=0.1728 MAE=1.317
N=30 K=40  n=3115  r=∞  modelo logloss=0.5076 brier=0.1693 MAE=1.298  | base (sin equipos) logloss=0.5161 brier=0.1728 MAE=1.317

Mejor combinación por logloss: N=30 K=40
  temporada 2024: n=1391 modelo logloss=0.5100 vs base 0.5192
  temporada 2025: n=1407 modelo logloss=0.5056 vs base 0.5141
  temporada 2026: n=317 modelo logloss=0.5057 vs base 0.5152

Calibración, línea 2.5 (probabilidad prevista de "más de 2.5" vs frecuencia real):
  [0.3–0.4) n= 104  previsto=38.3%  real=46.2%
  [0.4–0.5) n=1049  previsto=46.0%  real=47.7%
  [0.5–0.6) n=1380  previsto=54.8%  real=55.0%
  [0.6–0.7) n= 547  previsto=63.5%  real=62.5%
  [0.7–1) n=  35  previsto=72.8%  real=80.0%
```
