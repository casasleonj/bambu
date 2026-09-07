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

**Estado:** contrato definido (2026-09-07) — **sin implementar todavía**. Prerequisito de la captura rediseñada (`PedidosWorkspace`) y del Pedido Hub.

Prepara una operación de **creación de pedido** sin persistir: calcula precios/total, evalúa permisos y acciones disponibles, corre las reglas de riesgo detectivas contra el draft, proyecta el estado, y determina si requiere autorización. **No** crea `Pedido`/`Factura`/`Pago` ni ninguna fila; **no** toma lock; **no** abre transacción de escritura; **no** usa `offlineId` (read-only, idempotente por naturaleza).

- **Rol:** ADMIN, ASISTENTE (idéntico a `POST /api/pedidos`). El preview de venta rápida/libre para REPARTIDOR queda fuera del alcance de esta brecha; se agrega cuando esas capturas se rediseñen.
- **Lock:** ninguno.
- **Autoridad reutilizada (cero lógica de negocio nueva):**
  - precios → `IPricingPort.resolverPrecios` (el mismo que usa `CrearPedidoUseCase`; internamente = `lib/pricing`)
  - proyección de estado → `EstadoPagoVO.proyectar(total, totalPagado, estadoEntregaProyectado)` (`src/modules/pedidos/domain/value-objects/EstadoPago.ts`)
  - crédito/fiado → `puedeCrearPedido` + `resolverLimiteFiados` (`src/modules/pedidos/domain/services/pedido-validation.service.ts`)
  - acciones → `pedido-transitions.service.ts`
  - riesgo → `calcularAlertasCliente(cliente, [...pedidosDelCliente, draftSintetico], { precioMinimos })` (`src/lib/alertas-detector.ts` — no toca Prisma)

```ts
// Request — subconjunto de PedidoCreateSchema, SIN campos de persistencia
// (offlineId, clienteNuevo, actualizarCliente, direccionEntrega, productos legacy)
{
  clienteId: string                         // requerido; 'CONSUMIDOR_FINAL' válido
  negocioId?: string
  canal?: 'PUNTO' | 'DOMICILIO'             // default 'DOMICILIO'
  origen?: 'PEDIDO' | 'VENTA_RAPIDA' | 'VENTA_LIBRE'   // default 'PEDIDO'
  items: Array<{ producto: 'PACA_AGUA'|'PACA_HIELO'|'BOTELLON'|'BOLSA_AGUA'|'BOLSA_HIELO'; cantidad: number; precioManual?: number }>   // min 1
  pagos?: Array<{ metodo: 'EFECTIVO'|'TRANSFERENCIA'|'NEQUI'|'DAVIPLATA'|'BONO'; monto: number }>
  entregado?: boolean                       // venta rápida: proyecta ANTICIPADO vs PAGADO
  pedidoOrigenId?: string                   // G11.B: valida existencia (404 si no)
}
```

```ts
// Response 200 — forma del Plan Técnico §13
{
  calculation: {
    items: Array<{
      producto: string
      cantidad: number
      precioUnitario: number
      subtotal: number
      precioOrigen: 'manual' | 'cliente' | 'volumen' | 'base'
    }>
    subtotal: number
    recargoDomicilio: number
    total: number
    totalPagado: number                     // Σ pagos del request
    saldoProyectado: number                 // total - totalPagado
    estadoEntregaProyectado: 'PENDIENTE' | 'ENTREGADO'   // ENTREGADO solo si entregado===true
    estadoPagoProyectado: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANTICIPADO'
  }
  permissions: {
    canCreate: boolean                      // rol OK && puedeCrearPedido (fiado dentro de límite, cliente no bloqueado)
    canSetManualPrice: boolean              // según rol / BLOQUEAR_PRECIOS_REPARTIDOR
  }
  allowedActions: Array<'crear' | 'crear-y-enviar-a-ruta'>   // derivado de estado proyectado + permisos
  warnings: Array<{ code: string; message: string; field?: string }>
    // FIADO_SOBRE_LIMITE, CLIENTE_BLOQUEADO, DIRECCION_FALTANTE (DOMICILIO sin dirección resuelta), PRECIO_MANUAL_APLICADO
  riskSignals: Array<{ tipo: string; severidad: 'BAJA' | 'MEDIA' | 'ALTA'; detalle: string }>
    // de calcularAlertasCliente: PRECIO_POR_DEBAJO_TABLA, MONTO_ANOMALO, CAMBIO_PRECIO_BRUSCO, MULTIPLES_PEDIDOS_RAPIDO, etc.
  requiresAuthorization: boolean            // SIEMPRE false hoy — se activa cuando exista política de umbral (PENDIENTE §8.2 del blueprint)
  authorizationPolicy?: string
  auditPreview: {
    actor: string                          // userId de la sesión
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

**Principios del contrato:**

- **Read-only garantizado.** El route no importa ningún repositorio de escritura, `PrismaTransactionManager` ni `withAdvisoryLock`. Test de contrato: `grep` del archivo + asserción de que no se llama `prisma.$transaction`.
- **`requiresAuthorization` es `false` hoy** para toda creación normal — no se inventa un umbral (PENDIENTE §8.2). El campo está en el contrato para que el frontend ya lo consuma; se activa cuando negocio defina la política de precio manual / doble control.
- **`riskSignals` ≠ bloqueo.** Una señal nunca quita `'crear'` de `allowedActions`. Solo `warnings` derivados de `puedeCrearPedido` (`FIADO_SOBRE_LIMITE`, `CLIENTE_BLOQUEADO`) pueden hacerlo — y esa decisión la toma el backend, no el preview (ALS: señal ≠ bloqueo ≠ autorización).
- **El commit real (`POST /api/pedidos`) revalida todo.** El preview no es autoritativo sobre nada — recalcula en el commit dentro del lock (OWASP Transaction Authorization: no confiar en datos preparados entre preview y commit).
