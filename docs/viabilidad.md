# Viabilidad de datos · API-Football (plan gratis)

Fecha de la prueba: 2026-11-04. Script: `scripts/viabilidad.ts`. Datos tomados de las respuestas reales de la API; nada está inferido.

## Resultados por liga (temporada 2024-25, la más reciente accesible)

| Liga | Partido | Córners totales | 1.er tiempo | 2.º tiempo | Solicitudes útiles |
|---|---|---|---|---|---|
| Premier League | Nottingham Forest vs Brentford (2025-05-01) | sí (4 + 5) | sí (1 + 2) | sí (3 + 3) | 3 |
| LaLiga | Rayo Vallecano vs Getafe (2025-05-02) | sí (7 + 3) | sí (2 + 1) | sí (5 + 2) | 3 |
| Serie A | Torino vs Venezia (2025-05-02) | sí (5 + 1) | sí (0 + 0) | sí (5 + 1) | 3 |
| Bundesliga | 1. FC Heidenheim vs VfL Bochum (2025-05-02) | sí (6 + 4) | sí (1 + 2) | sí (5 + 2) | 3 |
| Premier League, temporada 2023-24 | partido id 1035428 (mayo 2024) | sí | **no** (`half=true` devuelve 0 resultados) | **no** | 3 |

Entre paréntesis: local + visitante. Los valores por tiempo vienen en `statistics_1h` y `statistics_2h` al pedir `fixtures/statistics?fixture=ID&half=true`. Sin `half`, solo llega el total del partido.

## Restricciones del plan gratis (comprobadas)

| Hallazgo | Evidencia de la API |
|---|---|
| Solo temporadas 2022 a 2024. Las temporadas 2025 y 2026 están bloqueadas, incluida la actual. | `Free plans do not have access to this season, try from 2022 to 2024.` |
| El parámetro `last` no está disponible. Hay que usar `from`/`to` o `date`. | `Free plans do not have access to the Last parameter.` |
| Límite por minuto además del diario (alrededor de 10 por minuto). | Error 429 `rateLimit` |

Solicitudes gastadas en total: **30 de 100** (15 útiles, 10 en descubrir las restricciones de temporada y de `last`, 5 perdidas por el límite por minuto). El script ya hace una pausa de 7 s entre llamadas.

## Observaciones y límites de la prueba

- Se probó **un partido por liga**, no una muestra. Que haya detalle por tiempo en un partido no garantiza que lo haya en todos.
- El partido de la Premier 2023-24 no tiene detalle por tiempo. No sé si el detalle por tiempo existe solo desde la temporada 2024-25 o si faltan partidos sueltos; hace falta más muestra.
- Torino vs Venezia aparece con 0 córners en el 1.er tiempo para ambos equipos. Es posible, pero no lo he podido contrastar con otra fuente.
- Los ids de liga 39, 140, 135 y 78 se confirmaron por el nombre que devuelve la API (Premier League, La Liga, Serie A, Bundesliga).

## Conclusión

La API entrega córners por tiempo en las 4 ligas, pero el plan gratis solo llega hasta la temporada 2024-25: **no da acceso a la temporada actual**, así que no cubre los partidos recientes que el modelo necesita (últimos 8 a 10 de cada equipo).
