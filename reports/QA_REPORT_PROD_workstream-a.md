# QA Report — Workstream A (P0/P1 críticos + Bug 6)

**Branch:** `fix/qa-prod-bugs-criticos`
**Ambiente:** Producción (`https://portal.aguabambu.com`) para diagnóstico; fixes validados localmente.
**Fecha:** 2026-07-20
**Ejecutor:** OpenCode / agente de ingeniería

---

## Resumen ejecutivo

Durante el QA paranoico de Workstream A se identificaron 6 bugs críticos de dinero, timezone y concurrencia. Todos fueron corregidos en 8 commits atómicos en la rama `fix/qa-prod-bugs-criticos`. Los fixes se validaron con `npx tsc --noEmit` y con la suite de tests de Vitest.

| # | Bug | Severidad | Archivo(s) clave | Commit |
|---|-----|-----------|------------------|--------|
| 1 | Timezone UTC en rango custom de `/api/embarques` | P0 | `src/app/api/embarques/route.ts` | 46b1ddb5 |
| 2 | Timezone UTC + ventana 0s en `/api/reportes/ventas` | P0 | `src/app/api/reportes/ventas/route.ts` | da6996a8 |
| 3 | `efectivoReal` incluía fiado y transferencias (cierre embarque) | P0 | `src/modules/embarques/domain/services/cierre-embarque.service.ts`, `src/app/(app)/embarques/[id]/cerrar/cerrar-client/index.tsx` | 24d7004d |
| 4 | Cancelar embarque EN_RUTA reseteaba pedidos ENTREGADO | P0 | `src/app/api/embarques/[id]/route.ts` | 08a18e82 |
| 5 | Nota Crédito usaba `total`/`totalOriginal` en lugar de `totalPagado` | P0 | `src/modules/pedidos/domain/entities/Pedido.ts`, `AnularPedidoUseCase.ts`, `CancelarPedidoUseCase.ts` | 67d6909f |
| 6 | Race condition en `use-pedidos`: fetch abortado por polling dejaba la UI bloqueada | P1 | `src/hooks/use-pedidos.ts`, `src/hooks/use-polling-refetch.ts`, `src/app/(app)/pedidos/pedidos-client/index.tsx`, `src/app/api/pedidos/counts/route.ts` | 0be4fdd9, 56594843 |

---

## Hallazgos detallados

### 1. `/api/embarques` custom range interpreta fechas como UTC

**Síntoma:** Al filtrar embarques por un rango de fechas en Bogotá, el resultado mostraba datos del día anterior o posterior.

**Causa:** `new Date(desde)` con string `YYYY-MM-DD` crea un `Date` a medianoche UTC. En Bogotá (UTC-5) eso representa las 19:00 del día anterior.

**Fix:** Usar `startOfDayInBogota(desde)` / `endOfDayInBogota(hasta)` de `@/lib/date-helpers`.

**Validación:** Type check + tests estáticos de la ruta.

---

### 2. `/api/reportes/ventas` ventana 0s cuando `start === end`

**Síntoma:** Seleccionar el mismo día en el reporte de ventas retornaba 0 resultados.

**Causa:** `dateFilter.gte` y `dateFilter.lte` eran el mismo `Date` (med UTC), dejando una ventana de 0 segundos.

**Fix:** Detectar si el input es fecha (`YYYY-MM-DD`) y expandirlo al inicio/fin del día en Bogotá; si es datetime, respetar el valor exacto.

**Validación:** Type check + tests estáticos de la ruta.

---

### 3. Cierre de embarque: `efectivoReal` incluía ventas a crédito

**Síntoma:** Repartidores aparecían con faltante de caja incluso cuando habían entregado todo el dinero efectivo. El sistema generaba deudas fantasma.

**Causa:** `efectivoReal = baseDinero + totalVentas - otrosPagos - gastos`. `totalVentas` incluía fiado (saldo no cobrado) y `otrosPagos` restaba transferencias que nunca fueron efectivo físico.

**Fix:** `efectivoReal = baseDinero + efectivoEsperado - gastos`, donde `efectivoEsperado` es solo la suma de pagos en efectivo. Se actualizó tanto el servicio de dominio como el preview del cliente.

**Validación:** `npx vitest run src/modules/embarques/__tests__/cerrar.test.ts` (9 tests OK).

---

### 4. Cancelar embarque EN_RUTA reseteaba pedidos ENTREGADO

