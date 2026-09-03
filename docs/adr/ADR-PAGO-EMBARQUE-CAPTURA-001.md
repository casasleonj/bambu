# ADR-PAGO-EMBARQUE-CAPTURA-001 — `Pago.embarqueId` (contexto de captura del pago)

- Estado: **PROPUESTO** — pendiente de aprobación del PO
- Fecha: 2026-09-03
- Fuente: `docs/pedidos/CUMPLIMIENTO_PARCIAL_{PLAN,ALS}_v2.md` §8/§20; `PR1_INTEGRIDAD_ENTREGA_PARCIAL_v3` §13/§18; `docs/pedidos/CUMPLIMIENTO_PARCIAL_AUDITORIA_TECNICA.md` §7 (hallazgo C); follow-up de `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` §0.
- Fase de implementación: PR-2 (cierre monetario). Bloquea la implementación del campo.
- Cruza: `ADR-CUSTODIA-001`, `ADR-CIERRE-001`, `ADR-MONETARIO-001`, `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001`, `ADR-PAGO-REPORTADO-CONFIRMADO-001`.

## Contexto

El cierre de un embarque hoy **no distingue** dos conceptos:

```
DINERO RECIBIDO          ¿cuánto recibió Agua Bambú por este pedido, en total?
      ≠
DINERO COBRADO EN LA MISIÓN   ¿cuánto se recibió DURANTE este embarque?
```

`coleccionarPagos()` (`cerrar-embarque-caja.helper.ts`) suma **todos** los
`Pago` de un pedido, sin importar dónde/cuándo se capturaron; `calcularCaja()`
(`cierre-embarque.service.ts:152-164`) mete los EFECTIVO en `efectivoEsperado`.

Consecuencias medidas:
- **`PAGOS_EXCEDIDOS` / prepago prellenado**: un pedido pagado en efectivo en el
  mostrador y luego entregado en ruta hace que el repartidor "deba" ese
  efectivo que nunca tocó; el operador baja el pago a mano → destruye
  información financiera (`PR1 v3` §8).
- **Venta en ruta con entrega posterior** (`ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001`
  §0): la conciliación quedó a granularidad de **pedido** (`embarqueOrigenId` +
  `fetchPagosOrigenDiferido` + el `continue` de `coleccionarPagos`), con casos
  borde documentados (saldo cobrado en un embarque distinto al de la venta; el
  embarque de origen que nunca se cierra).

`Pago` hoy (`schema.prisma:878-905`): `id`, `pedidoId`, `metodo`, `monto`,
`offlineId` (índice), `createdAt`, `confirmacion`/`confirmadoPorId`/`confirmadoAt`.
**Sin contexto de captura.**

## Decisión

### 1. Campo

```prisma
model Pago {
  // ...
  embarqueId String?
  embarque   Embarque? @relation("PagoEmbarque", fields: [embarqueId], references: [id], onDelete: SetNull)

  @@index([embarqueId])
}
```

### 2. Semántica congelada

`Pago.embarqueId` = **el embarque en el que el pago fue física­mente capturado /
recibido por Agua Bambú** (el repartidor recibió el efectivo, o el asistente
registró el reporte digital, durante esa misión).

**NO significa** "el embarque al que pertenece el pedido de este pago". Un
pedido puede viajar en varios embarques (reasignación, entrega parcial
re-planificada); sus pagos NO se re-atribuyen.

- `embarqueId = null` ⇔ el pago **no** se capturó en una misión logística:
  - prepago / pago en el mostrador / oficina;
  - `pagar-fiado` (cartera, escritorio);
  - `abonos` (cartera);
  - importación histórica.
- `embarqueId = E` ⇔ el pago se recibió durante el embarque `E`.

### 3. Inmutabilidad

`Pago.embarqueId` es **inmutable una vez creado**. No se actualiza al reasignar
el pedido, ni al cerrar el embarque, ni por ningún flujo normal.

La única forma de cambiarlo es una **corrección auditada explícita** (fuera del
alcance de PR-2; si se necesita, se hace vía el mecanismo de
`ADR-CORRECCION-MONETARIA-001` — `ReceivableEntry`/`CorreccionAbono` —, nunca
un `UPDATE` silencioso). Esto previene que dentro de seis meses alguien
reutilice el campo para otra cosa.

### 4. Sitios de captura (quién lo setea)

| Sitio | `embarqueId` |
|---|---|
| `POST /api/pedidos/venta-libre` (venta en ruta) | el embarque del contexto |
| `CrearVentasLibresService` (venta libre creada en el cierre) | el embarque que se cierra |
| `procesar-pedido.service.ts` — pagos del `cuadre` (cobro en la entrega) | el embarque que se cierra |
| `EntregarPedidoUseCase` — `input.pagos` (cobro al entregar) | el `embarqueId` actual del pedido (si tiene) |
| `CrearPedidoUseCase` (prepago al crear) | `null` |
| `pagar-fiado`, `abonos` (cartera) | `null` |
| `import/commit` (histórico) | `null` |

