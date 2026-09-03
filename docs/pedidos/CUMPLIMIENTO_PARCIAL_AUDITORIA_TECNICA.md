# Cumplimiento parcial — Auditoría técnica (evidencia de código)

**Estado:** COMPAÑERO TÉCNICO de `CUMPLIMIENTO_PARCIAL_PLAN_v2.md` + `CUMPLIMIENTO_PARCIAL_ALS_v2.md`
**Plan de registro:** los `_v2` son la fuente de verdad del planeamiento. Este doc solo aporta la evidencia `archivo:línea` que los sustenta y 3 hallazgos adicionales.
**Fecha:** 2026-09-02 · **Baseline:** `48284e65` (post #172)
**Supersede:** `CUMPLIMIENTO_PARCIAL_ARQUITECTURA_v1.1.md` (fusionado en los `_v2` del equipo)

---

## 1. Evidencia del bug monetario

| Afirmación del PLAN §2.1 / ALS §7 | Evidencia |
|---|---|
| `Pedido.entregar()` recalcula `total` desde lo entregado | `src/modules/pedidos/domain/entities/Pedido.ts:181-184` — `nuevoTotal = items.reduce((s,i) => s.add(i.subtotalEntregado), 0)` |
| …y recorta `totalPagado` con `min()` | `Pedido.ts:192-196` — `nuevoTotalPagadoCents = Math.min(totalPagado.cents, nuevoTotal.cents)` |
| …y fuerza `ENTREGADO` | `Pedido.ts:200` — `estadoEntrega: EstadoEntregaVO.create('ENTREGADO')`. `puedeEntregar()` (`:103-105`) solo valida la transición, no exige entrega completa |
| `EntregarPedidoUseCase` crea hijo con `totalPagado = 0` | `src/modules/pedidos/application/use-cases/EntregarPedidoUseCase.ts:137-181` + `Pedido.ts:337-363` (`crearPedidoHijo` no setea `totalPagado`) |
| copia en el cierre de embarque | `src/modules/embarques/domain/services/procesar-pedido.service.ts:194-216` (`totalPagado: montoPagado` = solo pagos del cuadre) + `:461-463` (`saldo: totalHijo, totalPagado: 0`) |
| el precio histórico SÍ se hereda | `Pedido.ts:343` — `precio: i.precio.toDecimal()`. El snapshot histórico se preserva; el bug es solo el dinero |

## 2. Evidencia de `PAGOS_EXCEDIDOS` en el cierre

- Guard: `procesar-pedido.service.ts:225-227` — `if (montoPagadoTotal > totalReal * 1.01) throw 'PAGOS_EXCEDIDOS'`.
- El asistente de cierre precarga `cuadre.pagos` desde los pagos existentes del pedido: `src/app/(app)/embarques/[id]/cerrar/cerrar-client/index.tsx:131-133`.
- `calcularCaja()` mete los EFECTIVO en `efectivoEsperado`: `src/modules/embarques/domain/services/cierre-embarque.service.ts:152-164`.
- `coleccionarPagos()` suma **todos** los `Pago` del pedido, sin contexto de captura: `src/modules/embarques/application/use-cases/cerrar-embarque-caja.helper.ts`.

## 3. Evidencia de "`saldoFavor` no es reserva" (PLAN §2.3)

- **Acreditación:** `src/app/api/pedidos/pagar-fiado/route.ts:263-272` (sobrante FIFO, `isConsumidorFinalCanonical` excluido) · `src/modules/pedidos/application/use-cases/CrearPedidoUseCase.ts:241`.
- **Consumo:** `CrearPedidoUseCase.ts:199-202` — `getSaldoFavor` → `montoCredito = min(saldoFavor, total)` → `aplicarSaldoFavor`. **Cualquier pedido nuevo del cliente lo consume, greedy, sin earmark.**
- `plan-maestro-v11.1` §2: `Cliente.saldoFavor` canónico como **crédito general del cliente**.
- No existe `AplicacionPago` / `PaymentAllocation` / `montoReservado` en todo el repo (grep vacío). `Pago` (`schema.prisma:878-905`) no tiene campo de contexto de captura.

## 4. Evidencia de `ObligacionPendiente` / `Actividad` existentes pero sin wirear (PLAN §2.4)

| | Evidencia |
|---|---|
| Schema | `prisma/schema.prisma:1162` (`ObligacionPendiente`), `:1183` (`Actividad`), `:1206` (`PedidoCantidadAjuste`) |
| ADRs congelados | `docs/adr/ADR-OBLIGACION-001.md`, `docs/adr/ADR-ACTIVIDAD-001.md` (ambos "Aceptado (congelado)", 2026-08-16, "FASE 3") |
| Constraints | `chk_obligacion_no_sobreconsumo`, `chk_obligacion_cantidades_no_negativas`, partial unique index `Actividad_obligacion_embarque_activa_unique` |
| Use-case + lock | `src/modules/embarques/application/use-cases/AsignarActividadUseCase.ts` (lock `OBLIGACION:{id}`, idempotencia `offlineId`, métrica `obligacion_double_fulfillment_rejected_count`) |
| Servicio de dominio | `src/modules/embarques/domain/services/obligacion.service.ts` (`calcularDisponible`, `validarAsignacion`, `validarCumplimiento`) |
| Ruta | `POST /api/obligaciones/[id]/asignar` (RBAC ADMIN/ASISTENTE) |
| Tests | `src/lib/__tests__/integration/obligacion-concurrencia.test.ts` (34A/34B/34C) |
| **Brecha** | `obligacionPendiente.create` **solo aparece en tests** (`obligacion-concurrencia.test.ts:9`). Nada en producción crea una `ObligacionPendiente`. |
| `Actividad` NO tiene | `modo`, `createdById`, `createdAt`, campo de motivo |

## 5. Hallazgo adicional A — cómo el planificador materializa hoy (relevante para ALS §22 / PLAN §16)

El planificador **no toca `ObligacionPendiente`/`Actividad`**. Materializa así:

```
PlanDia → PlanGrupo → PlanParada → PlanActividad(pedidoIds: String[])
   │  ConfirmarPlanUseCase → MaterializarPlanUseCase
   ▼
crea Embarque + prisma.pedido.updateMany({
   where: { id: { in: pedidoIds }, embarqueId: null },
   data:  { embarqueId, estado: 'EN_RUTA', estadoEntrega: 'EN_RUTA' }
})  + PlanGrupo.embarqueId = embarque
```

Evidencia: `MaterializarPlanUseCase.ts:78-127`, `PrismaPlanificadorRepository.ts:374-375`.

**Consecuencia:** el planificador asigna el **Pedido completo** (todas las unidades) por `embarqueId` directo. No hay forma de que una parte de un pedido entre a un plan. Cuando se wiree `Actividad` (Nivel 2), `MaterializarPlanUseCase` es el punto donde `PlanActividad` debe producir/consumir `Actividad` en vez de `updateMany` sobre `Pedido`.

## 6. Hallazgo adicional B — colisión de nombres "actividad"

Hay **tres** cosas llamadas "actividad", sin relación entre sí:

| Nombre | Qué es | Dónde |
|---|---|---|
| `Actividad` | unidad de cumplimiento de `ObligacionPendiente` (ADR-ACTIVIDAD-001) | `schema.prisma:1183` |
| `PlanActividad` | línea de un plan de ruta (`pedidoIds[]`, ADR-PLANIFICADOR-002) | `schema.prisma:2456` |
| `derivarActividad(embarque)` | resumen de UI de contadores del ledger físico (Command Center) | `src/app/(app)/embarques/embarques-client/command-center/activity.ts` |

El ADR de Nivel 2 debe nombrar explícitamente cuál gobierna qué para evitar más confusión.

## 7. Hallazgo adicional C — recomendación concreta para el fix del cierre (PLAN §8 / ALS §20)

El PLAN describe el concepto ("dinero recibido" vs "cobrado en la misión") pero no propone mecanismo. Recomendación:

**`Pago.embarqueId` (nullable)** = el embarque donde se capturó el pago (`null` = mostrador / oficina / prepago).
- El cierre de E cuenta `Σ Pago WHERE embarqueId = E` como "cobrado en la misión".
- Sitios de captura a taggear: `venta-libre/route.ts`, `crear-ventas-libres.service.ts`, `procesar-pedido.service.ts` (pagos del cuadre), `EntregarPedidoUseCase` (pagos al entregar).
- Sitios que dejan `null`: `pagar-fiado`, `CrearPedidoUseCase`, `import/commit`.
- **Bonus:** resuelve también el follow-up ya documentado de `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` §0 ("conciliar por pago, no por pedido" — hoy `fetchPagosOrigenDiferido` + `coleccionarPagos` operan a granularidad de pedido vía `embarqueOrigenId`).

Alternativa sin schema: contar solo `Pago.createdAt` dentro de la ventana del embarque. Más frágil (pagos offline con `createdAt` desfasado).

## 8. Hallazgo adicional D — CRÍTICO PARA EL ALCANCE DE PR-1

**El PLAN v2 §6-7 y la ALS v2 §7 apuntan a `Pedido.entregar()` / `EntregarPedidoUseCase`, pero ahí NO está el bug que sufren los usuarios.**

`Pedido.entregar()` (`domain/entities/Pedido.ts:155`) solo se invoca con cantidades **completas** en producción:
- `pedidos-client/index.tsx:1395-1399` → `cantidad: i.cantPedido` (full).
- `ActualizarPedidoUseCase.ts:271-273` → `item.entregar(item.cantPedido)` (full).

Su rama parcial (`crearPedidoHijo` cuando `tieneFaltantes`) es **código muerto en producción**.

El bug **activo** de entrega parcial vive 100% en **`procesar-pedido.service.ts` — rama PARCIAL** (`execute()`, comentario `:119` "PARCIAL: idem ENTREGADO + crea pedido hijo"):
- **No usa el agregado de dominio.** Toma `PedidoRawInput` (shape Prisma cruda) y hace `tx.pedido.update` directo (`:194-216`) con `estadoEntrega: 'ENTREGADO'`, `total: totalReal` (recalculado a lo entregado), `totalPagado: montoPagado` (solo pagos del cuadre — descarta el prepago).
- Luego `crearPedidoHijo` (`:277`) con `totalPagado: 0`.
- Vive en `src/modules/embarques/domain/services/` pese a no ser dominio puro.

**Implicación de alcance:** arreglar solo `Pedido.entregar()` (el objetivo literal del PLAN v2) **no corrige nada de lo que está roto en vivo**. PR-1 tiene que tocar la rama PARCIAL de `procesarPedidoService`, y eso abre la pregunta *"¿qué representa las 4 pendientes después de que el embarque cierra?"*:

- **Opción interina (sin N2):** PARCIAL en el cierre → padre vuelve a `PENDIENTE`, `embarqueId = null`, `cantEntrega` preservado (6/10), `total`/`totalPagado` intactos, **sin hijo**. El padre queda re-planificable; al re-entregarlo, `procesarPedidoService` suma 6→10. Requiere que `cantEntrega` sea **acumulativo** en el cuadre (hoy se sobreescribe). Es más que "quitar el `min()`" pero NO es N2 (sin entidades nuevas).
- **Opción N2:** las 4 pendientes → `ObligacionPendiente` + nueva `Actividad`. Modelo completo.

Decisión de alcance de PR-1 **pendiente** (no inventar el requisito): ¿PR-1 = `Pedido.entregar()` + rama PARCIAL de `procesarPedidoService` con la opción interina? ¿o se separa la rama PARCIAL a un PR-1b?

## 9. Estado de `#171` (toggle "Entregar después")

`NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR` OFF → el toggle no renderiza, `entregado` siempre `undefined` → inerte. **No revertir, pero NO activar el flag hasta que PR-1 + PR-2 estén.** Documentado en `docs/adr/ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001.md` (§ follow-ups).
