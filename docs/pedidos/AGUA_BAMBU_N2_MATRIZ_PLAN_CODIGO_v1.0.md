# AGUA BAMBÚ — N2: MATRIZ DE TRAZABILIDAD PLAN ↔ CÓDIGO

**Versión:** 1.0 · **Fecha:** 2026-09-05 · **Base:** `main` `c3822999`

Clasificación de "Código actual" según el vocabulario pedido: **ya implementado** / **parcialmente implementado** / **no implementado** / **implementado de forma diferente** / **obsoleto**.

## Estado de implementación (actualizado a medida que aportan PRs)

Esta sección se actualiza; la matriz de abajo queda como snapshot histórico de `#192` (con la corrección de `offlineId` ya aplicada inline).

- **Schema (`Actividad.modo`, `PedidoCantidadAjuste.montoDiferencial`) + `ModoActividadVO`** — ✅ implementado. Migración `prisma/migrations/20260905_add_actividad_modo_diferencial/`. La fila "`Actividad.modo`" de la matriz pasa a **ya implementado** (solo el campo de schema; los use cases que lo escriben siguen pendientes, ver filas correspondientes).

| Elemento | Decisión | Fuente | Código actual | Brecha | Acción |
|---|---|---|---|---|---|
| `Actividad.modo` | `PUNTO`/`DOMICILIO`, 1 campo | Decisión N2 (2026-09-05), consistente con `ALS_v2.md §16` | **No implementado** — `Actividad` no tiene columna `modo` (verificado, `schema.prisma:1195-1213`) | Sí | Migración aditiva (`AGUA_BAMBU_N2_ALS_v2.0.md §2.1`) |
| Histórico del modo | Auditoría (`logAudit`), no columnas paralelas | Decisión N2 | **No implementado** (no existe el campo ni el evento) | Sí | `CambiarModoActividadUseCase` con `logAudit` (§3.2 ALS) |
| Modo original vs actual coexisten | `Pedido.canal` = histórico, `Actividad.modo` = actual | Decisión N2 + `ALS_v2.md §16` | `Pedido.canal` **ya implementado** (inmutable, `ADR-PEDIDO-ORIGEN-CANAL-001`); `Actividad.modo` no implementado | Parcial (mitad ya existe) | Solo falta `Actividad.modo` |
| Diferencial — fórmula | `valor actual − valor histórico` | Decisión N2 + `ALS_v2.md §17` | **No implementado** como flujo; el motor de precios que necesita (`resolverPreciosPedido`) **ya implementado**, sin cambios requeridos | Sí (el flujo), No (el motor de precios) | `calcularDiferencial()` (§3.3 ALS) — reutiliza, no reimplementa |
| Diferencial positivo | Incrementa `Pedido.total`, cobro por cartera existente | Decisión N2 (mecánica) + propuesta técnica de representación (este ALS, no una decisión del PO) | **No implementado**. Patrón de precedente: `Pedido.total`/`Factura` ya se actualizan así en otros flujos (`ActualizarPedidoUseCase`) | Sí | §3.4 ALS |
| Diferencial negativo | `Cliente.saldoFavor` | Decisión N2 (mecánica) + patrón ya usado en `#159`/`#184` (F-A) | **Implementado de forma diferente** — el mecanismo `saldoFavor` existe y está probado (`aplicarSaldoFavor`/`getSaldoFavor`, `CrearPedidoUseCase`, F-A #184), pero no hay ningún llamador para el caso "diferencial" específicamente | Sí (falta el llamador) | §3.4 ALS |
| `ObligacionPendiente` | Bajo demanda, nunca automática | Decisión N2 | **Ya implementado — de forma correcta e implícita.** Cero callers de creación en producción (verificado, `#189`); el pendiente ordinario vive 100% en `Pedido`/`PedidoItem` desde PR-1 (`#175`) | No (la decisión ya se cumple hoy por *ausencia* de código automático) | Ninguna acción correctiva — solo falta el camino positivo (crearla bajo demanda, `GestionarPendienteUseCase`) |
| Pendiente ordinario en `Pedido`/`PedidoItem` | Decisión N2 + PR-1 | `PR1_INTEGRIDAD_ENTREGA_PARCIAL_v3.md`, `#175` | **Ya implementado**, con tests de integración verdes (`entrega-parcial-integridad.test.ts`) | No | Ninguna |
| PUNTO→DOMICILIO explícito | Comando explícito, nunca automático | Decisión N2 (reafirma `ALS_v2.md §33`, que lo clasificaba **PROPUESTA** — ver `#190` erratum) | **No implementado** | Sí | `CambiarModoActividadUseCase` (§3.2 ALS) |
| Múltiples parciales (conservación) | Cada tramo calcula su propio diferencial, sin doble cobro | Decisión N2 (nueva, no en documentos previos) | **No implementado** — no hay flujo de tramos hoy | Sí | §5.4 Especificación Funcional; constraint `I-1` (ya existente) acota la suma de `delta` |
| Fiscalidad del diferencial | Externa, no inventar | Decisión N2 (reafirma `PLAN_v2.md §14`, `N2 Plan Producto §14 gate 9`) | N/A — sin cambios, sigue bloqueado | — | Ninguna (esperar definición externa) |
| Cancelación de gestión pendiente (Caso J) | Definida en Especificación Funcional §7 | Decisión N2 (nueva) | **No implementado.** `LiberarActividadUseCase` no existe (ya señalado en `#189`/`#190`) | Sí | §3.5 ALS |
| `ObligacionEstado`/`ActividadEstado` para cancelar | Debe soportar el ciclo de cancelación | N/A (verificación técnica) | **Ya implementado** — `ObligacionEstado.ANULADA` y `ActividadEstado.CANCELADA` ya existen en el enum (`schema.prisma:131-148`) | No | Ninguna — no hace falta migrar el enum |
| Lock `OBLIGACION:{id}` | Cumplimiento/asignación bajo este lock | `ADR-OBLIGACION-001` (congelado) | **Ya implementado** (`AsignarActividadUseCase`) | No | Reutilizar para `CambiarModoActividadUseCase`/`LiberarActividadUseCase` |
| Lock `PEDIDO:{id}` para creación de Obligación | Nuevo en este ALS | Plan Maestro V11.1 §6 (patrón general), aplicado aquí por primera vez a `GestionarPendienteUseCase` | **Patrón ya implementado en otros casos de uso** (`ActualizarPedidoUseCase`), **no implementado para este flujo específico** | Sí | §3.1 ALS |
| Idempotencia `offlineId` en `ObligacionPendiente`/`Actividad` | Ya soportado por el schema | `ADR-OBLIGACION-001`/`ADR-ACTIVIDAD-001` | **Ya implementado** (columnas `offlineId @unique` existen) | No | Ninguna |
| Idempotencia `offlineId` en `PedidoCantidadAjuste` | Necesaria para no duplicar el cobro del diferencial en un replay | Nuevo, derivado de Plan Maestro V11.1 §14 | **Corrección (2026-09-05): Ya implementado.** `PedidoCantidadAjuste.offlineId String? @unique` ya existe (`schema.prisma:1231`) — la verificación original de esta matriz no vio la columna completa. Sin migración pendiente. | No | Ninguna |
| `PlanActividad ↔ Actividad` | Deliberadamente separadas para el MVP de entregas | `ADR-PLANIFICADOR-006 §2` (congelado) | **Ya implementado** — sin cambios de este ALS | No | Ninguna. Este ALS **no** toca el planificador |
| Materialización del camino "Gestionar pendiente" | `Actividad → Embarque` (vía asignación existente) | Decisión N2 + `ALS_v2.md §13` | **No implementado** (el comando de asignación de Actividad→Embarque ya existe genéricamente en `ADR-ACTIVIDAD-001`, pero nada de este flujo lo invoca todavía) | Sí | Cablear `GestionarPendienteUseCase`/`CambiarModoActividadUseCase` a la asignación existente |
| Motor de precios para "valor actual" | `resolverPreciosPedido` | N/A (verificación técnica) | **Ya implementado**, soporta especiales de cliente/negocio, precio por volumen y sobrecosto de domicilio (`src/lib/pricing.ts:275+`) | No | Ninguna — se reutiliza sin cambios |
| Snapshot de precio histórico | `PedidoItem.precio` | N/A (verificación técnica) | **Ya implementado** — es el snapshot real de las condiciones del pedido original, no el precio de lista bruto | No | Ninguna |
| Reversión de diferencial cobrado (Caso J) | Mismo patrón que `CancelarPedidoUseCase` | `ADR-CORRECCION-MONETARIA-001` (congelado) | **Ya implementado como patrón general** (`registrarReversionPedido`, `ReceivableEntry` tipo `REVERSION`); **no implementado** para el caso específico del diferencial | Sí | §3.5 ALS reutiliza el patrón |
| E2E de `Actividad`/`ObligacionPendiente`/modo | — | N/A (verificación técnica) | **No implementado** — cero specs E2E referencian estas entidades (verificado, `grep` sobre `e2e/*.spec.ts`) | Sí | Ver Matriz de Pruebas |
| Guard `I-11` (no doble entrega Pedido-ordinario vs Actividad-gestionada) | Hallazgo de la revisión adversarial (§11 Especificación Funcional) — no estaba en ningún documento previo | Nuevo, este ALS | **No implementado** — `EntregarPedidoUseCase`/`procesar-pedido.service.ts` no consultan `ObligacionPendiente` hoy (consistente con que nada las crea todavía) | Sí — **bloqueante** | ALS §3.4bis |

---

## Resumen por clasificación

| Clasificación | Cuenta | Elementos |
|---|---|---|
| Ya implementado | 10 | `Pedido.canal`, pendiente ordinario (PR-1), lock `OBLIGACION:{id}`, `offlineId` en Obligación/Actividad/`PedidoCantidadAjuste`, `ObligacionEstado`/`ActividadEstado` (sin cambios), `PlanActividad≠Actividad`, motor de precios, snapshot histórico, patrón de reversión general |
| Ya implementado — decisión cumplida por ausencia de código | 1 | `ObligacionPendiente` bajo demanda (se cumple porque nada la crea automáticamente hoy) |
| Implementado de forma diferente | 1 | `saldoFavor` (existe y probado, pero sin llamador para diferencial) |
| Parcialmente implementado | 1 | Modo original/actual (mitad = `Pedido.canal`, mitad = `Actividad.modo` falta) |
| No implementado | 12 | `Actividad.modo` (schema), auditoría de cambio de modo, flujo de diferencial (mecánica), positivo/negativo/cero como flujo, `GestionarPendienteUseCase`, `CambiarModoActividadUseCase`, `LiberarActividadUseCase`, múltiples parciales, materialización Actividad→Embarque del camino nuevo, reversión específica del diferencial, E2E, **guard `I-11` (bloqueante)** |
| Obsoleto | 0 | — |
| N/A (bloqueo externo) | 1 | Fiscalidad |
