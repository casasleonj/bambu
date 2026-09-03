# ADR-PAGO-EMBARQUE-CAPTURA-001 — `Pago.embarqueId` (contexto de captura del pago)

- Estado: **DECISIÓN PROPUESTA** — rev.3 tras 2º review del PO (2026-09-03), pendiente de re-aprobación. **NO es decisión vigente.** No tocar código hasta que el ADR esté Aceptado.
- Fecha: 2026-09-03 (rev.3)
- Fuente: `docs/pedidos/CUMPLIMIENTO_PARCIAL_{PLAN,ALS}_v2.md` §8/§20; `PR1_INTEGRIDAD_ENTREGA_PARCIAL_v3` §13/§18; `docs/pedidos/CUMPLIMIENTO_PARCIAL_AUDITORIA_TECNICA.md` §7; follow-up de `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` §0.
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
  borde documentados.

`Pago` hoy (`schema.prisma:878-905`): `id`, `pedidoId`, `metodo`, `monto`,
`offlineId` (índice), `createdAt`, `confirmacion`/`confirmadoPorId`/`confirmadoAt`.
**Sin contexto de captura.**

---

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

### 2. Concepto: contexto de captura

Cada `Pago` se crea con un **contexto de captura** que el caso de uso decide
explícitamente. NO es "poner `embarqueId` si viene, si no `null`".

```
                    contexto de CAPTURA del Pago
                               │
             ┌─────────────────┴─────────────────┐
             │                                   │
       FUERA DE MISIÓN                      EN MISIÓN
             │                                   │
       embarqueId = NULL                  embarqueId = E (obligatorio)
             │                                   │
  mostrador · oficina · prepago         repartidor · ruta · cobro
  cartera desde escritorio · histórico   físico durante la misión E
```

**`Pago.embarqueId` = el embarque en el que el pago fue físicamente capturado /
recibido por Agua Bambú** — el evento de captura.

**Reglas duras (review PO):**

> **R1.** `Pago.embarqueId` identifica el **contexto físico de captura**. Es
> **inmutable**. NUNCA se deriva de `Pedido.embarqueId`.
>
> **R2.** `null` significa **"el pago NO fue capturado dentro de un Embarque"**.
> NO significa *"no sabemos dónde se capturó"* — son cosas distintas. Un flujo
> que no sabe el contexto de captura de un pago de misión **debe fallar**, no
> escribir `null`.
>
> **R3.** El **método de pago** (efectivo / Nequi / transferencia / datáfono /
> cualquier método futuro) **NUNCA determina `embarqueId`** — solo el evento de
> captura. Ídem el concepto contable ("abono", "fiado", "prepago"): no
> clasifica; el evento de captura sí.

Consecuencias:

- **NO significa** "el embarque al que pertenece el pedido". Un pedido puede
  viajar en varios embarques (reasignación, entrega parcial re-planificada);
  sus pagos NO se re-atribuyen:
  ```
  Pago capturado en Embarque #70 → el Pedido pasa a Embarque #78
      → el Pago SIGUE con embarqueId = #70.
  ```
- `Pedido.embarqueId` = dónde está asignado AHORA el pedido.
  `Pago.embarqueId` = dónde se CAPTURÓ el dinero. **Nunca se confunden.**

### 3. Inmutabilidad

`Pago.embarqueId` es **inmutable una vez creado**. No se actualiza al reasignar
el pedido, ni al cerrar el embarque, ni por ningún flujo normal.

La única forma de cambiarlo es una **corrección auditada explícita** (fuera del
alcance de PR-2; vía `ADR-CORRECCION-MONETARIA-001` — `ReceivableEntry` —, nunca
un `UPDATE` silencioso).

### 4. Sitios de captura (quién lo setea y con qué contexto)

