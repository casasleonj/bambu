# Spec: Módulo Pedidos — Agua Bambú

> **Estado:** reescrito 2026-08-31 (G9 del INVENTARIO de Fase 0). Refleja el
> código real en `main` — no el diseño original de "v2".
> **Autoridad:** el código gana. Si esta spec diverge del código, se corrige la spec.
> Contrato de dominio de fondo: `plan-maestro-v11.1-equipo-desarrollo.md` + `docs/adr/*`.

---

## 1. Tres dimensiones independientes (contrato)

Un pedido tiene **tres estados que NO se mezclan** (P1/P2/P3 del contrato):

| Dimensión | Columna | Enum | Quién lo escribe |
|---|---|---|---|
| **Origen** | `Pedido.origen` | `OrigenPedido`: `PEDIDO`, `VENTA_RAPIDA`, `VENTA_LIBRE`, `RECURRENTE` | fijo en creación |
| **Entrega** | `Pedido.estadoEntrega` | `EstadoEntrega`: `PENDIENTE`, `EN_RUTA`, `ENTREGADO`, `NO_ENTREGADO`, `CANCELADO`, `ANULADO` | máquina de estados (§3) |
| **Pago** | `Pedido.estadoPago` | `EstadoPago`: `PENDIENTE`, `PARCIAL`, `PAGADO`, `ANTICIPADO`, `VENCIDO`, `ANULADO` | derivado de `(total, totalPagado)` en cada write; `VENCIDO` solo por cron |

- `Pedido.estado` (`EstadoPedido`) es un **mirror legacy** de `estadoEntrega`, mantenido
  en sync por `PedidoMapper`. No leer de él en código nuevo. Su retiro es G5
  (`ADR-PEDIDO-ESTADO-CANONICO-001`, Fase 2).
- `Pedido.tipo` (`"ENVIO"` | `"PUNTO"`) y `Pedido.canal` (`"DOMICILIO"` | `"PUNTO"`)
  son `String` libres. Su consolidación es G6 (`ADR-PEDIDO-ORIGEN-CANAL-001`, Fase 2).
- Balance canónico por pedido: `Pedido.saldo` / `Pedido.totalPagado`
  (CHECK `chk_pedido_saldo_calc`: `saldo = total - totalPagado`, `saldo >= 0`,
  `totalPagado <= total`). `ReceivableEntry` es proyección de auditoría, no fuente.

### Estado inicial al crear (`CrearPedidoUseCase`)

| Caso | `estadoEntrega` | `estadoPago` |
|---|---|---|
| `origen = VENTA_RAPIDA` | `ENTREGADO` (ítems `cantEntrega = cantPedido`) | `fromTotals(total, totalPagado)` |
| resto (`PEDIDO`, `RECURRENTE`) | `PENDIENTE` | `fromTotals(...)` |

> El contrato ALS revisado cuestiona `VENTA_RAPIDA → ENTREGADO` universal (pago
> anticipado + entrega posterior). Es F5, se resuelve en `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001`.

---

## 2. Módulo DDD — `src/modules/pedidos/`

- `domain/value-objects/` — `EstadoEntrega.ts` (`TRANSICIONES_ENTREGA`),
  `EstadoPago.ts` (`TRANSICIONES_PAGO`, `EstadoPagoVO.fromTotals`), `Canal`,
  `OrigenPedido`, `PedidoId`, `MetodoPago`. **Fuente única** de las máquinas de estado.
- `domain/services/pedido-transitions.service.ts` — punto de entrada canónico
  (re-exporta tablas + `getBadge*` + `legacyToNewState`). `src/lib/pedido-utils.ts`
  es una **fachada** que re-exporta de aquí (F2).
