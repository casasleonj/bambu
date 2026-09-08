# Contrato de API — Pedidos (Fase 2 del rediseño integral)

- **Estado:** Aceptado — entregable de Fase 2 (`00-plan-frontend-rediseno-integral.md`)
- **Fecha:** 2026-09-06
- **Alcance:** formaliza la tabla de endpoints de §1.2 del plan de rediseño + los 3 endpoints nuevos de N2 (D4). Autoridad = el código real (`route.ts`), este documento es su reflejo, no al revés — si diverge, el código gana y este documento se corrige.

## Endpoints existentes

Ver `docs/pedidos/00-plan-frontend-rediseno-integral.md` §1.2 — tabla completa (18 endpoints), no se duplica aquí.

## Endpoints nuevos (Fase 2, D4)

Los 3 casos de uso de N2 (`GestionarPendienteUseCase`, `CambiarModoActividadUseCase`, `LiberarActividadUseCase`) existían probados contra Postgres real desde su implementación original, pero sin ruta HTTP — la gestión de pendiente nunca tuvo forma de invocarse fuera de un test. Estos son sus primeros endpoints.

### `POST /api/pedidos/[id]/gestionar-pendiente`

Crea una `ObligacionPendiente` + `Actividad` a partir del remanente de un `PedidoItem`. Nunca automático — requiere una acción explícita (ALS §2, A2: intent ≠ command ≠ mutation).

- **Rol:** ADMIN, ASISTENTE
- **Lock:** `PEDIDO:{id}` (mismo agregado que `ActualizarPedidoUseCase`/`EntregarPedidoUseCase`)
- **Idempotencia:** `offlineId` (dedup dentro del lock)

```ts
// Request
{
  producto: 'PACA_AGUA' | 'PACA_HIELO' | 'BOTELLON' | 'BOLSA_AGUA' | 'BOLSA_HIELO'
  cantidad: number        // entero positivo, <= remanente (cantPedido - cantEntrega)
  modoInicial: 'PUNTO' | 'DOMICILIO'
  motivo?: string
  offlineId?: string
}

// Response 201 (nuevo) / 200 (deduped)
{
  obligacionId: string
  actividadId: string
  deduped: boolean
  diferencial?: { valorHistorico: number; valorActual: number; diferencial: number }
}
```

| Error del use case | HTTP | Causa |
|---|---|---|
| `PEDIDO_NOT_FOUND` | 404 | El pedido no existe |
| `PEDIDO_ITEM_NOT_FOUND: {producto}` | 404 | El pedido no tiene ese producto |
| `CANTIDAD_EXCEDE_PENDIENTE: ...` | 409 | La cantidad solicitada supera el remanente |
| `OBLIGACION_YA_ACTIVA: ...` | 409 | Ya hay una gestión `ABIERTA` de ese producto para este pedido |

### `POST /api/actividades/[id]/cambiar-modo`

