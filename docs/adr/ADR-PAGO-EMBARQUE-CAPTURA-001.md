# ADR-PAGO-EMBARQUE-CAPTURA-001 — `Pago.embarqueId` (contexto de captura del pago)

- Estado: **ACEPTADO** — aprobado para implementación por el PO (2026-09-03, "Adelante con PR-2"), tras 5 rondas de review del PO + revisión adversarial final (rev.6 cierra F6/F7/F9 sin cambiar la dirección). PR-2 se implementa con la disciplina "corregir en el camino sin perder trazabilidad".
- Fecha: 2026-09-03 (rev.6 — ACEPTADO)
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

**Invariante de implementación:** en ningún sitio de captura del flujo del
**repartidor** la expresión que produce `Pago.embarqueId` puede leer
`pedido.embarqueId`. El valor viene de: (a) el contexto del cierre, (b) el
contexto de la venta libre, o (c) el payload explícito de la entrega.

**Excepción (rev.6 — F1):** un actor `ADMIN`/`ASISTENTE` que registre una
entrega **con cobro** en nombre de un repartidor (flujo de escritorio) **sí**
puede pasar el `embarqueId` actual del pedido — el operador está atribuyendo el
cobro a la misión donde está el repartidor. Queda auditado. Hoy es hipotético:
el flujo de escritorio (`/pedidos` "marcar entregado") envía `pagos: []`, así
que no crea `Pago`. Se documenta para cuando gane captura de pago.

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

El `embarqueId` del payload **no se acepta a ciegas**. El servidor valida
**exactamente dos** condiciones (ambas verificables):

1. **Existe** — es un `Embarque` real.
2. **Autorización** (identidad + rol + trabajador asignado + permisos
   administrativos — **no** tenant isolation):
   - Actor `REPARTIDOR`: el embarque debe ser suyo
     (`embarque.trabajadorId` = el trabajador del usuario). Mismo guard que
     `venta-libre` (`EMBARQUE_NO_PERTENECE` → `403`). Que el repartidor tenga
     autoridad sobre `E` **es** la garantía de que él estuvo ahí capturando el
     dinero — no hace falta reconstruir la trayectoria logística del pedido.
   - Actor `ADMIN` / `ASISTENTE`: puede atribuir el pago a cualquier embarque
     válido (carga/corrección de datos administrativa). **Auditado**
     (`logAudit` del pago con `embarqueId` + `usuarioId`).

**No se valida (A3):** "el pedido está o estuvo asignado a ese embarque". El
"estuvo" **no es verificable** — no existe un historial de asignación
pedido↔embarque y **no se va a inventar uno para este ADR**. La autorización
(punto 2) reemplaza a esa regla. Opcionalmente PR-2 emite una métrica cuando
`pedido.embarqueId` actual ≠ `Pago.embarqueId`, pero nunca rechaza.

3. **Estado — NO se valida (A2)** — que el embarque esté `EN_RUTA`/`ABIERTO`.
   El `Pago` puede llegar cuando el embarque ya está `CERRADO`, por dos vías:
   - **sync offline tardío**: el pago ocurrió durante la misión, el dispositivo
     sincronizó después del cierre;
   - **carrera online**: la entrega (lock `PEDIDO:{id}`) y el cierre (lock
     `CIERRE:{embarqueId}`) **no comparten lock**; el cierre puede leer
     `Σ Pago WHERE embarqueId = E` antes de que la entrega commitee su `Pago`.
   En **ambos** casos el `Pago` se crea con su `embarqueId` **real** (la verdad
   del evento de captura) y el faltante aparece como **discrepancia post-cierre**
   que el flujo de conciliación / `porConfirmar` maneja. **Nunca** se descarta
   dinero real, ni se le cambia el `embarqueId` para "encajarlo" en el estado
   actual, ni se bloquea la entrega. La carrera online tiene la misma naturaleza
   y la misma resolución que el sync tardío (caso E2E 12/13).