- `domain/services/pricing-algorithm.service.ts` — `resolverPreciosPedido` (puro).
- `application/use-cases/` — `CrearPedidoUseCase`, `ActualizarPedidoUseCase`,
  `EntregarPedidoUseCase`, `AnularPedidoUseCase`, `CancelarPedidoUseCase`,
  `AjustarPedidoCantidadUseCase`, `ListarPedidosUseCase`, `GetFiadoStatusUseCase`.
- Composición: `application/index.ts` (DI manual). API pública: `index.ts`.
- Locks: vía `ITransactionManager` (`execute` / `executeWithLock(namespace, key, fn)`),
  que envuelve `withAdvisoryLock` de `src/lib/locks.ts` (dueño de la transacción).

---

## 3. Máquina de estados de entrega

`src/modules/pedidos/domain/value-objects/EstadoEntrega.ts` — `TRANSICIONES_ENTREGA`:

```
PENDIENTE     → EN_RUTA, CANCELADO
EN_RUTA       → ENTREGADO, NO_ENTREGADO, PENDIENTE, CANCELADO
ENTREGADO     → ANULADO
NO_ENTREGADO  → PENDIENTE, EN_RUTA, CANCELADO
CANCELADO     → (terminal)
ANULADO       → (terminal)
```

Enforced en `Pedido` (entidad) + validado en `ActualizarPedidoUseCase.canTransitionTo`.
`enviar` (raw `updateMany`) valida `estado === 'PENDIENTE'` (consolidación a la
máquina canónica pendiente en F3/G5).

Máquina de pago (`EstadoPago.ts` — `TRANSICIONES_PAGO`):

```
PENDIENTE  → PARCIAL, PAGADO, ANTICIPADO, ANULADO
PARCIAL    → PAGADO, ANTICIPADO, ANULADO
PAGADO     → ANULADO
ANTICIPADO → PAGADO, ANULADO
VENCIDO    → PAGADO, PARCIAL, ANULADO
ANULADO    → (terminal)
```

`EstadoPagoVO.fromTotals(total, totalPagado)`: `>=total → PAGADO`, `>0 → PARCIAL`,
else `PENDIENTE`. `ANTICIPADO` no lo escribe ningún camino hoy (VERIFICAR — G7).
`VENCIDO` solo lo escribe `/api/cron/vencimiento-promesas` (diario, `promesaPagoFecha < now`).

---

## 4. Endpoints

Envelope: `apiSuccess(data, status?)` / `apiError(message, status?)`
(`src/lib/api-response.ts`). Auth: `requireAuth` → `requireRole` → `requireOwnership`
(`requireOwnership` real solo para `REPARTIDOR`). Rate limit vía `src/proxy.ts`
(auth-before-rate-limit). Realtime: `pedido.created|updated` best-effort.

