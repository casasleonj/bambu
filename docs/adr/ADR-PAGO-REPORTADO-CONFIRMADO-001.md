# ADR-PAGO-REPORTADO-CONFIRMADO-001 — Pago reportado vs. confirmado

- Estado: **Aceptado** (aprobado por el PO el 2026-09-01, incluida la decisión "confirma un usuario designado vía Config")
- Fecha: 2026-08-31 (aprobado 2026-09-01)
- Fuente: ALS Operación Comercial §9; Plan Técnico §17; AC-05; INVENTARIO §G4
- Fase de implementación: FASE 2 (Pedidos). Aditivo — no bloquea Fase 1.
- Decisión de producto tomada (PO, 2026-08-31): **confirma un usuario designado**, definido en `Config` (`USUARIO_CONFIRMA_PAGOS` = `userId`). No es "cualquier ADMIN" ni un rol.

## Contexto

Cuando un cliente dice *"ya te envié los $23.000 por Nequi"* y el repartidor/asistente
registra el pago, el sistema hoy lo trata igual que un pago verificado: la UI
muestra "Pagado", el saldo baja, la cartera se actualiza. No hay forma de
distinguir:

```
PAGO REPORTADO   (alguien dijo que pagó)
      ≠
PAGO CONFIRMADO  (se verificó que el dinero entró)
```