### 5. Uso en el cierre (PR-2)

El cierre del embarque `E` cuenta como **"cobrado en la misión"** el
**efecto monetario neto** de los pagos capturados en `E`:

```
cobrado_en_misión(E)
  = Σ (pagos capturados en E)  −  Σ (reversiones netas de esos pagos)
```

#### A1 — regla de efecto monetario neto (BRECHA BLOQUEANTE)

`AnularPedidoUseCase` / `CancelarPedidoUseCase` ponen `Pedido.totalPagado = 0` +
emiten `ReceivableEntry REVERSION`, pero **NO borran las filas `Pago`**. Un
`Pago` de $60k capturado en E70 sobre un pedido luego anulado (dinero devuelto)
**no debe aumentar el `efectivoEsperado`** del cierre de E70 — sería un falso
faltante contra el repartidor.

**Regla congelada (concepto, no mecanismo):**

> El cierre de `E` cuenta el **efecto neto de caja** de los pagos capturados en
> `E`. Un pago capturado y luego revertido (devolución por anulación/cancelación)
> tiene **efecto neto = $0** en la caja de la misión. El hecho histórico "el
> dinero se capturó en E" se conserva; solo su efecto sobre el `efectivoEsperado`
> se neutraliza.

```
CAPTURA ORIGINAL:  Pago $60.000 en E70
pedido cancelado → devolución $60.000 → REVERSION
efecto neto sobre la caja de E70 = $0
```

**Mecanismo concreto (rev.6 — F6):** **exclusión por estado del pedido.**

```sql
Σ Pago
  WHERE embarqueId = E
    AND pedido.estadoEntrega NOT IN ('ANULADO', 'CANCELADO')
```

La alternativa "restar las `REVERSION` del `Pago`" **no es viable**:
`ReceivableEntry REVERSION` es **por pedido, no por pago** (no tiene `pagoId`);
si un pedido tuvo pagos en E70 y E78, la `REVERSION` no se puede repartir por
embarque. La exclusión por estado del pedido es segura (no hay anulación
parcial de pedidos — es todo-o-nada + `NotaCredito`) y **consistente con el
modelo monetario existente** (`fetchPagosOrigenDiferido` ya excluía
`ANULADO/CANCELADO`). **No se crea una segunda contabilidad dentro de `Pago`.**
Test obligatorio (E2E 14).

- `coleccionarPagos()` deja de leer `pedidosRaw[].pagos` / `ventasLibres[].pagos`
  y pasa a una lectura viva de los `Pago` con `embarqueId = E` y el filtro de
  estado del pedido de arriba.
- **Guard `PAGOS_EXCEDIDOS` (rev.6 — F7):** el pago **nuevo** de misión para un
  pedido se compara contra el **saldo pendiente** de ese pedido
  (`pedido.total − pedido.totalPagado` **antes** de aplicar el pago), NO contra
  un total recalculado desde lo entregado ni contra "el cobro de la misión"
  (que sería circular). Nadie puede cobrar en la misión más de lo que el pedido
  debe.
- **Se retira** `embarqueOrigenId` de la conciliación de caja
  (`fetchPagosOrigenDiferido` + el `continue` de `coleccionarPagos`).
  `embarqueOrigenId` queda solo como metadato histórico del pedido — **no
  participa en ningún cálculo monetario**. **Una sola fuente de verdad.**
- **Condición:** la lógica vieja NO se elimina hasta que **toda** la matriz E2E
  (§Tests) esté verde. PR-2 puede aterrizar el campo + los sitios de captura y
  remover la lógica vieja **en el mismo PR** solo con la matriz demostrada.

### 5b. Cancelar / reabrir un embarque (A4)