Cambia el modo (`PUNTO`↔`DOMICILIO`) de una `Actividad` ya creada, antes de que se ejecute. Recalcula el diferencial en vivo contra el modo destino — nunca reusa un valor de preview mostrado antes (ALS, hallazgo adversarial #2).

- **Rol:** ADMIN, ASISTENTE
- **Lock:** `OBLIGACION:{obligacion de la actividad}`
- **Idempotencia:** `offlineId` (sufijo `:cambio-modo`); no-op idempotente si `modoDestino` == modo actual.

```ts
// Request
{
  modoDestino: 'PUNTO' | 'DOMICILIO'
  motivo?: string
  offlineId?: string
}

// Response 200
{
  actividadId: string
  modoAnterior: 'PUNTO' | 'DOMICILIO'
  modoNuevo: 'PUNTO' | 'DOMICILIO'
  deduped: boolean
  diferencial?: { valorHistorico: number; valorActual: number; diferencial: number }
}
```

| Error del use case | HTTP | Causa |
|---|---|---|
| `ACTIVIDAD_NOT_FOUND` | 404 | La actividad no existe |
| `PEDIDO_NOT_FOUND` | 404 | El pedido asociado no existe (dato inconsistente) |
| `PEDIDO_ITEM_NOT_FOUND: {producto}` | 404 | El item asociado no existe |
| `ACTIVIDAD_NO_MODIFICABLE: ...` | 409 | La actividad no está `ASIGNADA` ni `EN_PROGRESO` |
| `ACTIVIDAD_SIN_MODO` | 409 | La actividad no tiene un modo inicial asignado |

**Límite conocido (documentado en el use case, no en el endpoint):** un diferencial negativo previo ya acreditado a `Cliente.saldoFavor` no se revierte automáticamente al volver a cambiar de modo — solo se revierte lo reflejado en `Pedido.total`.

### `POST /api/actividades/[id]/liberar`

Cancela una gestión de pendiente antes de que se ejecute. Revierte lo aplicado a `Pedido.total` (nunca lo acreditado a `saldoFavor`, mismo límite que `cambiar-modo`).

- **Rol:** ADMIN, ASISTENTE
- **Lock:** `OBLIGACION:{obligacion de la actividad}`
- **Idempotencia:** `offlineId` (sufijo `:liberar`); dedup también por estado (`CANCELADA` ya = no-op).

```ts
// Request
{
  motivo: string   // obligatorio (ALS A8: no silent mutation — toda liberación exige justificación)
  offlineId?: string
}

// Response 200
{
  actividadId: string
  obligacionId: string
  obligacionAnulada: boolean   // true si no queda ninguna otra Actividad activa
  montoRevertido: number
  deduped: boolean
}
```

| Error del use case | HTTP | Causa |
|---|---|---|
| `ACTIVIDAD_NOT_FOUND` | 404 | La actividad no existe |
| `PEDIDO_NOT_FOUND` | 404 | El pedido asociado no existe (dato inconsistente) |
| `ACTIVIDAD_NO_MODIFICABLE: ...` | 409 | La actividad no está `ASIGNADA` ni `EN_PROGRESO` (y no está ya `CANCELADA`) |

## Principios que rige este contrato (ALS §9-10, aplicados a los 3 endpoints nuevos)

- Ninguno de los 3 recalcula precio/diferencial en el cliente — el backend es la única autoridad, siempre recalculado fresco dentro de la transacción del lock.
- Ninguno es destructivo — `liberar` cancela (no borra), `cambiar-modo` conserva el histórico de la actividad original.
- Los 3 exigen rol ADMIN/ASISTENTE — no hay acción de N2 accesible a REPARTIDOR/CONTADOR/CONSUMIDOR_FINAL en esta fase.
- Los 3 son idempotentes por `offlineId`, listos para offline-first (`fetchResilient`) cuando se cableen a UI en Fase 5.

---

## Endpoint nuevo (Fase 4 / prerequisito del blueprint — BRECHA §9.1 de `03-blueprint-experiencia-hub.md`)

### `POST /api/pedidos/preview`

**Estado:** ✅ **implementado** (rama `feat/pedidos-preview-endpoint`, stack sobre PR #220). Ruta: `src/app/api/pedidos/preview/route.ts`; use case: `src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts` (compuesto en `previewPedidoUseCase`). Plan ejecutado: `docs/pedidos/fase4-preview-endpoint-plan.md`. Verificado: 28 unit + 2 integración (read-only comportamental + proyección == commit campo a campo) + smoke en vivo contra el dev server.

Prepara una operación de **creación de pedido** sin persistir: calcula precios/total, proyecta virtualmente pagos/saldo/estado usando las reglas existentes, evalúa permisos y acciones disponibles, corre las reglas de riesgo detectivas contra el draft, y determina si requiere autorización. **No** crea `Pedido`/`PedidoItem`/`Factura`/`Pago` ni ninguna fila; **no** crea ni modifica `Cliente`; **no** toma lock; **no** abre transacción de escritura; **no** usa `offlineId` (read-only). El commit real (`POST /api/pedidos`) sigue siendo la autoridad final y recalcula/revalida todo.

- **Rol:** ADMIN, ASISTENTE (idéntico a `POST /api/pedidos`).
- **Lock:** ninguno.
- **Alcance:** cubre la **creación de `Pedido`** (`origen ∈ {PEDIDO, VENTA_RAPIDA}`). **`VENTA_LIBRE` queda fuera de esta brecha** — su captura se rediseñará cuando corresponda; el tipo histórico `VENTA_LIBRE` del dominio **no se toca ni se altera** por esto. El preview de venta rápida/libre para REPARTIDOR también queda fuera.
- **Autoridad reutilizada (cero lógica de negocio nueva):**
  - precios → `IPricingPort.loadPricingContext` + `resolverPrecios` (el mismo que usa `CrearPedidoUseCase`)
  - pagos / saldo / excedente → `normalizarPagos`, `calcularSaldo`, `calcularEstadoPago` (`src/modules/pedidos/domain/services/pagos-calculator.service.ts`)
  - proyección de `estadoPago` → `EstadoPagoVO.proyectar(total, totalPagado, estadoEntregaProyectado)`, accessor `.get()` (`src/modules/pedidos/domain/value-objects/EstadoPago.ts`)
  - crédito/fiado → `getFiadoStatusUseCase` (ya compuesto y exportado en `src/modules/pedidos`), que internamente usa `resolverLimiteFiados` + `getEstadoFiados`
  - acciones → derivadas de permisos + estado proyectado (heurística §1.3 del blueprint)
  - riesgo → `calcularAlertasCliente(cliente, [...últimos5PedidosVálidos, draftSintetico], { precioMinimos })` (`src/lib/alertas-detector.ts` — no toca Prisma; **ya excluye `CONSUMIDOR_FINAL` explícitamente** — se reutiliza esa autoridad)

```ts
// Request — subconjunto de PedidoCreateSchema, SIN campos de persistencia
// (offlineId, clienteNuevo, actualizarCliente, direccionEntrega, barrioEntrega, productos legacy)
{
  clienteId: string                         // requerido; 'CONSUMIDOR_FINAL' válido (= ausencia de cliente real)
  negocioId?: string
  canal?: 'PUNTO' | 'DOMICILIO'             // default 'DOMICILIO'
  origen?: 'PEDIDO' | 'VENTA_RAPIDA'         // default 'PEDIDO' — VENTA_LIBRE fuera de alcance
  items: Array<{ producto: 'PACA_AGUA'|'PACA_HIELO'|'BOTELLON'|'BOLSA_AGUA'|'BOLSA_HIELO'; cantidad: number; precioManual?: number }>   // min 1
  pagos?: Array<{ metodo: 'EFECTIVO'|'TRANSFERENCIA'|'NEQUI'|'DAVIPLATA'|'BONO'; monto: number }>
  entregado?: boolean                       // venta rápida: proyecta ANTICIPADO vs PAGADO
  pedidoOrigenId?: string                   // G11.B: valida existencia (404 si no)
  pedidoId?: string                         // modo EDICIÓN: preview de un PUT declarativo de items (404 si no existe)
}
```

**Modo edición (`pedidoId` presente) — Composición C4:** el PUT `/api/pedidos/[id]` (`ActualizarPedidoUseCase`) es **declarativo de items** y conserva los pagos existentes. En este modo el preview:
- carga el pedido existente; `totalPagado` sale de **ahí**, no de `pagos` (que se **ignoran**); `saldoFavorProyectado = 0`.
- proyecta `estadoPago` contra el **`estadoEntrega` actual** del pedido (no `'PENDIENTE'`) — igual que el PUT.
- **no consulta ni bloquea por límite de fiados** (es un guard de alta, no de edición).
- mantiene `riskSignals` (cambiar precio/cantidad en un pedido existente ES un vector), pero **excluye el propio pedido** del historial de comparación.
- `allowedActions = ['actualizar']` (nunca `'crear'`); `auditPreview.accion = 'ACTUALIZAR_PEDIDO'`, `recurso = 'Pedido (edición)'`.

#### Semántica de cálculo (definición normativa)

| Campo | Definición |
|---|---|
| `precioUnitario` | precio final resuelto por Pricing — **ya incluye el recargo de domicilio** cuando `canal=DOMICILIO` y el producto `aplicaDomicilio` |
| `subtotalItem` (`items[].subtotal`) | `precioUnitario × cantidad` |
| `total` | `Σ subtotalItem` |
| `recargoDomicilio` | `Σ (sobreCostoDomicilio_producto × cantidad)` sobre los productos con `aplicaDomicilio=true`, **solo cuando `canal=DOMICILIO`**; `0` en `PUNTO` |
| `subtotal` | `total − recargoDomicilio` (el monto equivalente sin el recargo) |
| identidad | `total = subtotal + recargoDomicilio` |

El recargo **no se suma otra vez** sobre el precio ya resuelto: `precioUnitario` lo trae incorporado; `recargoDomicilio` es solo el desglose informativo de cuánto de ese total corresponde al recargo.

Pagos (proyección virtual, sin efecto):

| Campo | Definición |
|---|---|
| `pagosNormalizados` | `normalizarPagos(request.pagos, total).pagosAplicados` |
| `totalPagado` | `Σ pagosNormalizados.monto` |
| `saldoProyectado` | `calcularSaldo(total, totalPagado)` = `max(0, total − totalPagado)` |
| `saldoFavorProyectado` | `normalizarPagos(request.pagos, total).excedente` — lo que en el commit iría a `Cliente.saldoFavor` |
| `estadoEntregaProyectado` | `'ENTREGADO'` sólo si `entregado === true`; si no `'PENDIENTE'` |
| `estadoPagoProyectado` | `calcularEstadoPago(total, totalPagado, estadoEntregaProyectado)` |

```ts
// Response 200 — forma del Plan Técnico §13
{
  calculation: {
    items: Array<{
      producto: string
      cantidad: number
      precioUnitario: number                 // ya incluye recargo domicilio si aplica
      subtotal: number                       // precioUnitario × cantidad
      precioOrigen: 'manual' | 'cliente' | 'volumen' | 'base'
    }>
    subtotal: number                         // total − recargoDomicilio
    recargoDomicilio: number
    total: number                            // Σ items[].subtotal
    totalPagado: number                      // Σ normalizarPagos(...).pagosAplicados
    saldoProyectado: number                  // calcularSaldo(total, totalPagado)
    saldoFavorProyectado: number             // normalizarPagos(...).excedente
    estadoEntregaProyectado: 'PENDIENTE' | 'ENTREGADO'
    estadoPagoProyectado: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANTICIPADO'
  }
  permissions: {
    canCreate: boolean                       // rol OK && cliente no bloqueado && fiado dentro de límite
    canSetManualPrice: boolean               // hoy: true para ADMIN/ASISTENTE (sin política de umbral — PENDIENTE §8.2)
  }
  allowedActions: Array<'crear' | 'crear-y-enviar-a-ruta' | 'actualizar'>  // 'actualizar' en modo edición
  warnings: Array<{ code: string; message: string; field?: string }>
    // FIADO_SOBRE_LIMITE, CLIENTE_BLOQUEADO, DIRECCION_FALTANTE (DOMICILIO sin dirección), PRECIO_MANUAL_APLICADO
  riskSignals: Array<{ tipo: string; severidad: 'BAJA' | 'MEDIA' | 'ALTA'; detalle: string }>
    // de calcularAlertasCliente. Vacío para CONSUMIDOR_FINAL (el detector lo excluye).
  requiresAuthorization: boolean             // SIEMPRE false hoy — se activa cuando exista política de umbral (PENDIENTE §8.2)
  authorizationPolicy?: string
  auditPreview: {
    actor: string                            // userId de la sesión
    accion: 'CREAR_PEDIDO'
    recurso: 'Pedido (nuevo)'
    valoresRelevantes: {
      total: number
      clienteId: string
      canal: string
      origen: string
      tienePrecioManual: boolean
    }
  }
}
```

| Error | HTTP | Causa |
|---|---|---|
| datos inválidos (Zod) | 400 | forma del request |
| no autenticado / rol | 401 / 403 | sesión / `requireRole` |
| `CLIENTE_NOT_FOUND` | 404 | `clienteId` no existe |
| `PEDIDO_ORIGEN_NOT_FOUND` | 404 | `pedidoOrigenId` no existe (G11.B) |
| `PEDIDO_NOT_FOUND` | 404 | `pedidoId` (modo edición) no existe |

#### Historial para riesgo

El preview obtiene los **últimos 5 pedidos válidos** del cliente vía `IPedidoRepository.findMany({ clienteId, estadoEntrega: ['PENDIENTE','EN_RUTA','ENTREGADO','NO_ENTREGADO'] }, { take: 5, orderBy: 'desc' })` (excluye `ANULADO`/`CANCELADO` por inclusión de los estados válidos) y los mapea a la forma legacy que lee `calcularAlertasCliente` vía `Pedido.toLegacyFields()`. **No se crea `findRecentByCliente`.** El límite de 5 coincide con la lógica actual del detector (trabaja con los últimos 5; requiere ≥3 para la mediana de `MONTO_ANOMALO`).

**Principios del contrato:**

- **Read-only garantizado — verificado por comportamiento, no solo por `grep`.** Además del guardrail estático (el route no importa repos de escritura, `PrismaTransactionManager` ni `withAdvisoryLock` ni llama `$transaction`), el test de integración captura el estado de `Pedido`, `PedidoItem`, `Pago`, `Factura` y `Cliente` **antes y después** de `preview` y verifica que no cambió ninguna fila ni ningún campo.
- **`requiresAuthorization` es `false` hoy** para toda creación — no se inventa un umbral (PENDIENTE §8.2). El campo está en el contrato para que el frontend lo consuma; se activa cuando negocio defina la política de precio manual / doble control.
- **`riskSignals` ≠ bloqueo ≠ autorización.** Una señal nunca quita `'crear'` de `allowedActions`. Solo `warnings` derivados del estado de fiado/bloqueo del cliente pueden hacerlo — decisión del backend, no del preview.
- **`CONSUMIDOR_FINAL`** = ausencia de cliente real: sin historial/riesgo antifraude, sin comportamiento comercial de cliente real, sin crear ni modificar cliente. El preview reutiliza la exclusión que `calcularAlertasCliente` ya hace, no la reimplementa.
- **El commit real (`POST /api/pedidos`) revalida y recalcula todo** dentro del lock (OWASP Transaction Authorization: no confiar en datos preparados entre preview y commit). El preview proyecta virtualmente `saldoFavor`, la normalización de pagos y el excedente con las **mismas reglas**, pero **sin ejecutar ningún efecto**.

---

## `GET /api/pedidos/counts` — extendido (Fase 4a del Hub)

Conteos para la cabecera de focos del Pedido Hub (blueprint §2.2). **Aditivo** — los 4 campos previos (`fiadosCount`, `alertasCount`, `atrasadosCount`, `enRiesgoCount`) no cambian.

- **Rol:** ADMIN, ASISTENTE, CONTADOR, REPARTIDOR
- **Un solo request** — todos los conteos en un `Promise.all` (contrato §4.2: máximo un request adicional para conteos).

```ts
// Response 200 (campos nuevos)
{
  // ...previos...
  porPlanificarCount: number      // PENDIENTE con embarqueId null (hoy o atrasados)
  enRutaCount: number             // pedidos con estadoEntrega EN_RUTA
  esperandoPagoTotal: number      // Σ saldo de ENTREGADO con saldo > 0 (excluye CONSUMIDOR_FINAL)
  pendientesN2Count: number       // ObligacionPendiente con estado ABIERTA
}
```

---

## `GET /api/pedidos/[id]` — extendido (Fase 4b del Hub — BRECHA §9.2 resuelta)

Aditivo a la respuesta existente (`{ pedido: { ...PedidoResumenDTO, enrichment } }`). Solo lectura — el GET no toca use cases de escritura ni `$transaction`. Sigue exigiendo `requireOwnership('pedido', id)`.

```ts
// pedido: { ...previo, + }
{
  pendienteN2: {
    id: string; producto: string; remanente: number; estado: string
    actividades: Array<{ id, tipo, cantidad, cantidadCumplida, estado, modo, embarqueId }>
  } | null                                 // ObligacionPendiente (@unique pedidoId)
  embarqueResumen: { id, numeroDia, estado, repartidor } | null
  pedidosVinculados: Array<{ id, numero, rol: 'demanda' | 'origen', total, estadoEntrega }>  // G11.B
  casosAbiertos: Array<{ id, alertaTipo, severidad, status }>   // Caso status ABIERTO|EN_PROCESO
}
```

Tipo: `PedidoPeekExtras` en `src/modules/pedidos/application/dto/index.ts`.