Esto genera falsos positivos y disputas (AC-05: "un pago reportado no se
presenta como confirmado sin evidencia"). El caso central es **digital**
(Nequi / transferencia / Daviplata); el efectivo tiene su propia conciliación
(custodia del repartidor → cierre de embarque → `ResponsibilityCase FALTANTE_CAJA`).

`Pago` hoy (`schema.prisma:837-858`): `id`, `pedidoId`, `metodo`, `monto`,
`offlineId` (índice), `createdAt`. Sin actor, sin estado de confirmación.

## Decisión

### 1. `Pago` gana un estado de confirmación

```prisma
enum EstadoConfirmacionPago {
  REPORTADO
  CONFIRMADO
  DISCREPANTE
}

model Pago {
  // ...
  confirmacion     EstadoConfirmacionPago @default(REPORTADO)
  confirmadoPorId  String?
  confirmadoPor    User?    @relation("PagoConfirmador", fields: [confirmadoPorId], references: [id], onDelete: SetNull)
  confirmadoAt     DateTime? @db.Timestamptz()
  discrepanciaNota String?   @db.Text

  @@index([confirmacion])
}
```

### 2. Qué métodos nacen `REPORTADO` vs `CONFIRMADO`

| Método | Estado inicial | Razón |
|---|---|---|
| `NEQUI`, `TRANSFERENCIA`, `DAVIPLATA` | `REPORTADO` | requiere ver la cuenta / notificación del banco |
| `EFECTIVO`, `BONO` | `CONFIRMADO` | el efectivo físico entra a la custodia del repartidor; la conciliación es el cierre de embarque + `FALTANTE_CAJA`, no este flujo |

Configurable: `Config.METODOS_REQUIEREN_CONFIRMACION` (CSV, default `NEQUI,TRANSFERENCIA,DAVIPLATA`) por si el negocio cambia el criterio.

### 3. Quién confirma — un usuario designado

- `Config.USUARIO_CONFIRMA_PAGOS` = `userId` (string). Es **una persona concreta**
  (quien revisa la app del banco / Nequi), no un rol.
- Solo ese usuario:
  - ve `GET /api/pagos/por-confirmar` — cola de `Pago` con `confirmacion = REPORTADO`,
    enriquecida (cliente, pedido, monto, método, cuándo, quién lo registró).
  - puede `POST /api/pagos/[id]/confirmar` con `{ resultado: 'CONFIRMADO' | 'DISCREPANTE', nota? }`.
- Si `USUARIO_CONFIRMA_PAGOS` no está seteado → la cola no se muestra a nadie y
  los pagos quedan `REPORTADO` indefinidamente (la UI los muestra como "reportado",
  nunca como "confirmado"). No bloquea la operación.
- Auth del endpoint: `requireAuth()` + guard explícito `session.user.id === Config.USUARIO_CONFIRMA_PAGOS` (403 si no). Documentado como excepción al patrón `requireRole`.

### 4. Efecto de `DISCREPANTE`

`resultado = DISCREPANTE` (el dinero no entró, o entró un monto distinto):
- `Pago.confirmacion = DISCREPANTE` + `discrepanciaNota`.
- **NO** se revierte el `Pago` automáticamente (P4 — hecho histórico no destructivo;
  la reversión real es el flujo de G2 / corrección de abonos).
- Se crea un `ResponsibilityCase` tipo `PAGO_NO_CONFIRMADO` (nuevo valor del enum
  `tipo` de `ResponsibilityCase`) — `embarqueId?` nullable, `montoEstimado = pago.monto`,
  pendiente de resolución autorizada (ADR-RESPONSABILIDAD-001: la transferencia
  económica de la deuda nunca es automática).
- Métrica `pago_discrepante_count`.

### 5. La UI nunca afirma "confirmado" sin evidencia (AC-05)

- Badge de pago en pedido/factura: un pago `REPORTADO` se muestra como
  **"Reportado"** (ámbar), no "Pagado". El pedido puede tener `estadoPago = PAGADO`
  (saldo 0) y aún así mostrar "pago reportado, sin confirmar" si algún `Pago` está `REPORTADO`.
- `EstadoPago` (la dimensión de saldo) **no cambia**: sigue derivándose de
  `(total, totalPagado)`. La confirmación es una **cuarta señal** ortogonal, a
  nivel de `Pago` individual, no de `Pedido`.

### 6. Caja / cierre

- `/api/cierre` sigue sumando **todos** los `Pago` por método (comportamiento
  actual — no se rompe el cuadre).
- Se **añade** al `reporte` del cierre un desglose `porConfirmar` (monto de pagos
  `REPORTADO` del día por método). Informativo, no altera `netoCaja`.
- Decisión abierta para el PO: ¿el cierre debe **bloquearse** si hay pagos
  `REPORTADO` de días anteriores sin resolver? Propuesta: **no bloquear**, solo
  advertir (consistente con la decisión D7 de embarques). 

## Alcance

- **Dentro:** schema (`Pago` + enum + `ResponsibilityCase.tipo`), endpoints
  `/api/pagos/por-confirmar` (GET) y `/api/pagos/[id]/confirmar` (POST), badges de
  pago en pedido/factura/cartera, sección "Pagos por confirmar" en el dashboard
  del usuario designado, `Config` (2 claves).
- **Fuera:** reversión/corrección de pagos (G2); integración real con API de
  Nequi/banco (esto es confirmación **manual**); efectivo/custodia (ya cubierto
  por cierre + `FALTANTE_CAJA`); confirmación de `Abono` (mismo modelo aplicaría,
  pero se difiere hasta que G2 defina el modelo de cartera).

## Migración

1. `CREATE TYPE "EstadoConfirmacionPago"` + `ALTER TABLE "Pago" ADD COLUMN ...`
   (default `REPORTADO`) + columnas nullable + índice. Aditiva, reversible.
2. **Backfill** (ADR-MIGRACION-001): todos los `Pago` **anteriores a la migración**
   → `confirmacion = CONFIRMADO`, `confirmadoPorId = NULL`, `confirmadoAt = createdAt`.
   Racional: son pagos ya conciliados por cierres pasados; marcarlos `REPORTADO`
   inundaría la cola con miles de pagos históricos sin valor. **Esto no es
   "inventar historia"** — es el default seguro para hechos ya asentados; la
   ausencia de `confirmadoPorId` deja claro que fue backfill, no una confirmación real.
3. Agregar `PAGO_NO_CONFIRMADO` al enum/valores de `ResponsibilityCase.tipo`
   (hoy es `String` con `DISCREPANCIA_INVENTARIO | FALTANTE_CAJA | FIADO_NO_COBRADO`).
4. `Config` seed opcional: `METODOS_REQUIEREN_CONFIRMACION = 'NEQUI,TRANSFERENCIA,DAVIPLATA'`.
   `USUARIO_CONFIRMA_PAGOS` se setea manualmente por el ADMIN (no seed).

## Concurrencia / idempotencia

- `POST /api/pagos/[id]/confirmar`: `withAdvisoryLock('PEDIDO', pago.pedidoId)` (o
  `PAGO:{id}` si se agrega el namespace). Idempotente por estado: si el `Pago`
  ya está `CONFIRMADO`/`DISCREPANTE` → `deduped: true` (200) sin re-ejecutar.
- El confirmador está en un escritorio (online); no se agrega `offlineId`
  persistido salvo que el uso lo pida.
- `logAudit(entry, tx)` dentro de la transacción (F1).

## Rollback

`git revert` + `DROP COLUMN` × 4 + `DROP TYPE`. Feature flag
`NEXT_PUBLIC_PAGO_CONFIRMACION` (default OFF): con OFF, no se crean las columnas
de estado en la UI, los badges muestran "Pagado" como hoy, la cola no aparece.
El backfill deja los datos consistentes si se reactiva.

## Tests obligatorios

- `OC-20` pago reportado no confirmado: se registra un pago Nequi → `REPORTADO`;
  la UI no dice "confirmado"; el usuario designado lo confirma → `CONFIRMADO`.
- Pago `EFECTIVO` → `CONFIRMADO` directo.
- `DISCREPANTE` → crea `ResponsibilityCase PAGO_NO_CONFIRMADO`, no revierte el `Pago`.
- Un usuario que NO es `USUARIO_CONFIRMA_PAGOS` → 403 en `/confirmar` y no ve la cola.
- `USUARIO_CONFIRMA_PAGOS` sin setear → nadie ve la cola, pagos quedan `REPORTADO`,
  operación no se bloquea.
- Concurrencia: dos `confirmar` del mismo `Pago` → uno gana, el otro `deduped`.
- Backfill: un `Pago` pre-migración queda `CONFIRMADO` con `confirmadoPorId = NULL`.
- Regresión: con el flag OFF, badges y `/api/cierre` idénticos a hoy.

## Consecuencias

- Nuevo concepto transversal ("confirmación") a nivel de `Pago`. Se documenta en
  `.claude/specs/pedidos.md` §1 como la señal ortogonal que es (no una 4ª
  dimensión de `Pedido`).
- El dashboard del usuario designado gana una sección "Pagos por confirmar".
- `ResponsibilityCase` gana un cuarto tipo — el panel de excepciones de embarque
  (`mission-detail`) ya lo renderiza genéricamente, pero `PAGO_NO_CONFIRMADO`
  puede no tener `embarqueId` → aparece solo en un listado global de casos.