| Endpoint | Método | Roles | Idempotencia | Lock |
|---|---|---|---|---|
| `/api/pedidos` | `GET` | auth (REPARTIDOR → solo con `embarqueId`) | — | — |
| `/api/pedidos` | `POST` | ADMIN, ASISTENTE | `offlineId` → `Pedido.offlineId @unique` (dedup en el lock → 200 `deduped`) | `SECUENCIA:pedido` |
| `/api/pedidos/[id]` | `GET` | auth + ownership | — | — |
| `/api/pedidos/[id]` | `PUT` | auth + ownership | — (declarativo; `offlineId` persistido = follow-up F2) | **`PEDIDO:{id}`** (F3) |
| `/api/pedidos/[id]` | `DELETE` | ADMIN, CONTADOR | vía use case (anular→cancelar fallback) | `SECUENCIA:notaCredito` |
| `/api/pedidos/[id]/enviar` | `POST` | ADMIN, ASISTENTE, REPARTIDOR (ownership del embarque) | `envioOfflineId @unique` | `$transaction` + guard `updateMany({embarqueId:null})` |
| `/api/pedidos/[id]/entrega` | `POST` | auth (REPARTIDOR → ownership) | `entregaOfflineId @unique` + estado `ENTREGADO` | `SECUENCIA:pedido` |
| `/api/pedidos/[id]/anular` | `POST` | ADMIN, ASISTENTE | `anulacionOfflineId @unique` + estado `ANULADO` | `SECUENCIA:notaCredito` |
| `/api/pedidos/[id]/cancelar` | `POST` | ADMIN, ASISTENTE, REPARTIDOR (ownership) | `cancelacionOfflineId @unique` + estado `CANCELADO` | `SECUENCIA:notaCredito` |
| `/api/pedidos/[id]/ajustar-cantidad` | `POST` | ADMIN, ASISTENTE | `PedidoCantidadAjuste.offlineId @unique` | `PEDIDO:{id}` |
| `/api/pedidos/[id]/resolver-disputa` | `POST` | ADMIN, ASISTENTE | idempotente por `disputaAbierta` | — |
| `/api/pedidos/pagar-fiado` | `POST` | ADMIN, ASISTENTE | `offlineId` compartido en los `Pago` del batch FIFO | `CARTERA:{clienteId}` |
| `/api/pedidos/venta-libre` | `POST` | ADMIN, ASISTENTE, REPARTIDOR (ownership) | `Pedido.offlineId @unique` | `SECUENCIA:pedido` + `SECUENCIA:factura` |
| `/api/pedidos/recurrentes` | `POST` | ADMIN, CONTADOR | `offlineId` → `recurrenteBatchId` | `executeSerializableWithRetry` por plantilla |
| `/api/pedidos/counts` | `GET` | ADMIN, ASISTENTE, CONTADOR, REPARTIDOR | — | — |
| `/api/abonos` | `POST` | ADMIN, CONTADOR | `Abono.offlineId @unique` (G1) | `CARTERA:{clienteId}` |

**Contrato de idempotencia** (`§24` / ADR-IDEMPOTENCIA-001): mismo `offlineId` +
mismo payload → mismo resultado (`deduped: true`, 200). Sin `offlineId` → comportamiento normal.

**Conflicto de asignación** (F6): `enviar` y `PUT /api/embarques/[id]` devuelven
**409** cuando el pedido ya está asignado por concurrencia.

**Auditoría** (F1): `pagar-fiado`, `abonos`, `PUT /api/pedidos/[id]` escriben
`logAudit(entry, tx)` **dentro** de la transacción (rollback atómico si falla).

### `POST /api/pedidos` — body (`PedidoCreateSchema`)

```
clienteId: string (trim, min 1)          negocioId?: string
canal?: 'PUNTO' | 'DOMICILIO' = 'DOMICILIO'
origen?: OrigenPedido = 'PEDIDO'
items: [{ producto, cantidad>=0, precioManual?>0 }]  (min 1)
pagos?: [{ metodo: MetodoPago, monto>=0 }]           (vacío/ausente = fiado)
obs?: string(<=500)   fechaEntrega?: string
direccionEntrega?: string(<=200)  barrioEntrega?: string(<=100)  (snapshot del pedido)
offlineId?: string
clienteNuevo?: { nombre, telefono, direccion?, barrio?, ... }
actualizarCliente?: { direccion, barrio }
ventaRapida?: boolean   tipo?: 'ENVIO'|'PUNTO'   productos?: {...}   (LEGACY)
```

Flujo: resolver/crear cliente → canónico `CONSUMIDOR_FINAL` para venta anónima →
resolver precios (`IPricingPort`, dentro de la tx) → aplicar `Cliente.saldoFavor` →
guard de fiado **solo si `totalPagado < total`** (`CLIENTE_DEBE`) → crear `Pedido`
+ `PedidoItem[]` + `Pago[]` + `Factura` (`FAC-#####`) → `logAudit` → `ReceivableEntry`
(si `totalPagado > 0`).

---

## 5. Pricing

