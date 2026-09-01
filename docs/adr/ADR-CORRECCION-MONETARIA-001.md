# ADR-CORRECCION-MONETARIA-001 — Corrección de abono individual + reversión monetaria

- Estado: **Aceptado** (PO 2026-09-01 — decisiones D.1–D.7 convergidas)
- Fecha: 2026-09-01
- Fuente: ALS Operación Comercial §21; Plan Técnico §26–§28; INVENTARIO §G2, §F7; `docs/abonos-correccion/REVISION_CONSOLIDADA_CORRECCION_ABONOS.md` (C-01…C-20, D.1–D.7)
- Fase de implementación: FASE 2 (Pedidos / Cartera). Aditivo.
- Reemplaza: no hay ADR previo. Este ADR **cierra** la iniciativa "corrección segura de abonos" (V5→V7→V8→consolidada) dentro del corpus existente — no es un contrato paralelo.

## Contexto

Hoy:

- `POST /api/pedidos/pagar-fiado` reparte un pago FIFO entre varias facturas del
  cliente, creando N filas `Pago` + N `Abono` que **no comparten ninguna columna
  de correlación**.
- No existe forma de **corregir** un abono mal aplicado (cliente equivocado,
  monto equivocado, factura equivocada, pago no recibido). `chk_abono_monto_pos`
  prohíbe un `Abono` de monto negativo. No hay endpoint de reversión.
- `AnularPedidoUseCase` / `CancelarPedidoUseCase` ponen `totalPagado → 0` y crean
  una `NotaCredito`, **pero no revierten las filas `Pago` ni generan
  `ReceivableEntry`** — `ReceivableTipo` está cerrado en `PAGO | ABONO` (INVENTARIO §F7).

Ambos son el **mismo problema conceptual**: un hecho monetario asentado resultó
inválido y hay que revertirlo **sin destruir la historia** (P4).

## Decisión — un solo mecanismo de reversión

```
HECHO MONETARIO ORIGINAL (Abono | Pago de anulación)
        │
        ├── correcto  → nada
        │
        └── incorrecto
                │
                ▼
        CorreccionAbono (append-only, numerada, vinculada al original)
                │
                ▼
        ReceivableEntry  tipo = REVERSION
                │
                ▼
        recálculo de Pedido.saldo / totalPagado / estadoPago
```

### D.1 — Alcance v1: **abono individual** (no multi-factura como una operación)

Si un `pagar-fiado` de $30.000 se repartió A=$10k / B=$12k / C=$8k y el error
está en B, v1 corrige **el `Abono` B** ($12k) → una `CorreccionAbono` → una
`ReceivableEntry REVERSION` de $12k. A y C quedan intactos. Si después se
determina que todo el pago fue inválido, se hacen **N correcciones**, una por
abono. **No** hay una operación "mágica" que toque varias obligaciones a la vez.

- **Fuera de v1:** corrección multi-factura como una sola operación. Si se
  prioriza, requiere `Abono.grupoCorrelacionId String? @index` + backfill + su
  propio incremento de este ADR.

### D.3 — Forma: modelo `CorreccionAbono` append-only

```prisma
model CorreccionAbono {
  id             String   @id @default(cuid())
  numero         String   @unique                 // COR-00000
  abonoId        String                            // vínculo OBLIGATORIO al original
  abono          Abono    @relation(fields: [abonoId], references: [id], onDelete: Restrict)
  tipo           String                            // MONTO | CLIENTE | FACTURA | NO_RECIBIDO
  montoRevertido Decimal  @db.Decimal(10, 2)       // > 0 (es una reversión, no un abono negativo)
  motivo         String   @db.Text
  autorizadoPorId String
  autorizadoPor  User     @relation(fields: [autorizadoPorId], references: [id], onDelete: Restrict)
  responsibilityCaseId String?                     // si tipo = NO_RECIBIDO (D.7)
  correccionOfflineId  String? @unique             // idempotencia
  createdAt      DateTime @default(now()) @db.Timestamptz()

  @@index([abonoId])
}
```

- **No** `Abono` negativo (bloqueado por `chk_abono_monto_pos`).
- **No** reutilizar `NotaCredito` (es a nivel pedido/factura, no de abono; la generan
  anular/cancelar por otra razón).