| Sitio | Contexto | `embarqueId` |
|---|---|---|
| `POST /api/pedidos/venta-libre` (venta en ruta) | EN_MISIÓN | el embarque del contexto de la venta |
| `CrearVentasLibresService` (venta libre creada en el cierre) | EN_MISIÓN | el embarque que se cierra |
| `procesar-pedido.service.ts` — pagos del `cuadre` | EN_MISIÓN | el embarque que se **está cerrando** |
| `EntregarPedidoUseCase` — `input.pagos` (cobro al entregar) | EN_MISIÓN | **`embarqueId` del payload, OBLIGATORIO cuando `pagos` no está vacío** (ver §4.1). PR-2 agrega `embarqueId` a `EntregaSchema`/`EntregarPedidoInput` + la app del repartidor lo envía. **Prohibido derivarlo de `Pedido.embarqueId`.** |
| `pagar-fiado` / `abonos` **desde escritorio** | FUERA_DE_MISIÓN | `null` |
| `pagar-fiado` **desde la ruta** (el repartidor cobra una deuda vieja en la puerta) | EN_MISIÓN | el embarque actual de esa ruta — **frontera explícita** (ver §4.2) |
| `CrearPedidoUseCase` (prepago al crear) | FUERA_DE_MISIÓN | `null` |
| `import/commit` (histórico) | FUERA_DE_MISIÓN | `null` |

**Invariante de implementación:** en ningún sitio de captura la expresión que
produce `Pago.embarqueId` puede leer `pedido.embarqueId`. El valor viene de:
(a) el contexto del cierre, (b) el contexto de la venta libre, o (c) el payload
explícito de la entrega. Nunca del estado de asignación del pedido.

#### 4.1 `EntregarPedidoUseCase` — rechazo, nunca `null` silencioso

| `input.pagos` | `embarqueId` en payload | Acción |
|---|---|---|
| vacío | — | irrelevante (no se crea `Pago`) |
| con montos > 0 | presente y válido (§4.3) | crear `Pago` con ese `embarqueId` |
| con montos > 0 | **ausente** | **`400` — `PAGO_MISION_SIN_EMBARQUE`** |
| con montos > 0 | presente pero inválido (§4.3) | **`400`/`403` según el caso** |

Un pago cobrado durante una entrega **debe** declarar en qué misión. `null` no
es un fallback aceptable acá (produce una diferencia de caja invisible que
aparece días después).

#### 4.2 `pagar-fiado` / `abonos` — clasificación por evento, no por concepto

Hoy `pagar-fiado`/`abonos` solo se disparan desde escritorio → `null` es
correcto. **Frontera explícita:** si en el futuro el repartidor puede cobrar una
deuda en la ruta, ese flujo captura `embarqueId = <embarque de la ruta>`. La
clasificación depende de **dónde se recibió el dinero**, no de que el hecho
contable se llame "abono" o "fiado". (No hay cambio en PR-2 — se documenta la
regla para cuando aparezca la feature.)

#### 4.3 Validación server-side del `embarqueId` recibido

El `embarqueId` del payload **no se acepta a ciegas**. El servidor valida:

1. **Existe** — es un `Embarque` real.
2. **Autorización** — si el actor es `REPARTIDOR`, el embarque debe ser suyo
   (`embarque.trabajadorId` = el trabajador del usuario). Mismo guard que
   `venta-libre` (`EMBARQUE_NO_PERTENECE` → `403`).
3. **Coherencia** — el pedido de ese `Pago` está (o estuvo) asignado a ese
   embarque, o es una venta libre de ese embarque. Un pago de misión para un
   pedido que nunca tocó ese embarque es sospechoso → `400`.
4. **Estado** — NO se valida que el embarque esté `EN_RUTA`/`ABIERTO`: un sync
   offline tardío puede llegar cuando el embarque ya está `CERRADO`. En ese caso
   el `Pago` se crea con su `embarqueId` real (la verdad del evento) y aparece
   como **discrepancia post-cierre**, que el flujo de conciliación /
   `porConfirmar` ya maneja. Nunca se descarta dinero real ni se le cambia el
   `embarqueId` para "encajarlo".

App single-tenant (una sola empresa): no hay check de "negocio" —
`Negocio`/sucursal es del cliente, no del tenant. La protección relevante es
(2) autorización del repartidor + (3) coherencia pedido↔embarque.

### 5. Uso en el cierre (PR-2)

El cierre del embarque `E` cuenta como **"cobrado en la misión"**:

```
Σ Pago WHERE embarqueId = E
```

- `coleccionarPagos()` deja de leer `pedidosRaw[].pagos` / `ventasLibres[].pagos`
  y pasa a `client.pago.findMany({ where: { embarqueId: E } })` (lectura viva).
- El guard `PAGOS_EXCEDIDOS` compara contra el cobro de la misión, **no** contra
  el total histórico del pedido.
- **Se retira** `embarqueOrigenId` de la conciliación de caja
  (`fetchPagosOrigenDiferido` + el `continue` de `coleccionarPagos`).
  `embarqueOrigenId` queda solo como metadato histórico del pedido — **no
  participa en ningún cálculo monetario**. **Una sola fuente de verdad.**