Motor: `src/lib/pricing.ts` (+ copia pura en `pricing-algorithm.service.ts`).
Prioridad: `manual > preciosEspeciales (negocio → cliente, por canal) > tier de
volumen (PrecioVolumen) > Producto.precioBase > 0`; luego sobrecosto domicilio
(`Producto.aplicaDomicilio` + `sobreCostoDomicilio`).

- `POST /api/precios/resolver` — `requirePermission('view:productos')` (bloquea REPARTIDOR).
  Body: `items[]` o `codigo/cantidad`, `canal?`, `clienteId?`, `negocioId?`.
- Consumido por `CrearPedidoUseCase`/`ActualizarPedidoUseCase` vía `PrismaPricingAdapter`
  (dentro de la tx del pedido). `venta-libre` y `recurrentes` usan `resolverPreciosPedido`
  de `@/lib/pricing` directo.
- El repartidor no cambia precios si `Config.BLOQUEAR_PRECIOS_REPARTIDOR`.
- No hay precios hardcodeados en el código de pedidos (los pesos en `enviar` son
  para capacidad, no dinero).

---

## 6. Entrega y faltante

`EntregarPedidoUseCase` (lock `SECUENCIA:pedido`):
- `pedido.puedeEntregar()` o `TRANSICION_INVALIDA`.
- Recalcula `total` desde subtotales entregados, recorta `totalPagado` a
  `min(totalPagado, nuevoTotal)`, `estadoPago = fromTotals(...)`, estampa
  GPS/foto/`entregadoAt`/`codigoVisita`/`entregaOfflineId`.
- **Entrega parcial**: si algún `item.faltante > 0` → crea un **pedido-hijo**
  `PENDIENTE` (`idOrigen = padre.id`, `obs = "Faltante de pedido #N"`, hereda
  `negocioId`/`direccionEntrega`). No hay modelo dedicado de pedido-hijo.
- El cierre de embarque (`CerrarEmbarqueUseCase`) también transiciona
  `EN_RUTA → ENTREGADO | NO_ENTREGADO` y crea el pedido-hijo del faltante.

`AjustarPedidoCantidadUseCase` (lock `PEDIDO:{id}`): registra un
`PedidoCantidadAjuste` (con `autorizadoPorId` obligatorio) — **no muta
`PedidoItem` ni los totales** (VERIFICAR — G11: ¿corrección declarada vs demanda nueva?).

---

## 7. Cobro de cartera ≠ venta

- `POST /api/pedidos/pagar-fiado` — recibe dinero contra deuda existente. Lock
  `CARTERA:{clienteId}`. FIFO sobre `pedido.saldo > 0 && estadoEntrega != ANULADO`
  ordenado por `fecha asc`. Crea `Pago` (por pedido) + `Abono` contable
  (`ABO-#####`) + `ReceivableEntry`. **No crea demanda nueva.**
- `POST /api/abonos` — abono contra una factura concreta (oficina, `/facturas`).
  Guard: `pedido.estadoEntrega === 'ENTREGADO'` (`PEDIDO_NO_ENTREGADO` → 400).
  Idempotente por `Abono.offlineId` (G1).
- El sobrante de pago va a `Cliente.saldoFavor` en `CrearPedidoUseCase`;
  `pagar-fiado` hoy solo lo reporta en `montoSobrante` (deuda menor).

---

## 8. Anulación / cancelación

- `AnularPedidoUseCase` — solo desde `ENTREGADO`. `estadoEntrega=ANULADO`,
  `estadoPago=ANULADO`, `totalPagado=0`, factura → `ANULADA`, `NotaCredito`
  (`NC-#####`) por el monto cobrado si hubo pagos.
- `CancelarPedidoUseCase` — desde `PENDIENTE|EN_RUTA|NO_ENTREGADO`.
  `estadoEntrega=CANCELADO`, `estadoPago=ANULADO`, `total=0`, `totalPagado=0`, NC si hubo pagos.
