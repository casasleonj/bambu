# Fase 3 — Command Center · plan de pantalla

- **Estado:** ✅ IMPLEMENTADO (Ronda 3) — aprobado por el PO 2026-08-27
- **PR:** `feat/embarques-fase3-command-center` (stack sobre PR #134)

## Ejecutado

- Backend: `GET /api/embarques` + SSR `/embarques/page.tsx` incluyen `_count: { pedidos, movimientos, recoveries, sustituciones, responsibilityCases }`.
- `embarques-client/command-center/`: `index.tsx` (orquesta + estado de red), `fase-section.tsx` (columna desktop / sección colapsable mobile), `command-card.tsx` (badge de fase + capacidad + fila de actividad + CTA), `kpi-row.tsx`, `activity.ts` (deriva actividad del `_count`).
- Flag `NEXT_PUBLIC_EMBARQUES_V2` (default ON; `=false` → lista plana histórica). Envuelve solo la tab "Embarques" en `embarques-client/index.tsx`; los 8 botones de filtro por fase quedan solo en V1.
- **Decisión sobre el CTA:** en la tarjeta, el CTA de `derivarSiguientePaso` es un **rótulo dentro del `<Link>` al detalle**, no un botón que muta. La ejecución real de "enviar"/"cerrar" vive en el detalle (Fase 5) y en el Preparation Flow (Fase 4). Una mutación inline desde la tarjeta necesitaría confirm modals + manejo offline que son alcance de esas fases.
- Tests: `command-center/__tests__/command-center.test.tsx` (8), `src/app/api/embarques/__tests__/route-list-counts.test.ts` (2). E2E de `embarques.spec.ts` / `embarques-all-contexts.spec.ts` / `embarques-fixes.spec.ts` reescritos de "botones de filtro" → "Command Center".
- Verificación: `npx tsc --noEmit` limpio; 267 tests de embarques + 231 de pedidos verdes; `npx eslint` limpio. **E2E con browser: pendiente de CI** (no ejecutable en este entorno — patrón AGENTS.md #20).
- **Reemplaza:** la tab "Embarques" de `/embarques` (`embarques-client/index.tsx`)
- **Base:** `00-plan-frontend-completo.md` §FASE 3 + `01-ux-contract.md` §5.1 + `02-api-contract.md` §1

---

## RONDA 1 — hallazgos específicos

### Lo que ya existe y se reutiliza
- `src/lib/embarque-ui-estado.ts` — `derivarEstadoUI`, `contarPorFase`, `FASES_ORDEN`, `LABELS`, `BADGES`, `estadoBackendParaFase`, `derivarSiguientePaso`. **Testeado.** Es el motor de fases.
- `resumen-estados.tsx` (26 líneas) — ya cuenta embarques por fase; se absorbe/evoluciona.
- `embarque-card.tsx` (90) — tarjeta actual con badge de fase + capacidad + déficit.
- `stats-kpi-cards.tsx` / `stats-tab.tsx` — la tab Estadísticas queda **igual**, no se toca.
- Filtros: `DateRangeFilter`, botones de fase (hoy 8 botones), `usePollingRefetch(60s)`, `useRealtimeListener(['embarque.*'])`.
- `GET /api/embarques` ya devuelve `capacidadInfo`, `totalPacas`, `pesoKg`, `pedidos` (take 50), `productos`, `_count.pedidos`.

### Gaps a resolver en este PR
1. **La lista no trae "actividad reciente" del backend nuevo.** El tipo `Embarque` y `GET /api/embarques` no incluyen conteo de `movimientos`/`recoveries`/`sustituciones`/`responsibilityCases`. Para que la tarjeta "se sienta viva" sin N+1, se agrega `_count` de esas relaciones a la query del GET (additivo, mismo round-trip Prisma). El modelo `Embarque` ya tiene las 5 relaciones (`prisma/schema.prisma:864`).
2. **No hay caché de lista offline en Dexie.** Verificado: `src/lib/db/offline.ts` solo tiene `pedidos`/`clientes` (entidades creadas offline) + `requestQueue` (mutaciones). **No existe** un patrón de "cachear la última lista GET". Clientes/pedidos tampoco lo hacen. → El estado "offline" del Command Center = **mantener la última lista en memoria + badge "sin conexión"**, NO navegar a `ErrorState` si ya había datos. No se construye una capa de caché nueva en este PR (sería scope/riesgo). Se ajusta `01-ux-contract.md` §5.1 a esta realidad.
3. **8 botones de filtro planos** → se reemplazan por el agrupado por fase (columnas/secciones) + el filtro de fecha. Un embarque "perdido" de ayer ya tiene mitigación (`Ver últimos 30 días`), se conserva.
4. **`getCapacidadInfo` (lib) vs `CapacidadInfo` (dominio)** siguen con thresholds paralelos y labels distintos (`'Máximo'` vs `'Maximo'`). El Command Center consume `capacidadInfo` **que ya viene serializado en la respuesta del GET** (calculado con la versión lib). No se fuerza la consolidación acá para no rippear labels de UI; se deja anotado para un PR de limpieza aparte.

### Selectores E2E que dependen del layout actual (`e2e/embarques.spec.ts`, `embarques-all-contexts.spec.ts`, `embarques-hydration.spec.ts`)
- `data-testid="embarques-grid"`, `"embarque-card"`, `"resumen-estados"`, `"mostrando-hoy-badge"`, `"ver-ultimos-30-dias"`.
- El PR mantiene esos `data-testid` donde el concepto sobrevive (`embarque-card`, `mostrando-hoy-badge`, `ver-ultimos-30-dias`) y añade los nuevos; los tests que asuman "grid plano" se actualizan a "columnas por fase".

---

## RONDA 2 — plan de ejecución

### Flag
`NEXT_PUBLIC_EMBARQUES_V2` — patrón del repo: **habilitado por default**, se apaga con `=== 'false'` (igual que `NEXT_PUBLIC_REALTIME_ENABLED`). En este PR el flag envuelve solo la tab "Embarques": `false` → render del `embarques-client` actual intacto.

### Backend (additivo, sin schema)
`GET /api/embarques` — agregar al `include`:
```ts
_count: { select: { pedidos: true, movimientos: true, recoveries: true, sustituciones: true, responsibilityCases: true } }
```
y exponerlo en el item. Actualizar `02-api-contract.md` §1 (`EmbarqueListItem`). Test: el shape del GET incluye los nuevos conteos.

### Componentes nuevos (`src/app/(app)/embarques/embarques-client/command-center/`)
| Archivo | Responsabilidad |
|---|---|
| `index.tsx` | Orquesta: recibe `initialData`, `fetchData` (reusa el del `embarques-client`), realtime `embarque.*`, polling 60s. Deriva fases con `contarPorFase`. Decide desktop vs mobile por `data-testid`. Maneja los 4 estados de red. |
| `fase-section.tsx` | Una sección/columna por `FaseUIEmbarque` (orden `FASES_ORDEN`): encabezado con conteo + lista de tarjetas. Colapsable en mobile, columna en desktop (`lg:grid-cols-3`). |
| `command-card.tsx` | Evolución de `embarque-card.tsx`: nº, repartidor, ruta, badge de fase, capacidad, nº pedidos, **fila de actividad** (`_count` de movimientos/recovery/sustituciones/casos, solo si > 0), y **CTA contextual** (`derivarSiguientePaso`) que ejecuta la acción (link a detalle con intent, o abre modal). |
| `kpi-row.tsx` | Fila compacta de KPIs arriba: total embarques, en ruta, cerrados hoy, faltantes de caja abiertos. Reusa `GET /api/embarques/stats` o deriva de la lista. |
| `filtros-bar.tsx` | `DateRangeFilter` + toggle "solo activos" + (mantiene `mostrando-hoy-badge` / `ver-ultimos-30-dias`). Los 8 botones de fase se reemplazan por scroll a la sección. |

`embarques-client/index.tsx` — condicionar: `EMBARQUES_V2 ? <CommandCenter …/> : <listaActual/>` dentro de la tab "Embarques". La tab "Estadísticas" y los modales (crear/auto-generar/stock) quedan compartidos y sin cambios.

### Estados de red (§5 del ux-contract)
| Estado | Command Center |
|---|---|
| loading | `loading.tsx` de la ruta (ya existe) + skeleton de columnas |
| success | columnas por fase con tarjetas |
| offline | última lista en memoria + badge "Sin conexión — se actualiza al reconectar"; **no** `ErrorState` si ya había datos; el badge sale de `useOnlineStatus()` |
| error | si el primer fetch falla y no hay `initialData` → `ErrorState` con reintento (comportamiento actual) |

### Responsive (AGENTS.md #24)
- Desktop (`>=1024`): `data-testid="command-center-desktop"` — grid de columnas por fase.
- Mobile (`<1024`): `data-testid="command-center-mobile"` — secciones apiladas colapsables, encabezado de fase sticky.
- Tests usan `responsiveContainer(page, 'command-center-mobile', 'command-center-desktop')`.

### Tests
- `command-center/__tests__/command-center.test.tsx` — agrupación por fase, CTA correcta por fase, fila de actividad solo con `_count>0`, transición a "offline" sin perder datos.
- `src/lib/embarque-ui-estado.test.ts` — extender si se agrega lógica de KPI derivado.
- `src/app/api/embarques/__tests__/route-list-counts.test.ts` — el GET incluye los `_count` nuevos.
- E2E: `e2e/embarques.spec.ts` — reescribir asserts de "grid" → "columnas por fase"; mantener el resto. `embarques-hydration.spec.ts` — verificar sin hydration mismatch (horas con `toLocaleTimeString` ya fue un bug, `60a89af5`).

### Criterios de éxito (gate del PR)
- [ ] `npx tsc --noEmit` + `npm run test` (embarques) + `npx eslint` (touched) verdes.
- [ ] Con `NEXT_PUBLIC_EMBARQUES_V2=false` la pantalla es idéntica a hoy (mismo `embarques-client`).
- [ ] Con el flag ON: columnas/secciones por las 6 fases derivadas, conteo correcto vs `contarPorFase`.
- [ ] Cada tarjeta muestra su CTA de `derivarSiguientePaso` y ejecuta la acción correcta.
- [ ] Tarjetas EN_RUTA/CERRADO con movimientos/recovery muestran la fila de actividad; las demás no.
- [ ] Realtime: crear/enviar/cerrar desde otra sesión reordena las tarjetas sin refresh (E2E multi-contexto).
- [ ] Offline (red cortada tras cargar): badge visible, datos intactos, sin `ErrorState`.
- [ ] Desktop + mobile con `data-testid` por vista; E2E mobile pasa.
- [ ] `grep -r "PUT\|PATCH" ...command-center` no escribe `estado` (granularidad derivada, nunca persistida).
- [ ] `02-api-contract.md` §1 actualizado con los `_count`.

### Rollback
`NEXT_PUBLIC_EMBARQUES_V2=false`. El `embarques-client` viejo y todos sus componentes se conservan hasta Fase 10.

### Fuera de alcance de este PR (va en fases siguientes)
- Preparation Flow / wizard (Fase 4).
- Rediseño del detalle (Fase 5).
- Consolidar `getCapacidadInfo` con el VO de dominio (PR de limpieza aparte).
- Caché de lista offline en Dexie (no se hace; se documenta la decisión).
