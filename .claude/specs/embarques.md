# Spec: Módulo Embarques — Agua Bambú

> **Estado:** reescrito 2026-08-31 (G9 del INVENTARIO de Fase 0). La spec "v2"
> anterior estaba obsoleta (schema sin ledgers, sin `EN_RUTA`, sin recovery/
> responsabilidad, body de cierre viejo).
>
> **Documentos autoritativos** (esta spec es solo un mapa; ante duda, ganan estos):
> - Contrato de dominio congelado: `plan-maestro-v11.1-equipo-desarrollo.md` + `docs/adr/*.md`
> - UX: `docs/embarques/01-ux-contract.md`
> - API: `docs/embarques/02-api-contract.md`  ← **fuente de verdad de endpoints**
> - Excepciones: `docs/embarques/03-exception-model.md`
> - Frontend rework (fases 3–10): `docs/embarques/00-plan-frontend-completo.md`, `PENDIENTE.md`
> - El código: `src/app/api/embarques/**`, `src/modules/embarques/**`

---

## Estados reales

`EstadoEmbarque` (`src/modules/embarques/domain/value-objects/EstadoEmbarque.ts`):

```
ABIERTO → EN_RUTA → CERRADO
   └───────────────→ CANCELADO
```

Solo 4 estados persistidos. Toda la granularidad de UX (`BORRADOR`, `CONFIRMADO`,
`PREPARANDO`, `RETORNADO`…) se **deriva en cliente** con `derivarEstadoUI`, nunca se persiste.

Transición: `EN_RUTA → CERRADO` es la única que permite el VO para cerrar
(cerrar un `ABIERTO` lanza "Transición inválida" → 400).

## Los 4 ledgers (contrato §1 del plan maestro)

| Ledger | Modelos |
|---|---|
| Obligaciones comerciales | `Pedido`, `Actividad`, `ObligacionPendiente`, `PedidoCantidadAjuste`, `PromotionRule` |
| Físico | `EmbarqueCarga`, `EmbarqueCargaProducto`, `EmbarqueMovimiento` (canónico), `Retorno`, `Sustitucion`, `RecoveryDecision` |
| Monetario | `Pago`, `Abono`, `Gasto`; `ReceivableEntry` = proyección |
| Responsabilidad | `ResponsibilityCase` → `DescuentoRepartidor` / `DeudaTrabajador` (solo tras resolución autorizada) |

`EmbarqueProducto` (ints `cargadas/devueltas/rotas/cambios`) es mirror legacy,
todavía fuente de conciliación del cierre. `Embarque.offlineId` es `@index`
(single-slot), no `@unique`.

## Asignación de pedidos → embarque

`Pedido.embarqueId` (FK única). Dos mecanismos, ambos ponen `estado='EN_RUTA'`:
- `POST /api/pedidos/[id]/enviar` (un pedido) — guard `updateMany({where:{embarqueId:null}})`; conflicto → **409** (F6).
- `PUT /api/embarques/[id]` con `pedidoIds[]` (masivo) — lock `EMBARQUE_CARGA:{id}`, conflicto → **409** (`PEDIDOS_YA_ASIGNADOS`).

El wizard "Nuevo Embarque" (`src/app/(app)/embarques/embarques-client/nuevo-embarque/`)
selecciona pedidos existentes (`estadoEntrega ∈ {PENDIENTE, NO_ENTREGADO}`, sin
`embarqueId`) y llama `POST /api/embarques` + `PUT /api/embarques/[id]`. **No crea pedidos.**

## Planificador → Embarque

`PlanDia CONFIRMED` → `MaterializarPlanUseCase` → por cada `PlanGrupo` llama
`CrearEmbarqueUseCase` (existente) + asigna `PlanActividad.pedidoIds`. Un
`PlanGrupo` = un `Embarque`. El planificador nunca toca el ledger físico.
Ver `docs/adr/ADR-PLANIFICADOR-001..006`.

## Cierre — `POST /api/embarques/[id]/cerrar`

`CerrarEmbarqueUseCase`. Roles ADMIN/ASISTENTE + ownership. Doble lock
`CIERRE:{id}` → `SECUENCIA:pedido`. Idempotente por `offlineId` + `CierreDedupService`.
`POST .../cerrar/preview` = mismo use case con `dryRun: true` (rollback antes del commit), sin `offlineId`.

Por pedido (`ProcesarPedidoService`): `COMPLETO` → `ENTREGADO`; `PARCIAL` →
`ENTREGADO` + pedido-hijo `PENDIENTE` del faltante; `NO_ENTREGADO` → `NO_ENTREGADO`
+ `embarqueId=null` (o reasignado a `nuevoEmbarqueId` ABIERTO/EN_RUTA).
`preciosReales` solo si `userRole === 'ADMIN'`. Guard `PAGOS_EXCEDIDOS` (tolerancia 1%).

El cierre escribe directo en la misma tx: `Pedido`, `Pago`, `Factura`,
`ReceivableEntry`, `EmbarqueMovimiento` (dual-write), `Gasto`, `EmbarqueProducto`,
`ResponsibilityCase`. **NO** crea `DeudaTrabajador`/`DescuentoRepartidor` (eso es
`ResolverResponsibilityCaseUseCase` con `autorizadoPorId`). **NO** toca `CierreDia`
(cierre de día es otro dominio).

## Excepciones (`03-exception-model.md`)

`STOCK_INSUFFICIENT`, `CAPACITY_EXCEEDED` (MAX 70 unidades, `Config.MAX_UNIDADES_EMBARQUE`),
`NO_DRIVER_AVAILABLE`, `PHYSICAL_MISMATCH`, `MONEY_MISMATCH` (→ `ResponsibilityCase`
`FALTANTE_CAJA` si `> UMBRAL_MINIMO_FALTANTE_CAJA` y sin justificación),
`DELIVERY_FAILED`, `DOBLE_CONSUMO` (recovery concurrente → 409), `SUSTITUCION_INVALIDA`.

## Otros endpoints

`/api/embarques/[id]/{movimientos,recovery,sustituciones,botellones,gastos,optimizar-orden,enviar}`
y `/api/embarques/stats`, `/api/embarques/auto` (reemplazado por el Planificador en UI).
Detalle en `docs/embarques/02-api-contract.md`.

## Deuda conocida

Ver `docs/embarques/02-api-contract.md §14` (8 ítems) y `docs/embarques/PENDIENTE.md`.
