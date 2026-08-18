# ADR-IDEMPOTENCIA-001 — Idempotencia y claves offline

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §14
- Fase de implementación: FASE 1

## Contexto

Todo comando reintentable offline debe producir el mismo resultado lógico en un retry, sin duplicar hechos.

## Decisión

- Todo comando reintentable offline tiene una clave idempotente (`offlineId @unique`).
- Cuando un comando puede generar múltiples hechos relacionados, se distingue `offlineId` (comando individual) de `batchId` (batch compartido).
- No se asume que un `offlineId` compartido implique semántica idéntica para todas las filas.

Reglas:

```
mismo comando + mismo offlineId  → mismo resultado lógico → cero duplicación
offlineId diferente              → comandos distintos
```

## Estado de implementación (FASE 1 completada)

- ✅ **`entrega` / `anular` / `cancelar`**: persisten claves idempotentes dedicadas — `Pedido.entregaOfflineId`, `Pedido.anulacionOfflineId`, `Pedido.cancelacionOfflineId` (todas `@unique`, migración `20260817_add_pedido_idempotencia_offline`). El retry con el mismo `offlineId` retorna `deduped:true` por clave (además del dedup por estado).
- ✅ **`produccion`**: el dedup por `offlineId` se movió **dentro del lock** (antes corría con el cliente global fuera del `$transaction` → race residual → P2002 → 409 no idempotente). Ahora el retry concurrente retorna el registro existente con `deduped:true`.
- ✅ **`logAudit(entry, tx)`**: dentro de locks, la auditoría se escribe en la **misma transacción** (antes usaba el cliente global en otra conexión auto-commit → alargaba la tenencia del lock y podía dejar filas fantasma si rollback). Si la auditoría falla dentro de la tx, re-lanza para rollback atómico.
- ⏳ **`Embarque.offlineId`**: se mantiene single-slot (decisión preexistente documentada en AGENTS.md). El PUT es idempotente de hecho (`updateMany` con guard `embarqueId:null`); el DELETE es idempotente por status check (`CANCELADO`). La migración a dedup real por tabla de idempotencia se difiere a FASE 8.
- ⏳ **`gps-track`**: sin clave idempotente persistida. Es telemetría best-effort (no un hecho crítico de negocio); se difiere a FASE 7 con VentaLibre/offline.
- ⏳ **`deudas`**: sin clave idempotente. Es CRUD admin síncrono (no offline-first del repartidor rural).

## Estado de implementación (FASE FINAL)

- ✅ **`gps-track`**: se añadió `GpsTrack.offlineId @unique` y el endpoint hace dedup (retry con el mismo offlineId retorna el track existente).

## Verificación

Tests §20 "Concurrencia": retry concurrente del mismo `offlineId` — `src/lib/__tests__/integration/pedido-idempotencia.test.ts` (entrega/anular/cancelar, 1 gana + 1 deduped, clave persistida) + `src/app/api/produccion/__tests__/route.test.ts` (dedup dentro del lock).
