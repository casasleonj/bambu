# ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001 — Venta en ruta / rápida con entrega posterior

- Estado: **Propuesto** (borrador — pendiente de aprobación del PO / Gate 2)
- Fecha: 2026-08-31
- Fuente: ALS Operación Comercial §11–§12, §24, §35; Plan Técnico §21–§22, §35; INVENTARIO §F4, §F5, §G8
- Fase de implementación: FASE 2 (Pedidos). Bloquea el cambio de comportamiento de `venta-libre` / `venta-rapida`.
- Decisión de producto tomada (PO, 2026-08-31): **sí**, tanto Venta Rápida como Venta Libre pueden originar una operación cuya entrega ocurre después, con el pago ya cobrado.

## Contexto

Hoy dos caminos fuerzan `estadoEntrega = ENTREGADO` en la creación:

- `POST /api/pedidos/venta-libre` (`src/app/api/pedidos/venta-libre/route.ts:209-212`)
- `CrearVentasLibresService` (`crear-ventas-libres.service.ts:77-79`)
- y `CrearPedidoUseCase`: `origen = VENTA_RAPIDA` ⇒ `estadoEntrega = ENTREGADO`, `cantEntrega = cantPedido`.

Esto contradice casos reales:

- **Venta en ruta, entrega posterior** (ALS §12): "Carlos paga hoy pero recibe mañana". El repartidor no lleva stock suficiente, o el cliente pide que le lleven el resto en la próxima vuelta.
- **Compra en punto con envío** (spec histórica, "Escenario B"): el cliente paga en el mostrador y pide envío a domicilio → el pedido debe quedar `PENDIENTE` para planificar/embarcar.

Además, cuando un pedido `origen = VENTA_LIBRE` se reasigna (cae en `NO_ENTREGADO` y se le quita `embarqueId`), **se pierde el contexto de en qué embarque se originó** — no hay campo persistente que lo conserve (`embarqueId` es mutable y se limpia en la reasignación).

## Decisión

### 1. La entrega de una venta en ruta / rápida es una dimensión, no un default del formulario

`venta-libre` y `venta-rapida` dejan de hard-codear `ENTREGADO`. Aceptan explícitamente el resultado de entrega:

```
entregado: boolean   (venta-libre: toggle "Entregar ahora" / "Entregar después", ALS §24)
```

- `entregado = true` → `estadoEntrega = ENTREGADO`, ítems `cantEntrega = cantPedido` (comportamiento actual).
- `entregado = false` → `estadoEntrega = PENDIENTE`, ítems `cantEntrega = 0`. El pedido entra al flujo normal (planificador / embarque / entrega) como cualquier `origen = PEDIDO`.

**No se crea un tercer estado de entrega** (guardrail INVENTARIO §8.6). **No se crea `VentaEnRuta`** (guardrail §8.5): se reutiliza `OrigenPedido.VENTA_LIBRE` / `VENTA_RAPIDA` + el estado de entrega existente.

### 2. `estadoPago` independiente — y `ANTICIPADO` por fin tiene escritor

Una venta pagada de contado con entrega posterior queda:

```
estadoEntrega = PENDIENTE
estadoPago    = ANTICIPADO   (totalPagado >= total AND estadoEntrega != ENTREGADO)
```

Regla en `EstadoPagoVO.fromTotals` (o su caller): si `totalPagado >= total`:
- `estadoEntrega === ENTREGADO` → `PAGADO`
- si no → `ANTICIPADO`

Al entregar (`EntregarPedidoUseCase`), `ANTICIPADO → PAGADO` (transición ya permitida por `TRANSICIONES_PAGO`).

> Esto resuelve la sub-pregunta de G7 "¿quién escribe `ANTICIPADO`?". La pregunta
> mayor de G7 (¿`estadoPago` es canónico o proyección?) se decide en
> `ADR-PEDIDO-ESTADO-CANONICO-001` (G5).

### 3. `Pedido.embarqueOrigenId` — contexto de origen persistente

```prisma
model Pedido {
  // ...
  /// Embarque en el que se ORIGINÓ la operación (venta en ruta). Inmutable una
  /// vez seteado — NUNCA se limpia al reasignar el pedido (a diferencia de
  /// `embarqueId`, que es la asignación física actual). Null para pedidos que
  /// no nacieron dentro de un embarque.
  embarqueOrigenId String?
  embarqueOrigen   Embarque? @relation("PedidoEmbarqueOrigen", fields: [embarqueOrigenId], references: [id], onDelete: SetNull)

  @@index([embarqueOrigenId])
}
```