Existe el flujo de **cancelar embarque** (`CERRADO → CANCELADO`, fix QA-prod
#29). Al cancelar o reabrir un embarque:

- `Pago.embarqueId` **NO se toca** (inmutabilidad, §3). Los pagos siguen
  apuntando a `E`.
- El re-cierre de `E` los vuelve a contar en `efectivoEsperado`. **Esto es
  correcto SÓLO SI** `cancelar-embarque` revirtió los efectos de caja del cierre
  anterior (deudas de faltante, movimientos, `CierreDia`). Si `cancelar-embarque`
  ya hace esa reversión → no hay doble conteo. **PR-2 verifica esta invariante
  con un test** (cerrar E → cancelar E → re-cerrar E → caja consistente, sin
  duplicar cobro). Si `cancelar-embarque` NO revierte la caja, es un bug
  preexistente que PR-2 documenta pero no necesariamente arregla.
- La idempotencia de replay del cierre (`CierreDedupService` por `offlineId`)
  sigue aplicando: un re-cierre con el **mismo** `offlineId` que el cierre
  cancelado es un no-op; uno con datos/`offlineId` nuevos re-ejecuta.

### 6. Prepago prellenado en el asistente de cierre

`cerrar-client/index.tsx` deja de prellenar `cuadre.pagos` con los `Pago`
existentes del pedido. El asistente solo captura los pagos **nuevos** recibidos
en esta misión. Los pagos previos (prepago, `embarqueId=null` o de otro
embarque) no entran al cuadre ni a `efectivoEsperado`.

### 7. PR-2 supersede el guard provisional de PR-1 + la rama PARCIAL registra pagos

PR-1 dejó dos medidas provisionales en `procesar-pedido.service.ts`:
1. Guard `entregaPrevia` (re-cierre → no crear `Pago` / no tocar `totalPagado`).
2. `procesarEntregaParcial` **NO registra** `cuadre.pagos` ("eso es PR-2").

Ambas eran defensa contra el prellenado de `cuadre.pagos`.

**PR-2 (rev.6 — F9):**
- Retira el prellenado (§6) → `cuadre.pagos` = solo dinero nuevo de la misión.
- Retira el guard `entregaPrevia` (sería código muerto / regla engañosa).
- **`procesarEntregaParcial` SÍ registra `cuadre.pagos`** con `embarqueId = E`
  (el embarque que se cierra). Con el prellenado fuera, no hay duplicación:
  un cobro parcial en el cierre de E70 crea un `Pago` de $60k con
  `embarqueId = E70`, y el cierre de E70 lo cuenta (E2E 5). El `totalPagado`
  del pedido se **incrementa** por el monto nuevo (nunca se pisa ni se recorta).
- La rama COMPLETO y la rama PARCIAL quedan simétricas en el manejo de dinero:
  ambas registran los pagos del cuadre con `embarqueId = E`, ambas incrementan
  `totalPagado`, ninguna recalcula `total` (PR-1 §invariante).

---

## Migración

1. `ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "embarqueId" TEXT;` + FK
   `ON DELETE SET NULL` + `CREATE INDEX IF NOT EXISTS`.
2. `GRANT`: **verificar si hace falta (rev.6 — F11).** Una columna nueva
   nullable en `Pago` normalmente **no** requiere un `GRANT` nuevo — el usuario
   de runtime (`app_write` / `postgres`) ya tiene `INSERT`/`UPDATE` sobre `Pago`.
   La FK a `Embarque` se crea con el usuario de migración, no el de runtime. Si
   la verificación confirma que no hace falta, se omite este paso.
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

`Pago.embarqueId` se setea en el mismo `create` del `Pago`, dentro de la
transacción que ya lo crea (cierre bajo `CIERRE:{embarqueId}`, venta-libre bajo
`SECUENCIA:pedido`, entrega bajo `PEDIDO:{id}`). El dedup por `offlineId` del
`Pago` / `entregaOfflineId` del pedido no cambia.

**No se agregan locks nuevos** (decisión deliberada, A2):

- La entrega (`PEDIDO:{id}`) y el cierre (`CIERRE:{embarqueId}`) **no comparten
  lock**. Un `Pago` de entrega puede commitear después de que el cierre leyó
  `Σ Pago WHERE embarqueId = E`. Serializar entrega↔cierre exigiría que la
  entrega tomara `CIERRE:{embarqueId}` (o el cierre tomara `PEDIDO:{id}` de cada
  pedido), lo que acopla dos agregados y no elimina la carrera con offline.
- **Resolución aceptada:** el `Pago` queda con su `embarqueId` real; el faltante
  es una **discrepancia post-cierre** (misma naturaleza que el sync offline
  tardío). No se pierde dinero, no se miente en la contabilidad. Ver §4.3
  punto 4 y E2E 12/13.
- Dos entregas-con-pago concurrentes sobre el **mismo pedido** SÍ serializan
  (`PEDIDO:{id}`): la 2ª ve el `Pago` de la 1ª y `pedido.registrarPago` rechaza
  el sobrepago (`C-BIZ-6`). El `Pago` de la 2ª nunca se persiste (misma tx que
  el reject). E2E A6.

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

## Tests obligatorios (PR-2) — matriz de captura (16 casos, gate de aceptación)

La lógica vieja (`fetchPagosOrigenDiferido` + `continue` + guard `entregaPrevia`)
**no se retira** hasta que **toda** esta matriz esté verde.

### A. Captura (contexto del pago)

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Prepago $100k (mostrador) → Embarque entrega 60% | `Pago.embarqueId = null`; cobro de misión del cierre = **$0**; sin `PAGOS_EXCEDIDOS`; pago histórico intacto |
| 2 | Fiado $100k → repartidor cobra $100k en la entrega (payload con `embarqueId`) | `Pago.embarqueId = E`; caja de `E` += $100k |
| 3 | Prepago → pedido reasignado a otro embarque | el `Pago` conserva `embarqueId = null` |
| 4 | Pago capturado en E70 → el pedido pasa a E78 | el `Pago` sigue con `embarqueId = E70`; **pedido reasignado ≠ pagos reasignados** |
| **5** | **Prueba definitiva:** Pedido #100 ($100k). Pago #1 $60k en E70. El pedido pasa a E78. Pago #2 $40k en E78. | Pedido: `total 100k / totalPagado 100k / saldo 0`. Cierre E70: cobrado = **$60k**. Cierre E78: cobrado = **$40k**. Obligación ≠ ejecución ≠ captura. |
| 6 | Entrega con pago, offline + reintento (mismo `offlineId`) | no se duplica el `Pago` ni el cobro |
| 7 | Cierre repetido del mismo embarque (replay) | no se duplica el cobro de misión |
| 8 | Venta en ruta + entrega posterior | el dinero pertenece al embarque de **captura**; reemplaza `cierre-venta-ruta-entrega-posterior.test.ts` |
| 9 | Regresión: cierre normal (fresco, cobro en la entrega, un embarque) | caja idéntica a hoy |

### B. Seguridad / contrato

| # | Caso | Resultado esperado |
|---|---|---|
| **10** | Entrega con `pagos: [{monto: 100000}]` **sin** `embarqueId` en el payload | **`400` `PAGO_MISION_SIN_EMBARQUE`** — nunca `null` silencioso |
| **11** | Repartidor A envía un pago con `embarqueId` de un embarque de repartidor B | **`403`** (`EMBARQUE_NO_PERTENECE`). ADMIN/ASISTENTE → permitido, auditado (A5) |
| **12** | Sync offline tardío de un pago cuyo `embarqueId` ya está `CERRADO` | el `Pago` se crea con su `embarqueId` real; discrepancia post-cierre (no se descarta, no se re-etiqueta) |

### C. Huecos de la revisión adversarial

| # | Caso | Resultado esperado |
|---|---|---|
| **13** | **A2 — carrera online:** el cierre de E lee sus pagos; una entrega-con-pago de E commitea justo después; el cierre commitea | el `Pago` queda con `embarqueId = E`; el cierre no lo contó → discrepancia post-cierre (misma resolución que 12); la entrega NO se bloquea |
| **14** | **A1 — efecto neto:** `Pago` $60k capturado en E70 → el pedido se **anula** → devolución/`REVERSION` → cierra E70 | efecto neto sobre `efectivoEsperado(E70)` = **$0**; el hecho "capturado en E70" se conserva; sin falso faltante |
| **15** | **A6 — concurrencia mismo pedido:** dos entregas-con-pago concurrentes sobre el mismo pedido | serializan bajo `PEDIDO:{id}`; la 2ª → reject por sobrepago (`C-BIZ-6`); nunca se persiste un `Pago` de más |

### D. Ciclo de vida del embarque

| # | Caso | Resultado esperado |
|---|---|---|
| **16** | **A4:** cerrar E (con pagos de misión) → cancelar/reabrir E → re-cerrar E | `Pago.embarqueId` **inmutable** en todo el ciclo; la caja del re-cierre es consistente con lo que `cancelar-embarque` hizo con la del cierre previo (`ADR-CIERRE-001`); sin duplicar cobro |

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
7. **Validación server-side del `embarqueId`** recibido: **solo** (1) existe + (2) autorización (§4.3). *(La coherencia pedido↔embarque de rev.3 se eliminó del ADR en rev.5 — A3: no es verificable, no se inventa historial.)*
8. `pagar-fiado`/`abono` **en ruta** como frontera explícita — clasifica el evento de captura, no el concepto contable (§4.2).
9. PR-2 **retira** el guard `entregaPrevia` de PR-1 (§7).
10. `onDelete: SetNull` documentado + condición: no borrar embarque `CERRADO` con dinero conciliado (referencia a `ADR-CIERRE-001`, sin regla paralela).
11. Matriz E2E ampliada: casos 5 (prueba definitiva multi-embarque), 10 (rechazo sin `embarqueId`), 11 (autorización), 12 (sync tardío a `CERRADO`).

**rev.4 → rev.5 (2026-09-03, revisión adversarial + refinamiento del PO):**
- **A1 (regla de efecto monetario neto):** el cierre de `E` cuenta el efecto
  **neto** de caja de los pagos capturados en `E`; un pago revertido (devolución
  por anulación/cancelación) tiene efecto neto $0. El mecanismo concreto lo
  fija PR-2 según la semántica de `REVERSION` — sin segunda contabilidad en
  `Pago`. §5/A1 + E2E 14.
- **A2 (carrera online):** entrega (`PEDIDO:{id}`) y cierre (`CIERRE:{embarqueId}`)
  no comparten lock. **No se agregan locks**; resolución = discrepancia
  post-cierre (misma que el sync offline). El sistema no falsifica el pasado.
  §4.3 pt.3, §Concurrencia, E2E 13.
- **A3 (regla no verificable eliminada):** se quita del ADR la exigencia "el
  pedido está o estuvo asignado a E". La validación es **solo** (1) existe +
  (2) autorización. NO se inventa un historial de asignación.
- **A4 (cancelar/reabrir):** `Pago.embarqueId` intacto ante cualquier cambio de
  estado del embarque; el re-cierre re-cuenta, correcto sólo si `cancelar-embarque`
  revierte la caja previa (regla monetaria en `ADR-CIERRE-001`, no acá). §5b + E2E 16.
- **A5 (ADMIN/ASISTENTE):** autorización administrativa dentro de la única
  empresa, con auditoría — no aislamiento de tenants. §4.3 pt.2.

**rev.6 (2026-09-03, revisión adversarial final — ADR ACEPTADO):**
- **F6:** el mecanismo de A1 se congela como **exclusión por estado del pedido**
  (`ANULADO/CANCELADO`). "Restar `REVERSION`" se descarta — es por-pedido, no
  por-pago (`ReceivableEntry` no tiene `pagoId`). §5/A1.
- **F7:** el guard `PAGOS_EXCEDIDOS` compara el pago nuevo de misión contra el
  **saldo pendiente del pedido** (`total − totalPagado`), no contra "el cobro de
  la misión" (circular). §5.
- **F9:** `procesarEntregaParcial` (rama PARCIAL) **sí registra** `cuadre.pagos`
  con `embarqueId = E` en PR-2 — simétrico con la rama COMPLETO; ambas
  incrementan `totalPagado`, ninguna recalcula `total`. §7.
- **F1 (nota):** excepción a la invariante "no derivar de `pedido.embarqueId`"
  para ADMIN/ASISTENTE registrando entrega+cobro de escritorio (hipotético hoy).
- **F11 (nota):** el `GRANT` de la migración probablemente no hace falta —
  verificar. §Migración.

### Modelo de datos y autorización — Agua Bambú NO es multitenant

**HECHO / estado arquitectónico actual:** Agua Bambú opera como una aplicación
para una **única empresa**. `Negocio`/sucursal representa **estructura interna**
de esa empresa y **no** constituye un límite de tenant. Este ADR **no** introduce
aislamiento multitenant, `tenant_id`, particionamiento de datos por tenant ni
autorización entre tenants.

La autorización del `embarqueId` de un pago se basa en **identidad, rol,
trabajador asignado y permisos administrativos** — no en tenant isolation:

```
USUARIO → ROL/IDENTIDAD → ¿puede ejecutar esta operación?
                        → ¿puede actuar sobre este Embarque? (repartidor↔embarque / ADMIN)
                        → ¿queda auditado?
```

---

## Clasificación

| Elemento | Clasificación |
|---|---|
| `Pago.embarqueId` como contexto de captura inmutable | **DECISIÓN ACEPTADA** |
| Captura ≠ obligación ≠ ejecución logística | **DECISIÓN ACEPTADA** |
| A1 — efecto monetario neto (mecanismo: exclusión por estado del pedido) | **RESUELTO en rev.6 (F6)** |
| A2 — carrera entrega/cierre → discrepancia post-cierre, sin locks nuevos | **RESUELTO en rev.5** |
| A3 — regla de coherencia histórica no verificable → eliminada | **RESUELTO en rev.5** |
| A4 — cancelar/reabrir embarque → `Pago.embarqueId` inmutable | **RESUELTO en rev.4/5** |
| A5 — ADMIN/ASISTENTE + auditoría | **RESUELTO en rev.4** |
| A6 — concurrencia sobre el mismo pedido | **CONDICIÓN DE IMPLEMENTACIÓN (E2E 15)** |
| F7 — guard `PAGOS_EXCEDIDOS` vs saldo pendiente | **RESUELTO en rev.6** |
| F9 — rama PARCIAL registra pagos con `embarqueId=E` | **RESUELTO en rev.6** |
| Matriz E2E (16 casos) | **CRITERIO DE ACEPTACIÓN de PR-2** |
| multitenancy | **NO APLICA — eliminada del diseño** |
| PR #176 (ADR documental) | **A MERGEAR** |
| Código de PR-2 | **AUTORIZADO** — disciplina "corregir en el camino sin perder trazabilidad" |

---

## Consecuencias

- El follow-up de `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` §0 queda **cerrado**.
- `Embarque` gana una relación `pagos Pago[]`.
- Reportes de "dinero cobrado en ruta por día" ganan la dimensión
  (`Pago.embarqueId` + `Embarque.fecha`).
- La app del repartidor debe enviar `embarqueId` en la entrega cuando hay cobro
  — cambio de contrato del endpoint `/api/pedidos/[id]/entrega` (PR-2).
- El cálculo del cierre pasa a filtrar por estado del pedido (`ANULADO/CANCELADO`)
  además de por `embarqueId`.
