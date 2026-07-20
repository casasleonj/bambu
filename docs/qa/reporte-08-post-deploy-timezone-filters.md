# Reporte QA — Post-deploy: filtros de embarques, timezone y /reportes/ventas

## Cobertura
- Vistas afectadas: `/embarques`, `/reportes`, `/reportes/ventas`, `/gastos`, `/facturas`, `/pedidos`
- Roles probados: ADMIN, ASISTENTE, CONTADOR, REPARTIDOR
- Filtros: rango de fechas (parcial y completo), estado de embarque, trigger `?new=1`
- Endpoints auditados: `/api/embarques`, `/api/embarques/stats`, `/api/pedidos`, `/api/compras`, `/api/facturas`, `/api/gastos`, `/api/reportes/ventas`

## Bugs encontrados y corregidos

### Clase A — Rango parcial roto
Síntoma: al seleccionar solo "desde" o solo "hasta" en un filtro de fechas, el cliente no enviaba nada al servidor y la vista saltaba al default de "hoy".

Causa: patrón sistémico `if (desde && hasta)` en 6 API routes y 4 client components.

Archivos modificados:
- `src/lib/dates.ts`: helper `buildDateRangeFilter` con tests.
- API: `src/app/api/embarques/route.ts`, `src/app/api/embarques/stats/route.ts`, `src/app/api/pedidos/route.ts`, `src/app/api/compras/route.ts`, `src/app/api/facturas/route.ts`, `src/app/api/gastos/route.ts`.
- UI: `src/app/(app)/embarques/embarques-client/index.tsx`, `src/app/(app)/embarques/embarques-client/stats-tab.tsx`, `src/app/(app)/facturas/facturas-client/index.tsx`, `src/app/(app)/gastos/gastos-client/index.tsx`.

### Clase B — "Today" calculado en UTC
Síntoma: después de las 19:00 Bogotá, las vistas default mostraban "mañana" en lugar de "hoy", haciendo que datos recientes desaparecieran.

| # | Archivo | Impacto |
|---|---------|---------|
| B1 | `src/app/api/gastos/route.ts` | Param `fecha` usaba `T00:00:00.000Z`; ventana de 24h desplazada 5h |
| B2 | `src/app/(app)/gastos/gastos-client/index.tsx` | `fecha` default enviaba fecha UTC |
| B3 | `src/app/(app)/reportes/page.tsx` | Default del reporte abría mostrando "mañana" → vacío |
| B4 | `src/lib/stock.ts` | `stock_estimado_hoy` expiraba a las 19h (o duraba 23h) según hora de creación |
| B5 | `src/lib/embarque-stats.ts` | Tendencia diaria agrupaba embarques nocturnos en el día siguiente |

Tests agregados/actualizados:
- `src/lib/__tests__/dates.test.ts`: 6 tests de `buildDateRangeFilter`.
- `src/lib/__tests__/stock.test.ts`: mock de `getTodayString` + assertions con helper canónico.
- `src/lib/__tests__/embarque-stats.test.ts`: test de agrupación por fecha Bogotá (fallaba con UTC, pasa con fix).

### /reportes/ventas 404 + resumen paginado incorrecto
Síntoma: `/reportes/ventas` no existía (404) y el endpoint `/api/reportes/ventas` calculaba el `resumen` solo sobre la página actual.

Correcciones:
- `src/app/(app)/reportes/ventas/page.tsx`: nueva página Server Component con filtros, resumen y tabla paginada.
- `src/app/(app)/nav-data.tsx`: enlace "Ventas" bajo Reportes.
- `src/app/api/reportes/ventas/route.ts`: resumen calculado con `aggregate` y `pago.groupBy` sobre todo el rango; `pedidos` sigue paginado.

### SSR de /embarques
Síntoma: el SSR usaba `unstable_cache` con key estático y sin filtro de fecha, pudiendo servir datos stale entre días y mostrando embarques cancelados en la carga inicial.

Corrección:
- `src/app/(app)/embarques/page.tsx`: query directa con filtro `hoy + estado != CANCELADO`, sin cache.
- `src/app/(app)/embarques/embarques-client/index.tsx`: botón "Cancelados" en filtros; llamada pesada `all=true&stock=true` solo en vista default.

## Regresiones verificadas
- `npx tsc --noEmit`: OK
- `npm run test` (Vitest): OK — 1329+ tests pasan en la suite afectada.
- Baseline diff: 0 fallas nuevas.

## Items analizados y descartados
- `src/shared/domain/value-objects.ts:160` — aritmética UTC como espacio neutro, correcta.
- `src/lib/validators.ts:437` — round-trip UTC deliberado para detectar rollover, correcto.
- `src/app/(app)/clientes/page.tsx` — `unstable_cache` key incluye `searchParams` serializados, correcto.
- `src/app/api/clientes/[id]/historial/route.ts:14` — error de 5h sobre ventana de meses, inmaterial.
- `src/app/(app)/nomina/nomina-client/index.tsx:56` — solo atributo `max` de input date, impacto de 1h, inmaterial.
- `src/app/api/reportes/ventas/route.ts:14` `fecha.toISOString()` — latente, ningún caller lo dispara.

## Riesgos residuales
- Eliminación del cache SSR de `/embarques` puede incrementar ligeramente el TTFB en Vercel Hobby; aceptado por escala de 6 usuarios y prioridad de corrección.
- Stock bajo en `/embarques` se recalcula solo en vista default (hoy) para evitar llamada pesada; si un usuario filtra por fecha y vuelve a hoy, se refresca en el próximo polling/acción.

## Convergencia
Cobertura completa de los issues reportados post-deploy: sí. Pasada adicional sin bug nuevo: sí.