- **Condición:** la lógica vieja NO se elimina hasta que **toda** la matriz E2E
  (§Tests) esté verde. PR-2 puede aterrizar el campo + los sitios de captura y
  remover la lógica vieja **en el mismo PR** solo con la matriz demostrada.

### 6. Prepago prellenado en el asistente de cierre

`cerrar-client/index.tsx` deja de prellenar `cuadre.pagos` con los `Pago`
existentes del pedido. El asistente solo captura los pagos **nuevos** recibidos
en esta misión. Los pagos previos (prepago, `embarqueId=null` o de otro
embarque) no entran al cuadre ni a `efectivoEsperado`.

### 7. PR-2 supersede el guard provisional de PR-1

PR-1 agregó en `procesar-pedido.service.ts` un guard `entregaPrevia` (si el
pedido ya tuvo una entrega parcial → no crear `Pago` / no tocar `totalPagado`
en el re-cierre). Era una **defensa provisional** contra el prellenado de
`cuadre.pagos`.

**PR-2 retira ese prellenado (§6), por lo que PR-2 debe también retirar el guard
`entregaPrevia`.** Con `Pago.embarqueId` y sin prellenado, `cuadre.pagos` = solo
dinero nuevo de la misión → siempre seguro crear `Pago` con `embarqueId = E`.
Dejar el guard después de PR-2 sería código muerto o, peor, una regla que
alguien podría creer necesaria.

---

## Migración

1. `ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "embarqueId" TEXT;` + FK
   `ON DELETE SET NULL` + `CREATE INDEX IF NOT EXISTS`.
2. `GRANT` para el usuario de runtime (`app_write` / `postgres`).
3. **Backfill: ninguno.** Todos los `Pago` históricos quedan `embarqueId = null`.
   Los cierres pasados ya están `CERRADO` y conciliados; re-atribuir no cambia
   nada cerrado y arriesga inconsistencias.
4. Aditiva y reversible (`DROP COLUMN`).

### `onDelete: SetNull` — condición de trazabilidad

`SetNull` es aceptable para embarques **`ABIERTO`/`EN_RUTA`** (nunca conciliados
→ borrar no destruye historia).

**Prohibido** borrar físicamente un `Embarque` `CERRADO` con dinero conciliado:
haría `Pago.embarqueId = null` y se perdería la trazabilidad de una caja ya
cerrada. Esta regla **ya vive en `ADR-CIERRE-001`** (un cierre no se revierte
destructivamente; se usa cancelación/retención) — este ADR solo la **referencia**,
no crea una regla paralela. PR-2 verifica que `DELETE /api/embarques/[id]`
rechace embarques `CERRADO`.

---

## Concurrencia / idempotencia

Sin locks nuevos. `Pago.embarqueId` se setea en el mismo `create` del `Pago`,
dentro de la transacción que ya lo crea (cierre bajo `CIERRE:{embarqueId}`,
venta-libre bajo `SECUENCIA:pedido`, entrega bajo `PEDIDO:{id}`). El dedup por
`offlineId` del `Pago` no cambia.

---

## Alcance

- **Dentro (PR-2):** schema + migración + GRANT · `embarqueId` obligatorio-si-pagos
  en `EntregaSchema`/`EntregarPedidoInput` + la app del repartidor · validación
  server-side (§4.3) · los sitios de captura (§4) · `coleccionarPagos` /
  `calcularCaja` / guard `PAGOS_EXCEDIDOS` · quitar el prellenado de `cuadre.pagos` ·
  retirar `entregaPrevia` de PR-1 (§7) · retirar `embarqueOrigenId` de la
  conciliación (con la matriz E2E verde) · verificar que `DELETE` de embarque
  `CERRADO` se rechace.
- **Fuera:** PUNTO→DOMICILIO, diferencial, fiscal, wiring `Obligación`/`Actividad`
  (N2/N3). `pagar-fiado` en ruta (solo se documenta la regla). El mecanismo de
  corrección auditada de `embarqueId` (solo si aparece un caso real).

---

## Rollback

Revertir PR-2 + `DROP COLUMN "Pago"."embarqueId"`. El cierre vuelve a
`coleccionarPagos` sobre `pedidosRaw`. Sin backfill → no hay datos que migrar
de vuelta.

---

## Tests obligatorios (PR-2) — matriz de captura