- **No** `DELETE` de nada.
- **No** editar el `Abono` original (append-only; a lo sumo un flag derivado
  `Abono.corregido` calculado, no una columna de estado mutable).

### D.4 — El mismo mecanismo cubre anular/cancelar pedido pagado

- `ReceivableTipo` se extiende: `PAGO | ABONO | REVERSION`.
- `AnularPedidoUseCase` / `CancelarPedidoUseCase`: además de la `NotaCredito`
  (que se mantiene, es el documento contable del pedido), emiten una
  `ReceivableEntry` tipo `REVERSION` por el `totalPagado` que se está anulando,
  **dentro de la misma transacción del lock** (`SECUENCIA:notaCredito` hoy;
  ver nota de G5). Las filas `Pago` **no se borran**; quedan como hecho histórico
  con su `ReceivableEntry PAGO` original + la `REVERSION` que lo compensa.
- El detector de divergencia dual-write (`registrarDivergencia`, ADR-MONETARIO-001)
  ya no frena el rollout: `REVERSION` es un tipo conocido.

### D.2 / D.5 — Permisos y ubicación

- Corrección de abonos: **`ADMIN` + `CONTADOR`** (`view:cartera` nuevo).
  Reconciliar `pagar-fiado` (hoy `ADMIN` + `ASISTENTE`) — **decisión pendiente
  menor:** o `pagar-fiado` pasa a `ADMIN + ASISTENTE + CONTADOR`, o la corrección
  también admite `ASISTENTE`. Propuesta: `pagar-fiado` suma `CONTADOR` (puede
  cobrar), corrección se queda `ADMIN + CONTADOR` (revierte).
- **Sección "Cartera"** nueva en el sidebar (ícono wallet), permiso `view:cartera`,
  roles `ADMIN + CONTADOR`. Contiene: lista de abonos (con paginación server-side
  — hoy `GET /api/abonos` no la tiene), historial por cliente (extender el
  timeline de `cliente-historial.tsx`, no reinventar), y el centro de corrección.

### D.7 — Investigación de "pago no recibido" reutiliza `ResponsibilityCase`

- `CorreccionAbono` tipo `NO_RECIBIDO` → crea un `ResponsibilityCase`
  tipo `PAGO_NO_CONFIRMADO` (el mismo valor nuevo que introduce
  `ADR-PAGO-REPORTADO-CONFIRMADO-001`), `embarqueId` nullable,
  `montoEstimado = abono.monto`, pendiente de resolución autorizada
  (ADR-RESPONSABILIDAD-001).
- **El dominio de pagos produce el hecho financiero; `ResponsibilityCase`
  gestiona la investigación y la eventual responsabilidad.** No se crea `Caso`
  ni una entidad `Investigation` nueva.

### D.6 — `saldoFavor` es PR aparte (fuera de este ADR)

`Cliente.saldoFavor` existe y está cableado, pero `pagar-fiado` no escribe el
sobrante ahí (solo lo reporta). Arreglarlo toca `pagar-fiado`, no la corrección.

```
PR-A  (independiente)  pagar-fiado → escribe el sobrante a Cliente.saldoFavor
PR-B  (este ADR)       CorreccionAbono + ReceivableTipo.REVERSION
```

## Fuera de alcance (explícito)

- Corrección multi-factura como una sola operación.
- `Abono` negativo · reutilizar `NotaCredito` para reversión de abono.
- Nueva entidad `Caso` / nuevo mecanismo de responsabilidad.
- Fix de `saldoFavor` (PR-A) · rediseño de `pagar-fiado`.
- Confirmación de `Abono` (el modelo de `ADR-PAGO-REPORTADO-CONFIRMADO-001`
  aplica a `Pago`; extenderlo a `Abono` es trabajo posterior).

## Contrato de comandos

- `POST /api/cartera/abonos/[id]/corregir` — `requireRole([ADMIN, CONTADOR])`.
  Body `{ tipo, montoRevertido?, motivo, correccionOfflineId? }`.
  `withAdvisoryLock('CARTERA', abono.clienteId)` (+ `SECUENCIA:correccionAbono`).
  Dedup por `correccionOfflineId @unique` → replay `deduped: true`.
  Dentro de la tx: crea `CorreccionAbono`, `ReceivableEntry REVERSION`, recalcula
  `Factura` + `Pedido` (saldo/totalPagado/estadoPago vía el helper
  `proyectarEstadoPago` de G5), `logAudit(entry, tx)`. Si `tipo = NO_RECIBIDO`,
  crea el `ResponsibilityCase`.
