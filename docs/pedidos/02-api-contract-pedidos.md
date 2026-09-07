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