- **Deuda conocida (F7 → G2)**: ninguno de los dos revierte las filas `Pago` ni
  genera `ReceivableEntry` de reversión (`ReceivableTipo` está cerrado en
  `PAGO|ABONO`). Se cierra con el corpus de corrección de abonos
  (`docs/abonos-correccion/`, Fase 2).

---

## 9. Venta libre / venta en ruta

`origen = VENTA_LIBRE` es el mecanismo (no hay modelo `VentaLibre` ni `VentaEnRuta`).
Dos caminos, **ambos fuerzan `estadoEntrega = ENTREGADO`** hoy:
- `POST /api/pedidos/venta-libre` (en vivo, en ruta) — `canal` forzado `DOMICILIO`,
  cliente anónimo/no-fiable debe pagar completo (`PAGO_COMPLETO_OBLIGATORIO`).
  Timestamps `occurredAt`/`capturedAt`/`serverReceivedAt` + `clasificacionTemporal`
  (`NORMAL|TARDIA|SOSPECHOSA`, `src/lib/venta-libre-clasificacion.ts`).
- `CrearVentasLibresService` (capturadas durante el cierre de embarque).

> F4 / `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` (Fase 2): permitir venta en ruta con
> entrega posterior + `Pedido.embarqueOrigenId` persistente (hoy el contexto de
> embarque se pierde al reasignar en `NO_ENTREGADO`).

---

## 10. UI — `src/app/(app)/pedidos/`

- `page.tsx` (SC) + `pedidos-client/index.tsx` (~2500 líneas). Tabs `hoy` / `fiados` / `alertas`.
- Carga por caché: `GET /api/pedidos?all=true&pageSize=500`, filtros resueltos en memoria.
- Query params (AGENTS.md #13): filtros persistentes (`clienteId`, `desde`, `hasta`,
  `search`, `tab`, `tipo`, `origen`, `estadoEntrega`, `estadoPago`); triggers
  (`new=1&clienteId=&negocioId=`, `openPedido=`, `atrasados=true`, `enRiesgo=true`)
  se limpian tras aplicarse.
- Acciones contextuales por fila según `estadoEntrega` (leer `TRANSICIONES_ENTREGA`).
- Formulario activo: `src/components/pedido-form-unified/`.
- Badges de pago en UI: `visual-states.ts` / `getEstadoPagoBadge` derivan un estado
  de **presentación** (PAGADO/FIADO/PENDIENTE/ANULADO) que no siempre coincide con
  la columna `estadoPago` — se unifica en G7.

---

## 11. Offline

`fetchResilient` (`src/lib/fetch-resilient.ts`) → `{status: 'ok'|'offline'|'error'}`.
2xx → ok; 4xx/5xx → error (NO se encola); network/timeout → offline (se encola en
`requestQueue` de Dexie). `syncWithServer` (`src/lib/db/sync.ts`) drena FIFO: 200 →
delete+synced, 409 → delete+conflict (dedup OK), otro 4xx → DLQ, 5xx → retry con backoff.
Toasts: `success` (online), `info` (encolado), `error` (lógica).

---

## 12. Tests

- Unit: `src/modules/pedidos/**/__tests__/`, `src/app/api/pedidos/**/__tests__/`
  (varios son inspección de fuente sobre el `route.ts`), `src/__tests__/pedido-utils.test.ts`.
- Integración (Postgres): `src/lib/__tests__/integration/` — `pedido-idempotencia`,
  `ajuste-pedido`, `receivable-entry`, `abono-idempotencia`, `locks`, `enviar-concurrencia`.
- E2E: `e2e/ciclo-pedido-completo.spec.ts`, `ciclo-repartidor.spec.ts`,
  `fiados-trazabilidad.spec.ts`, `race-conditions/*`, `offline-*`, `abonos.spec.ts`.
- Matriz `OC-01…OC-24` (ALS §40) → mapeo pendiente en Fase 4.