### 5. Uso en el cierre (PR-2)

El cierre del embarque `E` cuenta como **"cobrado en la misión"**:

```
Σ Pago WHERE embarqueId = E   (creados / a crear durante este cierre)
```

- `coleccionarPagos()` deja de leer `pedidosRaw[].pagos` y `ventasLibres[].pagos`
  y pasa a `client.pago.findMany({ where: { embarqueId: E } })` (una lectura
  viva, sin snapshot stale).
- El guard `PAGOS_EXCEDIDOS` compara contra el cobro de la misión, **no** contra
  el total histórico del pedido.
- **Se retira** la lógica de `embarqueOrigenId` para conciliación de caja
  (`fetchPagosOrigenDiferido` + el `continue` de `coleccionarPagos`):
  `embarqueOrigenId` se conserva como contexto histórico del pedido, pero la
  caja se concilia por `Pago.embarqueId`, no por pedido.
  (`ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` §0 se actualiza: la regla "la custodia
  sigue al evento de cobro" ahora se implementa a nivel de `Pago`.)

### 6. Prepago prellenado en el asistente de cierre

`cerrar-client/index.tsx` deja de prellenar `cuadre.pagos` con los `Pago`
existentes del pedido. El asistente solo captura los pagos **nuevos** recibidos
en esta misión. Los pagos previos (prepago, `embarqueId=null` o de otro
embarque) no entran al cuadre ni a `efectivoEsperado`.

## Migración

1. `ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "embarqueId" TEXT;` + FK
   `ON DELETE SET NULL` + `CREATE INDEX IF NOT EXISTS`.
2. `GRANT` para el usuario de runtime (`app_write` en Docker, `postgres` en
   Supabase) — migración de permisos como las de 1FN.
3. **Backfill: ninguno.** Todos los `Pago` históricos quedan `embarqueId = null`.
   Justificación: los cierres de embarque pasados ya están `CERRADO` y su caja
   ya se concilió con la lógica vieja; re-atribuir pagos históricos no cambia
   nada cerrado y arriesga inconsistencias. Los cierres nuevos usan la lógica
   nueva desde el día 1.
4. Aditiva y reversible: `DROP COLUMN` restaura el estado anterior; el código
   de PR-2 detrás del mismo cambio.

## Concurrencia / idempotencia

Sin locks nuevos. `Pago.embarqueId` se setea en el mismo `create` del `Pago`,
dentro de la transacción que ya lo crea (cierre bajo `CIERRE:{embarqueId}`,
venta-libre bajo `SECUENCIA:pedido`, entrega bajo `PEDIDO:{id}`). El dedup por
`offlineId` del `Pago` no cambia.

## Alcance

- **Dentro (PR-2):** el campo + los 4 sitios de captura + `coleccionarPagos` /
  `calcularCaja` / guard `PAGOS_EXCEDIDOS` / quitar el prellenado del asistente
  + retirar la conciliación por `embarqueOrigenId`.
- **Fuera:** PUNTO→DOMICILIO, diferencial, fiscal, wiring `Obligación`/`Actividad`
  (N2/N3). El mecanismo de corrección auditada de `embarqueId` (solo si aparece
  un caso real).

## Rollback

Revertir el PR-2 + `DROP COLUMN "Pago"."embarqueId"`. El cierre vuelve a
`coleccionarPagos` sobre `pedidosRaw`. Como no hubo backfill, no hay datos que
migrar de vuelta.

## Tests obligatorios (PR-2)

- Prepago total antes del embarque → cierre → `cobro de misión = 0`, el cierre
  no exige tocar el pago histórico, no hay `PAGOS_EXCEDIDOS`.
- Fiado cobrado en la entrega → `Pago.embarqueId = E`, cuenta en la caja de `E`.
- Venta en ruta con entrega posterior: el `Pago` se concilia en el embarque
  donde se cobró, aunque el pedido se entregue en otro (reemplaza los tests de
  `cierre-venta-ruta-entrega-posterior.test.ts` que hoy validan la lógica por
  `embarqueOrigenId`).
- Reasignación de un pedido con prepago: el `Pago` mantiene su `embarqueId`.
- Regresión: cierre normal (fresco, cobro en la entrega) → caja idéntica a hoy.

## Consecuencias

- El follow-up de `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` §0 ("conciliar por
  pago, no por pedido") queda **cerrado**.
- `Embarque` gana una relación `pagos Pago[]`.
- Reportes que quieran "dinero cobrado en ruta por día" ahora tienen la
  dimensión (`Pago.embarqueId` + `Embarque.fecha`).