**Síntoma:** Cancelar un embarque que ya había salido en ruta dejaba pedidos entregados como PENDIENTE, permitiendo doble entrega y perdiendo trazabilidad.

**Causa:** El handler DELETE de `/api/embarques/[id]/route.ts` solo bloqueaba `CERRADO`, no `EN_RUTA`, y hacía `updateMany` incondicional sobre todos los pedidos.

**Fix:**
- Solo permitir cancelar embarques en estado `ABIERTO`.
- El `updateMany` de pedidos ahora excluye `estadoEntrega: 'ENTREGADO'`.

**Validación:** `npx vitest run src/app/api/embarques/[id]/__tests__/route.test.ts` (32 tests OK).

---

### 5. Nota Crédito por `total`/`totalOriginal` en vez de `totalPagado`

**Síntoma:** Al anular o cancelar un pedido fiado, la Nota Crédito se generaba por el valor total del pedido, no por lo que el cliente realmente pagó.

**Causa:**
- `AnularPedidoUseCase` usaba `updated.total.toDecimal()`.
- `CancelarPedidoUseCase` usaba `totalOriginal`.

Ambos importes pueden incluir saldo/fiado no pagado.

**Fix:** `Pedido.anular()` y `Pedido.cancelar()` ahora retornan `totalPagado` (monto efectivamente cobrado antes del reset). Los use cases usan ese valor para la NC.

**Validación:** `npx vitest run src/modules/pedidos/__tests__/entregar.test.ts` (16 tests OK).

---

### 6. `FETCH_PEDIDOS_ERROR` por race entre mount fetch y polling

**Síntoma:** La pantalla de pedidos quedaba con `ErrorState` bloqueante o mostraba "La carga está tardando demasiado" sin motivo real.

**Causa raíz:** El componente disparaba el fetch de pedidos desde 5 lugares simultáneos:
1. `usePedidos` autoFetch.
2. Mount effect con `fetchPedidos()`.
3. `usePollingRefetch` con tick inicial a 2s.
4. `setInterval` manual.
5. `visibilitychange` manual.
6. `useReconnectHandler`.

El abort de un request por otro más nuevo dejaba el error del request stale en el estado.

**Fix:**
- `use-pedidos.ts`: agregar `requestId` y guard `isCurrent()` para ignorar resultados de requests stale; `setError(null)` en éxito.
- `use-polling-refetch.ts`: eliminar el tick inicial de 2s; el primer tick ahora ocurre después del intervalo completo.
- `pedidos-client/index.tsx`:
  - Remover el `fetchPedidos()` del mount effect (el hook autoFetch ya lo hace).
  - Remover `setInterval` manual y listener `visibilitychange` duplicados.
  - No bloquear la UI con `ErrorState` si ya hay datos cargados; mostrar `toast.error` y conservar el listado.
- Nuevo endpoint `/api/pedidos/counts` + hook `usePedidosCounts` para mantener los badges de Fiados/Alertas actualizados sin re-descargar todo el listado.

**Validación:**
- `npx tsc --noEmit` OK.
- Tests estáticos de `use-pedidos.ts`, `use-polling-refetch.ts` y `/api/pedidos/counts` OK.

---

## Comandos de verificación

```bash
# Type check
npx tsc --noEmit

# Tests unitarios relevantes
npx vitest run src/modules/embarques/__tests__/cerrar.test.ts
npx vitest run src/modules/pedidos/__tests__/entregar.test.ts
npx vitest run src/app/api/embarques/[id]/__tests__/route.test.ts
npx vitest run src/app/api/pedidos/__tests__/route.test.ts
npx vitest run src/hooks/__tests__/use-pedidos.test.ts
npx vitest run src/hooks/__tests__/use-polling-refetch.test.ts
npx vitest run src/app/api/pedidos/counts/__tests__/route.test.ts
```

---

## Próximos pasos / Follow-ups

1. **Deploy a staging:** validar los fixes con datos reales antes de producción.
2. **E2E en producción:** ejecutar el walkthrough de Workstream A contra `portal.aguabambu.com` y verificar que no se reproduzcan los bugs.
3. **Monitor de caja:** agregar alerta si `efectivoReal - dineroEntregado > umbral` en cierres futuros.
4. **Workstream B:** continuar con bugs P1/P2 identificados fuera del scope de esta rama.

---

## Notas de cleanup

Ver `reports/cleanup-prod-workstream-a.sql` para eliminar datos de prueba generados durante el QA en producción. **Ejecutar solo después de confirmar que los registros listados son de prueba.**