- Se setea en `venta-libre/route.ts` y `CrearVentasLibresService` = el `embarqueId` del contexto.
- `ProcesarPedidoService.procesarNoEntregado` y `CancelarEmbarqueUseCase` limpian `embarqueId` pero **NO** `embarqueOrigenId`.
- Consultas de "operaciones originadas en el embarque X" usan `embarqueOrigenId`, no `embarqueId`.

### 4. Fiado en venta en ruta (ALS §14)

Sin cambios de fondo: el guard de fiado ya se aplica "después de conocer el pago"
(`totalPagado < total`, regresión de `main`). Una venta en ruta fiada
(`pagos = []`) crea la obligación normal (saldo > 0, aparece en `pagar-fiado`);
`origen = VENTA_LIBRE` + `embarqueOrigenId` conservan la trazabilidad. **No** se
crea una entidad "fiado de ruta" (guardrail).

## Alcance

- **Dentro:** `venta-libre` (endpoint + cliente repartidor), `venta-rapida`
  (`CrearPedidoUseCase` + `pedido-form-unified` / `venta-rapida-form`),
  `CrearVentasLibresService` (cierre), `EntregarPedidoUseCase` (`ANTICIPADO → PAGADO`),
  `EstadoPagoVO.fromTotals`, schema (`embarqueOrigenId`).
- **Fuera:** rediseño de la UI de captura (Fase 3); `estadoPago` canónico vs
  proyección (G5); corrección de pagos (G2). El repartidor eligiendo "entregar
  parcial ahora, resto después" en la misma captura → usa el flujo de entrega
  parcial existente (pedido-hijo), no es nuevo.

## Migración

1. `ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "embarqueOrigenId" TEXT;` + FK
   `SET NULL` + índice. Aditiva, reversible.
2. **Backfill idempotente** (ADR-MIGRACION-001 — no inventar):
   - `UPDATE "Pedido" SET "embarqueOrigenId" = "embarqueId" WHERE "origen" = 'VENTA_LIBRE' AND "embarqueId" IS NOT NULL AND "embarqueOrigenId" IS NULL;`
   - Los `VENTA_LIBRE` históricos con `embarqueId` nulo (reasignados) quedan
     `embarqueOrigenId` **null** — no se reconstruye, no hay dato fiable.
3. Sin `SET NOT NULL` global.

## Concurrencia / idempotencia

Sin cambios: `venta-libre` mantiene lock `SECUENCIA:pedido` + dedup por
`Pedido.offlineId @unique`. `venta-rapida` va por `CrearPedidoUseCase`
(`SECUENCIA:pedido` + `offlineId`). El toggle `entregado` es parte del payload
idempotente (mismo `offlineId` + mismo payload → mismo resultado; distinto
`entregado` con el mismo `offlineId` → 409, contrato §24).

## Rollback

`git revert` del código + `DROP COLUMN "embarqueOrigenId"`. Feature flag
`NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR` (default OFF) durante el rollout:
con OFF, `venta-libre`/`venta-rapida` fuerzan `ENTREGADO` como hoy.

## Tests obligatorios

- `PED-OC-01` Venta Libre + entrega posterior (pago completo → `PENDIENTE` + `ANTICIPADO`).
- `PED-OC-02` Venta Rápida + entrega posterior.
- `PED-OC-03` Pago completo + entrega pendiente → `ANTICIPADO`; luego entrega → `PAGADO`.
- `OC-05` venta ruta posterior; `OC-06` pago antes de entrega.
- Reasignación (`NO_ENTREGADO`) de una venta libre: `embarqueId` se limpia,
  `embarqueOrigenId` se conserva.
- Regresión: con el flag OFF, `venta-libre`/`venta-rapida` siguen dando `ENTREGADO`.
- Idempotencia: replay con distinto `entregado` → 409.

## Consecuencias

- `estadoPago = ANTICIPADO` empieza a aparecer en cartera / badges (ya tiene
  `getBadgePago` mapeado, "Anticipado" indigo).
- `/api/cierre` y reportes: una venta en ruta con entrega posterior cuenta como
  venta (dinero cobrado) pero NO como unidad entregada ese día — revisar
  `aguaVendida`/`hieloVendido` del `CierreDia` (usan `cXEnt`, que será 0 → correcto).
- El planificador ya incluye `origen ∈ {PEDIDO, RECURRENTE, VENTA_RAPIDA}` como
  elegible (`elegibilidad.service.ts`); habría que sumar `VENTA_LIBRE` con
  `estadoEntrega = PENDIENTE` a esa lista.