La lógica vieja (`fetchPagosOrigenDiferido` + `continue` + guard `entregaPrevia`)
**no se retira** hasta que **toda** esta matriz esté verde:

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Prepago $100k (mostrador) → Embarque entrega 60% | `Pago.embarqueId = null`; cobro de misión del cierre = **$0**; sin `PAGOS_EXCEDIDOS`; pago histórico intacto |
| 2 | Fiado $100k → repartidor cobra $100k en la entrega (payload con `embarqueId`) | `Pago.embarqueId = E`; caja de `E` += $100k |
| 3 | Prepago → pedido reasignado a otro embarque | el `Pago` conserva `embarqueId = null` |
| 4 | Pago capturado en E70 → el pedido pasa a E78 | el `Pago` sigue con `embarqueId = E70`; **el pedido reasignado ≠ los pagos reasignados** |
| **5** | **Prueba definitiva:** Pedido #100 ($100k). Pago #1 $60k capturado en E70. El pedido pasa a E78. Pago #2 $40k capturado en E78. | Pedido: `total 100k / totalPagado 100k / saldo 0`. Cierre E70: cobrado = **$60k**. Cierre E78: cobrado = **$40k**. Demuestra obligación ≠ ejecución ≠ captura. |
| 6 | Entrega con pago, offline + reintento (mismo `offlineId`) | no se duplica el `Pago` ni el cobro |
| 7 | Cierre repetido del mismo embarque (replay) | no se duplica el cobro de misión |
| 8 | Venta en ruta + entrega posterior | el dinero pertenece al embarque de **captura**; reemplaza los tests de `cierre-venta-ruta-entrega-posterior.test.ts` |
| 9 | Regresión: cierre normal (fresco, cobro en la entrega, un embarque) | caja idéntica a hoy |
| **10** | Entrega con `pagos: [{monto: 100000}]` **sin** `embarqueId` en el payload | **`400` `PAGO_MISION_SIN_EMBARQUE`** — nunca `null` silencioso |
| **11** | Repartidor A envía un pago con `embarqueId` de un embarque de repartidor B | **`403`** (`EMBARQUE_NO_PERTENECE`) |
| **12** | Sync offline tardío de un pago cuyo `embarqueId` ya está `CERRADO` | el `Pago` se crea con su `embarqueId` real; aparece como discrepancia post-cierre (no se descarta, no se re-etiqueta) |

---

## Correcciones tras review del PO

**rev.2 (2026-09-03):**
1. Semántica de captura en `EntregarPedidoUseCase`: `embarqueId` del payload, prohibido derivar de `Pedido.embarqueId`.
2. `null` reformulado: no es tipo de pago.
3. `embarqueOrigenId` fuera de todo cálculo monetario; matriz E2E como gate.
4. Clasificación → "DECISIÓN PROPUESTA".

**rev.3 (2026-09-03, 2º review):**
5. **Pago de misión sin `embarqueId` → `400`, nunca `null` silencioso** (§4.1). `null` = "fuera de misión", no "desconocido".
6. Concepto explícito de **contexto de captura** (`EN_MISIÓN` / `FUERA_DE_MISIÓN`); cada caso de uso lo declara, no es `?? null` (§2).
7. **Validación server-side del `embarqueId`** recibido: existe · autorización del repartidor · coherencia pedido↔embarque · no valida estado (sync tardío) (§4.3).
8. `pagar-fiado`/`abono` **en ruta** como frontera explícita — clasifica el evento de captura, no el concepto contable (§4.2).
9. PR-2 **retira** el guard `entregaPrevia` de PR-1 (§7).
10. `onDelete: SetNull` documentado + condición: no borrar embarque `CERRADO` con dinero conciliado (referencia a `ADR-CIERRE-001`, sin regla paralela).
11. Matriz E2E ampliada: casos 5 (prueba definitiva multi-embarque), 10 (rechazo sin `embarqueId`), 11 (autorización), 12 (sync tardío a `CERRADO`).

---

## Consecuencias

- El follow-up de `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` §0 queda **cerrado**.
- `Embarque` gana una relación `pagos Pago[]`.
- Reportes de "dinero cobrado en ruta por día" ganan la dimensión
  (`Pago.embarqueId` + `Embarque.fecha`).
- La app del repartidor debe enviar `embarqueId` en la entrega cuando hay cobro
  — cambio de contrato del endpoint `/api/pedidos/[id]/entrega` (PR-2).