- `GET /api/cartera/abonos` — paginado server-side (patrón de `/clientes`),
  filtros cliente/factura/fecha/método/estado.
- Guard: la corrección **se bloquea** si el pedido/factura está `ANULADO`
  (D.4 lo reconcilia por el camino de anular, no por acá).

## Migración

1. `CREATE TABLE "CorreccionAbono"` + `ALTER TYPE`/valores de `ReceivableTipo`
   (`REVERSION`). Aditivo, reversible.
2. Permiso `view:cartera` en `permissions.ts` (ADMIN, CONTADOR).
3. Sin backfill de datos: las correcciones son hacia adelante. Los abonos
   históricos mal aplicados se corrigen manualmente vía el nuevo flujo cuando se
   detecten (no se inventan `CorreccionAbono` retroactivas).
4. `AnularPedidoUseCase`/`CancelarPedidoUseCase`: emitir `ReceivableEntry REVERSION`
   — cambio de código, sin migración. Gate: verificar que la suma
   `PAGO - REVERSION` de un pedido anulado = 0.

## Concurrencia / idempotencia / auditoría

- Lock `CARTERA:{clienteId}` (mismo agregado que `pagar-fiado` y `/api/abonos`).
- `correccionOfflineId @unique` (dedup real por DB, no solo en el lock).
- `logAudit(entry, tx)` transaccional (F1 ya lo hace estándar).
- CHECK: `montoRevertido > 0`; `montoRevertido <= abono.monto`
  (`chk_correccion_no_excede`).

## Tests obligatorios

- `OC-14` pago duplicado → corrección; `OC-15` reversión; `OC-16` reaplicación.
- `PED-OC` corrección de un abono de un `pagar-fiado` FIFO: solo ese abono se
  revierte, los otros del batch quedan intactos (D.1).
- Anular pedido pagado → `ReceivableEntry PAGO + REVERSION` suman 0; `Pago` rows
  siguen existiendo (D.4).
- `tipo = NO_RECIBIDO` → crea `ResponsibilityCase PAGO_NO_CONFIRMADO` (D.7).
- Dos correcciones concurrentes del mismo abono → una gana, otra `deduped`/rechazada.
- Replay con el mismo `correccionOfflineId` → `deduped: true`.
- Rol `ASISTENTE` → 403 en `/corregir`; `CONTADOR` → OK.
- Divergencia dual-write con `REVERSION` → no frena rollout.

## Dependencias con otros ADR de Fase 2

- **`ADR-PEDIDO-ESTADO-CANONICO-001` (G5):** la corrección recalcula `estadoPago`
  vía `proyectarEstadoPago` — debe implementarse **después** de G5, o usar el
  cálculo actual y migrar. El CHECK `chk_pedido_estadopago_proyectado` debe
  admitir el estado resultante tras una `REVERSION`.
- **`ADR-PAGO-REPORTADO-CONFIRMADO-001` (G4):** comparten el valor
  `ResponsibilityCase.tipo = PAGO_NO_CONFIRMADO`. La `discrepanciaNota` vive en
  el `ResponsibilityCase`, **no** en `Pago` ni en `CorreccionAbono` (dominio de
  pagos ≠ dominio antifraude).
- **`ADR-MONETARIO-001`:** `ReceivableTipo` se extiende con `REVERSION` — este ADR
  es el que lo autoriza.

## Consecuencias

- G2 deja de ser "una pantalla para corregir abonos" y pasa a ser
  "reversión monetaria unificada": un solo mecanismo (`CorreccionAbono` +
  `ReceivableEntry REVERSION`) para el error de abono y para la anulación de
  pedido pagado.
- `ReceivableEntry` gana un tercer tipo; toda query que asuma `PAGO | ABONO`
  (reportes de cartera, `/api/cierre` `cobroCartera`) debe considerar `REVERSION`
  como signo negativo.
- Nueva sección de nav, nuevo permiso, `GET /api/abonos` se reescribe con paginación.
